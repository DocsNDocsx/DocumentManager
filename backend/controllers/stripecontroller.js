const pool = require('../utils/sql');
const { stripe, computeMonthlyAmountCents, getProductId, getVoucher, normalizeVoucherCode } = require('../utils/stripe');

const isMySQL = (process.env.DB_CLIENT ?? 'pg') === 'mysql';

// The JWT only carries the user's email, so we resolve the authoritative user
// (and userid) from it here rather than trusting any id sent in the request body.
async function getUserFromToken(req) {
  const email = req.user?.email;
  if (!email) return null;
  const [rows] = await pool.query(
    'SELECT userid, email, firstname, lastname, stripe_customer_id FROM users WHERE email = ?',
    [email]
  );
  return rows[0] ?? null;
}

async function isUsableStripeCustomer(customerId) {
  if (!customerId) return false;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return !customer.deleted;
  } catch (err) {
    if (err?.code === 'resource_missing') return false;
    throw err;
  }
}

/**
 * POST /api/stripe/setup-intent
 * Creates (or reuses) the Stripe Customer for the signed-in user and returns a
 * SetupIntent client secret used to collect and save the card via the Payment Element.
 */
exports.createSetupIntent = async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ success: false, message: 'Payments are not configured' });

    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const name = `${user.firstname ?? ''} ${user.lastname ?? ''}`.trim() || (req.body?.name ?? '');

    let customerId = user.stripe_customer_id;
    if (!(await isUsableStripeCustomer(customerId))) {
      const customer = await stripe.customers.create({
        email: user.email,
        name,
        metadata: { userid: String(user.userid) },
      });
      customerId = customer.id;
      await pool.query('UPDATE users SET stripe_customer_id = ? WHERE userid = ?', [customerId, user.userid]);
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session', // card is charged later for the recurring subscription
    });

    res.json({ success: true, clientSecret: setupIntent.client_secret, customerId });
  } catch (err) {
    console.error('Create setup intent error:', err.message);
    res.status(500).json({ success: false, message: 'Could not create setup intent' });
  }
};

/**
 * POST /api/stripe/tax-estimate
 * Uses Stripe Tax to estimate sales tax from the billing address before the
 * customer submits payment. The final invoice tax is still calculated by Stripe.
 */
exports.estimateTax = async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ success: false, message: 'Payments are not configured' });

    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const amountCents = Number(req.body?.amountCents);
    const billingAddress = req.body?.billingAddress ?? {};
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return res.status(400).json({ success: false, message: 'amountCents must be greater than zero' });
    }
    if (!billingAddress.postalCode || !billingAddress.country) {
      return res.status(400).json({ success: false, message: 'Billing ZIP/postal code and country are required' });
    }

    const product = await getProductId();
    const calculation = await stripe.tax.calculations.create({
      currency: 'usd',
      customer_details: {
        address: {
          line1: billingAddress.line1 || undefined,
          line2: billingAddress.line2 || undefined,
          city: billingAddress.city || undefined,
          state: billingAddress.state || undefined,
          postal_code: billingAddress.postalCode,
          country: billingAddress.country,
        },
        address_source: 'billing',
      },
      line_items: [
        {
          amount: Math.round(amountCents),
          product,
          reference: 'docsndocs_usage',
          tax_behavior: 'exclusive',
        },
      ],
    });

    res.json({
      success: true,
      calculationId: calculation.id,
      taxAmountCents: calculation.tax_amount_exclusive ?? 0,
      totalAmountCents: calculation.amount_total ?? amountCents,
      taxAmount: (calculation.tax_amount_exclusive ?? 0) / 100,
      totalAmount: (calculation.amount_total ?? amountCents) / 100,
    });
  } catch (err) {
    const message = err?.raw?.message || err?.message || 'Could not estimate tax';
    console.error('Tax estimate error:', message);
    res.status(err?.statusCode || 500).json({ success: false, message });
  }
};

/**
 * POST /api/stripe/subscription
 * Attaches the confirmed PaymentMethod as the customer's default and creates the
 * recurring subscription, pricing it server-side from the usage parameters.
 */
exports.createSubscription = async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ success: false, message: 'Payments are not configured' });

    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!user.stripe_customer_id) {
      return res.status(400).json({ success: false, message: 'No payment profile found. Please add a card first.' });
    }

    const {
      paymentMethodId,
      type = 'solo',
      projects = 1,
      collaborators = 1,
      documents = 1,
      days = 20,
      voucherCode,
      projectId,
      billingAddress = {},
    } = req.body ?? {};
    if (!paymentMethodId) {
      return res.status(400).json({ success: false, message: 'paymentMethodId is required' });
    }
    const normalizedVoucherCode = normalizeVoucherCode(voucherCode);
    if (normalizedVoucherCode && !getVoucher(normalizedVoucherCode)) {
      return res.status(400).json({ success: false, message: 'Invalid voucher code' });
    }

    const customerId = user.stripe_customer_id;
    const unitAmount = computeMonthlyAmountCents({
      projects,
      collaborators,
      documents,
      days,
      voucherCode: normalizedVoucherCode,
    });

    // Make the saved card the customer's default for invoices.
    const customerUpdate = {
      invoice_settings: { default_payment_method: paymentMethodId },
    };
    if (billingAddress?.postalCode && billingAddress?.country) {
      customerUpdate.address = {
        line1: billingAddress.line1 || undefined,
        line2: billingAddress.line2 || undefined,
        city: billingAddress.city || undefined,
        state: billingAddress.state || undefined,
        postal_code: billingAddress.postalCode,
        country: billingAddress.country,
      };
    }
    await stripe.customers.update(customerId, customerUpdate);

    const product = await getProductId();

    const subscription = await stripe.subscriptions.create(
      {
        customer: customerId,
        default_payment_method: paymentMethodId,
        items: [
          {
            price_data: {
              currency: 'usd',
              product,
              unit_amount: unitAmount,
              recurring: { interval: 'month' },
            },
          },
        ],
        automatic_tax: { enabled: true },
        metadata: {
          userid: String(user.userid),
          type: String(type),
          projects: String(projects),
          collaborators: String(collaborators),
          documents: String(documents),
          days: String(days),
          projectId: String(projectId || ''),
          voucherCode: normalizedVoucherCode,
        },
        expand: ['latest_invoice.payment_intent'],
      },
      // Guards against duplicate subscriptions if the client retries / returns from 3-D Secure.
      { idempotencyKey: `sub_${user.userid}_${projectId || 'general'}_${paymentMethodId}` }
    );

    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;

    const upsertSubscriptionSql = isMySQL
      ? `INSERT INTO stripe_subscriptions
           (userid, stripe_customer_id, stripe_subscription_id, project_id, type, projects, collaborators, documents, days, amount, currency, status, current_period_end)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           status = VALUES(status),
           amount = VALUES(amount),
           project_id = VALUES(project_id),
           documents = VALUES(documents),
           current_period_end = VALUES(current_period_end),
           updated_at = CURRENT_TIMESTAMP`
      : `INSERT INTO stripe_subscriptions
           (userid, stripe_customer_id, stripe_subscription_id, project_id, type, projects, collaborators, documents, days, amount, currency, status, current_period_end)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (stripe_subscription_id) DO UPDATE SET
           status = EXCLUDED.status,
           amount = EXCLUDED.amount,
           project_id = EXCLUDED.project_id,
           documents = EXCLUDED.documents,
           current_period_end = EXCLUDED.current_period_end,
           updated_at = CURRENT_TIMESTAMP`;

    await pool.query(
      upsertSubscriptionSql,
      [
        user.userid, customerId, subscription.id, projectId || null, type, projects, collaborators, documents, days,
        (unitAmount / 100).toFixed(2), 'usd', subscription.status, periodEnd,
      ]
    );

    await pool.query("UPDATE users SET issubscribed = 'true' WHERE userid = ?", [user.userid]);

    res.json({
      success: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      nextPaymentAt: periodEnd,
      voucherCode: normalizedVoucherCode || null,
    });
  } catch (err) {
    console.error('Create subscription error:', {
      message: err.message,
      type: err.type,
      code: err.code,
      statusCode: err.statusCode,
    });

    const isStripeError = Boolean(err.type || err.rawType || err.statusCode);
    res.status(isStripeError ? 400 : 500).json({
      success: false,
      message: isStripeError ? err.message : 'Could not create subscription',
      code: err.code || null,
    });
  }
};
