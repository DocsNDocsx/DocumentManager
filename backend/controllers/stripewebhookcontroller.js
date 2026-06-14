const pool = require('../utils/sql');
const { stripe } = require('../utils/stripe');

/**
 * POST /api/stripe/webhook
 * Stripe is the source of truth for subscription state. This endpoint keeps the
 * local stripe_subscriptions / payment_history tables in sync as invoices are
 * paid, renewals happen, payments fail, and subscriptions are cancelled.
 *
 * NOTE: this route is mounted with express.raw() in app.js (BEFORE express.json())
 * because signature verification needs the unparsed request body.
 */
exports.handleWebhook = async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    console.error('[stripe-webhook] STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET not configured');
    return res.status(503).send('Webhook not configured');
  }

  let event;
  try {
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        await recordPayment(invoice, 'paid');
        await setSubStatus(invoice.subscription, 'active');
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await recordPayment(invoice, 'failed');
        await setSubStatus(invoice.subscription, 'past_due');
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const status = event.type.endsWith('deleted') ? 'cancelled' : sub.status;
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;
        await pool.query(
          `UPDATE stripe_subscriptions
             SET status = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP
           WHERE stripe_subscription_id = ?`,
          [status, periodEnd, sub.id]
        );
        if (status === 'cancelled' || status === 'unpaid') {
          await syncIsSubscribed(sub.id);
        }
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[stripe-webhook] Handler error:', err.message);
    res.status(500).send('Webhook handler failed');
  }
};

/** Inserts a row into payment_history, ignoring duplicate webhook deliveries. */
async function recordPayment(invoice, status) {
  const subId = invoice.subscription;
  let userid = invoice.metadata?.userid ?? null;
  let type = 'solo';

  if (subId) {
    const [rows] = await pool.query(
      'SELECT userid, type FROM stripe_subscriptions WHERE stripe_subscription_id = ?',
      [subId]
    );
    if (rows[0]) {
      userid = rows[0].userid;
      type = rows[0].type;
    }
  }
  if (!userid) return;

  const invoiceNo = invoice.number ?? invoice.id;
  const [existing] = await pool.query(
    'SELECT id FROM payment_history WHERE invoice_no = ? AND userid = ?',
    [invoiceNo, userid]
  );
  if (existing.length > 0) return;

  const paidAt = invoice.status_transitions?.paid_at ?? invoice.created;
  await pool.query(
    `INSERT INTO payment_history
       (userid, invoice_no, plan, amount, currency, status, payment_method, paid_at, type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userid,
      invoiceNo,
      'Usage subscription',
      (invoice.amount_paid ?? invoice.amount_due ?? 0) / 100,
      (invoice.currency ?? 'usd').toUpperCase(),
      status,
      null,
      new Date(paidAt * 1000).toISOString(),
      type,
    ]
  );
}

async function setSubStatus(subId, status) {
  if (!subId) return;
  await pool.query(
    'UPDATE stripe_subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?',
    [status, subId]
  );
}

/** Flips users.issubscribed back to 'false' when the user has no remaining active subscription. */
async function syncIsSubscribed(subId) {
  const [rows] = await pool.query(
    'SELECT userid FROM stripe_subscriptions WHERE stripe_subscription_id = ?',
    [subId]
  );
  const userid = rows[0]?.userid;
  if (!userid) return;

  const [active] = await pool.query(
    "SELECT id FROM stripe_subscriptions WHERE userid = ? AND status = 'active' LIMIT 1",
    [userid]
  );
  if (active.length === 0) {
    await pool.query("UPDATE users SET issubscribed = 'false' WHERE userid = ?", [userid]);
  }
}
