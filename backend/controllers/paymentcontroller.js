const pool = require('../utils/sql');
const { stripe } = require('../utils/stripe');

const isMySQL = (process.env.DB_CLIENT ?? 'pg') === 'mysql';
const interval12Months = isMySQL ? 'INTERVAL 12 MONTH' : "INTERVAL '12 months'";

const invoiceSubscriptionId = invoice => {
  const value = invoice?.subscription ?? invoice?.parent?.subscription_details?.subscription;
  return typeof value === 'object' ? value?.id : value;
};

/**
 * Backfill paid Stripe invoices that pre-date the direct payment-history write.
 * The local subscription/project relationship is used to avoid mixing solo and
 * team invoices belonging to the same Stripe customer.
 */
async function reconcileStripePayments(userid, type) {
  if (!stripe) return;
  const [subscriptions] = await pool.query(
    `SELECT stripe_customer_id, stripe_subscription_id, project_id
       FROM stripe_subscriptions
      WHERE userid = ? AND type = ?`,
    [userid, type]
  );
  if (!subscriptions.length || !subscriptions[0].stripe_customer_id) return;

  const subscriptionIds = new Set(subscriptions.map(row => row.stripe_subscription_id).filter(Boolean));
  const projectIds = new Set(subscriptions.map(row => String(row.project_id || '')).filter(Boolean));
  const invoices = await stripe.invoices.list({
    customer: subscriptions[0].stripe_customer_id,
    status: 'paid',
    limit: 100,
  });

  for (const invoice of invoices.data ?? []) {
    const subId = invoiceSubscriptionId(invoice);
    const projectId = String(invoice.metadata?.projectId || '');
    if (!subscriptionIds.has(subId) && !projectIds.has(projectId)) continue;

    const invoiceNo = invoice.number ?? invoice.id;
    if (!invoiceNo) continue;
    const [existing] = await pool.query(
      'SELECT id FROM payment_history WHERE invoice_no = ? AND userid = ?',
      [invoiceNo, userid]
    );
    if (existing.length) continue;

    const paidAt = invoice.status_transitions?.paid_at ?? invoice.created;
    await pool.query(
      `INSERT INTO payment_history
         (userid, invoice_no, plan, amount, currency, status, payment_method, paid_at, type)
       VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?)`,
      [
        userid,
        invoiceNo,
        invoice.metadata?.kind === 'project_upgrade' ? 'Prorated project upgrade' : 'Project payment',
        (invoice.amount_paid ?? invoice.amount_due ?? 0) / 100,
        (invoice.currency ?? 'usd').toUpperCase(),
        null,
        paidAt ? new Date(paidAt * 1000).toISOString() : new Date().toISOString(),
        type,
      ]
    );
  }
}

exports.getPaymentHistory = async (req, res) => {
  try {
    const { userid, type = 'solo' } = req.query;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });

    try {
      await reconcileStripePayments(userid, type);
    } catch (reconcileError) {
      // Existing local history remains usable during a transient Stripe outage.
      console.warn('Payment history Stripe reconciliation failed:', reconcileError.message);
    }

    const [payments] = await pool.query(
      `SELECT invoice_no, plan, amount, currency, status, payment_method, paid_at
       FROM payment_history
       WHERE userid = ? AND type = ?
       ORDER BY paid_at DESC`,
      [userid, type]
    );

    const [summaryRows] = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'paid' AND paid_at >= NOW() - ${interval12Months} THEN amount ELSE 0 END), 0) AS total_spent,
        COUNT(*) AS total_payments
       FROM payment_history
       WHERE userid = ? AND type = ?`,
      [userid, type]
    );

    const [subRows] = await pool.query(
      `SELECT type, amount, status, current_period_end
       FROM stripe_subscriptions
       WHERE userid = ? AND type = ? AND status IN ('active', 'trialing')
       ORDER BY updated_at DESC
       LIMIT 1`,
      [userid, type]
    );

    const summary = summaryRows[0];
    const sub = subRows[0] ?? null;
    const subscriptionLabel = sub?.type === 'team' ? 'Team usage subscription' : 'Solo usage subscription';

    res.json({
      success: true,
      summary: {
        totalSpent: `$${parseFloat(summary.total_spent).toFixed(2)}`,
        totalSpentSub: 'Last 12 months',
        totalPayments: summary.total_payments,
        totalPaymentsSub: 'All time',
        currentPlan: sub ? subscriptionLabel : 'No active subscription',
        currentPlanSub: sub ? `$${parseFloat(sub.amount ?? 0).toFixed(2)} current usage total` : 'Subscribe to activate projects',
        nextPayment: sub?.current_period_end
          ? new Date(sub.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : '-',
        nextPaymentSub: sub?.current_period_end ? 'Current period ends' : 'No upcoming payment',
      },
      payments: payments.map(p => ({
        date: new Date(p.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        invoice: p.invoice_no,
        plan: p.plan,
        amount: `$${parseFloat(p.amount).toFixed(2)}`,
        status: p.status,
        method: p.payment_method ?? '-',
      })),
    });
  } catch (err) {
    console.error('Payment history error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
