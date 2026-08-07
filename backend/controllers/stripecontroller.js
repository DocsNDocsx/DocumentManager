const pool = require('../utils/sql');
const { stripe, computeMonthlyAmountCents, getProductId, getVoucher, normalizeVoucherCode } = require('../utils/stripe');
const { sendPaymentReceiptEmail } = require('../utils/paymentreceipt');

const isMySQL = (process.env.DB_CLIENT ?? 'pg') === 'mysql';
const STRIPE_CARD_PERCENT_FEE = 0.029;
const STRIPE_CARD_FIXED_FEE_CENTS = 30;

function stripeProcessingFeeCents(amountCents) {
  if (amountCents <= 0) return 0;
  return Math.round(amountCents * STRIPE_CARD_PERCENT_FEE + STRIPE_CARD_FIXED_FEE_CENTS);
}

async function recordInitialPayment(user, type, subscription, fallbackAmountCents) {
  const invoice = typeof subscription.latest_invoice === 'object'
    ? subscription.latest_invoice
    : null;
  if (!invoice || (invoice.status && invoice.status !== 'paid')) return;

  const invoiceNo = invoice.number ?? invoice.id;
  if (!invoiceNo) return;

  const [existing] = await pool.query(
    'SELECT id FROM payment_history WHERE invoice_no = ? AND userid = ?',
    [invoiceNo, user.userid]
  );
  if (existing.length > 0) return;

  const paidAtSeconds = invoice.status_transitions?.paid_at ?? invoice.created;
  await pool.query(
    `INSERT INTO payment_history
       (userid, invoice_no, plan, amount, currency, status, payment_method, paid_at, type)
     VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?)`,
    [
      user.userid,
      invoiceNo,
      'Usage subscription',
      (invoice.amount_paid ?? fallbackAmountCents ?? 0) / 100,
      (invoice.currency ?? 'usd').toUpperCase(),
      null,
      paidAtSeconds ? new Date(paidAtSeconds * 1000).toISOString() : new Date().toISOString(),
      type,
    ]
  );
}

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

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

const activeCollaboratorCount = collaborators => parseJson(collaborators, []).filter(c => c?.status !== 'inactive').length;
const activeDocumentCount = documents => parseJson(documents, []).filter(d => d?.status !== 'inactive').length;

function dateIncreaseDays(previousDeadline, currentDeadline) {
  const previous = /^\d{4}-\d{2}-\d{2}/.exec(String(previousDeadline ?? ''))?.[0];
  const current = /^\d{4}-\d{2}-\d{2}/.exec(String(currentDeadline ?? ''))?.[0];
  if (!previous || !current) return 0;
  return Math.max(0, Math.round((Date.parse(`${current}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`)) / 86_400_000));
}

async function paidUpgradeUsage(projectId, record, requested) {
  const [pendingRows] = await pool.query('SELECT project_type, snapshot FROM pending_project_upgrades WHERE project_id = ?', [projectId]);
  const pending = pendingRows?.[0];
  if (!pending) return null;
  const baseline = parseJson(pending.snapshot, null);
  if (!baseline) return null;

  let current;
  if (pending.project_type === 'team') {
    const [projects] = await pool.query('SELECT type, deadline, expected_collaborators, documents FROM team_projects WHERE id = ?', [projectId]);
    if (!projects?.[0]) return null;
    const [counts] = await pool.query('SELECT COUNT(*) AS count FROM team_project_collaborators WHERE project_id = ?', [projectId]);
    current = { ...projects[0], collaboratorCount: Number(counts?.[0]?.count ?? 0) };
  } else {
    const [projects] = await pool.query('SELECT type, deadline, expected_collaborators, collaborators, documents FROM projects WHERE id = ?', [projectId]);
    if (!projects?.[0]) return null;
    current = { ...projects[0], collaboratorCount: activeCollaboratorCount(projects[0].collaborators) };
  }

  const baselineCollaborators = current.type === 'public'
    ? Number(baseline.expectedCollaborators ?? 1)
    : Number((baseline.collaborators ?? []).filter(c => c?.status !== 'inactive').length || 1);
  const currentCollaborators = current.type === 'public'
    ? Number(current.expected_collaborators ?? 1)
    : current.collaboratorCount;
  const baselineDocuments = Number((baseline.documents ?? []).filter(d => d?.status !== 'inactive').length || 1);
  const currentDocuments = Number(activeDocumentCount(current.documents) || 1);

  return {
    projects: Math.max(1, Number(record.projects) || Number(requested.projects) || 1),
    collaborators: Math.max(Number(record.collaborators) + Math.max(0, currentCollaborators - baselineCollaborators), Number(requested.collaborators) || 0),
    documents: Math.max(Number(record.documents) + Math.max(0, currentDocuments - baselineDocuments), Number(requested.documents) || 0),
    days: Number(record.days) + Math.max(dateIncreaseDays(baseline.deadline, current.deadline), Math.max(0, Number(requested.extensionDays) || 0)),
  };
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

exports.getBillingProfile = async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ success: false, message: 'Payments are not configured' });
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!user.stripe_customer_id) return res.json({ success: true, billingAddress: null });
    const customer = await stripe.customers.retrieve(user.stripe_customer_id);
    const address = customer.deleted ? null : customer.address;
    return res.json({
      success: true,
      billingAddress: address ? {
        line1: address.line1 ?? '', line2: address.line2 ?? '', city: address.city ?? '',
        state: address.state ?? '', postalCode: address.postal_code ?? '', country: address.country ?? 'US',
      } : null,
    });
  } catch (err) {
    console.error('Get billing profile error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not load billing address' });
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
    const amountCents = Number(req.body?.amountCents);
    console.warn('Tax estimate unavailable; continuing with zero tax:', message);
    res.json({
      success: true,
      calculationId: null,
      taxAmountCents: 0,
      totalAmountCents: Number.isFinite(amountCents) ? Math.round(amountCents) : 0,
      taxAmount: 0,
      totalAmount: Number.isFinite(amountCents) ? Math.round(amountCents) / 100 : 0,
      taxEstimateUnavailable: true,
    });
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
        automatic_tax: { enabled: false },
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

    // Make the first successful checkout visible immediately. Stripe webhooks
    // remain the source for renewals and will skip this invoice as a duplicate.
    await recordInitialPayment(user, type, subscription, unitAmount);

    await pool.query("UPDATE users SET issubscribed = 'true' WHERE userid = ?", [user.userid]);

    await sendPaymentReceiptEmail({
      user,
      subscriptionId: subscription.id,
      invoice: typeof subscription.latest_invoice === 'object' ? subscription.latest_invoice : null,
      amountCents: unitAmount,
      voucherCode: normalizedVoucherCode || null,
    });

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

exports.upgradeSubscription = async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ success: false, message: 'Payments are not configured' });
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { paymentMethodId, projectId, projects = 1, collaborators = 1, documents = 1, days = 1, extensionDays = 0, billingAddress = {} } = req.body ?? {};
    if (!paymentMethodId || !projectId) return res.status(400).json({ success: false, message: 'paymentMethodId and projectId are required' });

    const [rows] = await pool.query(
      "SELECT * FROM stripe_subscriptions WHERE userid = ? AND project_id = ? AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1",
      [user.userid, projectId]
    );
    const record = rows[0];
    if (!record) return res.status(404).json({ success: false, message: 'Active project subscription not found' });
    const persistedUsage = await paidUpgradeUsage(projectId, record, { projects, collaborators, documents, days, extensionDays });
    const upgradedProjects = persistedUsage?.projects ?? Number(projects);
    const upgradedCollaborators = persistedUsage?.collaborators ?? Number(collaborators);
    const upgradedDocuments = persistedUsage?.documents ?? Number(documents);
    const upgradedDays = persistedUsage?.days ?? Math.max(Number(days), Number(record.days) + Math.max(0, Number(extensionDays) || 0));
    const unitAmount = computeMonthlyAmountCents({ projects: upgradedProjects, collaborators: upgradedCollaborators, documents: upgradedDocuments, days: upgradedDays });
    const previousAmountCents = Math.round(Number(record.amount) * 100);
    const upgradeChargeCents = unitAmount - previousAmountCents;
    if (upgradeChargeCents <= 0) return res.status(400).json({ success: false, message: 'Project usage has not increased' });
    const processingFeeCents = stripeProcessingFeeCents(upgradeChargeCents);
    const totalChargeCents = upgradeChargeCents + processingFeeCents;

    const customerUpdate = { invoice_settings: { default_payment_method: paymentMethodId } };
    if (billingAddress.postalCode && billingAddress.country) customerUpdate.address = {
      line1: billingAddress.line1 || undefined, line2: billingAddress.line2 || undefined,
      city: billingAddress.city || undefined, state: billingAddress.state || undefined,
      postal_code: billingAddress.postalCode, country: billingAddress.country,
    };
    await stripe.customers.update(record.stripe_customer_id, customerUpdate);
    const subscription = await stripe.subscriptions.retrieve(record.stripe_subscription_id);
    const item = subscription.items?.data?.[0];
    if (!item) return res.status(409).json({ success: false, message: 'Subscription item not found' });
    const product = await getProductId();
    const invoice = await stripe.invoices.create({
      customer: record.stripe_customer_id,
      collection_method: 'charge_automatically',
      auto_advance: false,
      metadata: { projectId: String(projectId), kind: 'project_upgrade', previousAmountCents: String(previousAmountCents), newAmountCents: String(unitAmount) },
    }, { idempotencyKey: `upgrade_invoice_${record.id}_${unitAmount}` });
    await stripe.invoiceItems.create({
      customer: record.stripe_customer_id,
      invoice: invoice.id,
      amount: totalChargeCents,
      currency: 'usd',
      description: `Project upgrade (${upgradeChargeCents} cents) and processing fee (${processingFeeCents} cents)`,
    }, { idempotencyKey: `upgrade_item_${record.id}_${unitAmount}` });
    await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: false });
    const paidInvoice = await stripe.invoices.pay(invoice.id, { payment_method: paymentMethodId });
    if (!paidInvoice.paid && paidInvoice.status !== 'paid') {
      return res.status(402).json({ success: false, message: 'The upgrade invoice could not be paid' });
    }
    const updated = await stripe.subscriptions.update(record.stripe_subscription_id, {
      default_payment_method: paymentMethodId,
      items: [{ id: item.id, price_data: { currency: 'usd', product, unit_amount: unitAmount, recurring: { interval: 'month' } } }],
      proration_behavior: 'none',
      metadata: { ...subscription.metadata, projects: String(upgradedProjects), collaborators: String(upgradedCollaborators), documents: String(upgradedDocuments), days: String(upgradedDays) },
    }, { idempotencyKey: `upgrade_${user.userid}_${projectId}_${unitAmount}` });
    await pool.query(
      'UPDATE stripe_subscriptions SET projects = ?, collaborators = ?, documents = ?, days = ?, amount = ?, last_charge_amount = ?, last_invoice_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [upgradedProjects, upgradedCollaborators, upgradedDocuments, upgradedDays, (unitAmount / 100).toFixed(2), (totalChargeCents / 100).toFixed(2), paidInvoice.id, updated.status, record.id]
    );
    await pool.query('DELETE FROM pending_project_upgrades WHERE project_id = ?', [projectId]);
    return res.json({
      success: true,
      subscriptionId: updated.id,
      status: updated.status,
      previousAmountCents,
      amountCents: unitAmount,
      proratedAmountDueCents: upgradeChargeCents,
      processingFeeCents,
      totalChargedCents: totalChargeCents,
      invoiceId: paidInvoice.id,
    });
  } catch (err) {
    console.error('Upgrade subscription error:', {
      message: err.message,
      type: err.type,
      code: err.code,
      declineCode: err.decline_code,
      statusCode: err.statusCode,
      requestId: err.requestId,
    });
    return res.status(err?.statusCode ? 400 : 500).json({ success: false, message: err?.statusCode ? err.message : 'Could not upgrade subscription' });
  }
};

exports.previewSubscriptionUpgrade = async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ success: false, message: 'Payments are not configured' });
    const user = await getUserFromToken(req);
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { projectId, projects = 1, collaborators = 1, documents = 1, days = 1, extensionDays = 0 } = req.body ?? {};
    if (!projectId) return res.status(400).json({ success: false, message: 'projectId is required' });
    const [rows] = await pool.query(
      "SELECT * FROM stripe_subscriptions WHERE userid = ? AND project_id = ? AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1",
      [user.userid, projectId]
    );
    const record = rows[0];
    if (!record) return res.status(404).json({ success: false, message: 'Active project subscription not found' });
    const usage = await paidUpgradeUsage(projectId, record, { projects, collaborators, documents, days, extensionDays });
    if (!usage) return res.status(409).json({ success: false, message: 'No pending billable project changes were found' });
    const unitAmount = computeMonthlyAmountCents(usage);
    const previousAmountCents = Math.round(Number(record.amount) * 100);
    if (unitAmount <= previousAmountCents) return res.status(400).json({ success: false, message: 'Project usage has not increased' });
    const proratedAmountDueCents = unitAmount - previousAmountCents;
    const processingFeeCents = stripeProcessingFeeCents(proratedAmountDueCents);
    return res.json({
      success: true,
      previousAmountCents,
      proratedAmountDueCents,
      processingFeeCents,
      totalDueCents: proratedAmountDueCents + processingFeeCents,
      newRecurringAmountCents: unitAmount,
    });
  } catch (err) {
    console.error('Preview subscription upgrade error:', { message: err.message, type: err.type, code: err.code, statusCode: err.statusCode });
    return res.status(err?.statusCode ? 400 : 500).json({ success: false, message: err?.statusCode ? err.message : 'Could not preview the prorated upgrade' });
  }
};
