const pool = require('../utils/sql');

const isMySQL = (process.env.DB_CLIENT ?? 'pg') === 'mysql';
const interval12Months = isMySQL ? 'INTERVAL 12 MONTH' : "INTERVAL '12 months'";

exports.getPaymentHistory = async (req, res) => {
  try {
    const { userid, type = 'solo' } = req.query;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });

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
