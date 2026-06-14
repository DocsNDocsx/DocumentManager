const pool = require('../utils/sql');
const { stripe, computeMonthlyAmountCents, getProductId } = require('../utils/stripe');

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
    if (!customerId) {
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

    const { paymentMethodId, type = 'solo', projects = 1, collaborators = 1, days = 20 } = req.body ?? {};
    if (!paymentMethodId) {
      return res.status(400).json({ success: false, message: 'paymentMethodId is required' });
    }

    const customerId = user.stripe_customer_id;
    const unitAmount = computeMonthlyAmountCents({ projects, collaborators, days });

    // Make the saved card the customer's default for invoices.
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

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
        metadata: {
          userid: String(user.userid),
          type: String(type),
          projects: String(projects),
          collaborators: String(collaborators),
          days: String(days),
        },
        expand: ['latest_invoice.payment_intent'],
      },
      // Guards against duplicate subscriptions if the client retries / returns from 3-D Secure.
      { idempotencyKey: `sub_${user.userid}_${paymentMethodId}` }
    );

    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;

    await pool.query(
      `INSERT INTO stripe_subscriptions
         (userid, stripe_customer_id, stripe_subscription_id, type, projects, collaborators, days, amount, currency, status, current_period_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (stripe_subscription_id) DO UPDATE SET
         status = EXCLUDED.status,
         amount = EXCLUDED.amount,
         current_period_end = EXCLUDED.current_period_end,
         updated_at = CURRENT_TIMESTAMP`,
      [
        user.userid, customerId, subscription.id, type, projects, collaborators, days,
        (unitAmount / 100).toFixed(2), 'usd', subscription.status, periodEnd,
      ]
    );

    await pool.query("UPDATE users SET issubscribed = 'true' WHERE userid = ?", [user.userid]);

    res.json({
      success: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      nextPaymentAt: periodEnd,
    });
  } catch (err) {
    console.error('Create subscription error:', err.message);
    res.status(500).json({ success: false, message: 'Could not create subscription' });
  }
};
