const pool = require('../utils/sql');

exports.getPlans = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.slug, p.name, p.price_monthly, p.price_annual, p.max_storage_gb,
              p.min_members, p.max_members, pf.feature
       FROM plans p
       LEFT JOIN plan_features pf ON pf.plan_id = p.id
       ORDER BY p.price_monthly ASC, pf.sort_order ASC`
    );

    const planMap = new Map();
    for (const row of rows) {
      if (!planMap.has(row.id)) {
        planMap.set(row.id, {
          id: row.id, slug: row.slug, name: row.name,
          price_monthly: parseFloat(row.price_monthly),
          price_annual: parseFloat(row.price_annual),
          max_storage_gb: row.max_storage_gb,
          min_members: row.min_members,
          max_members: row.max_members,
          features: [],
        });
      }
      if (row.feature) planMap.get(row.id).features.push(row.feature);
    }

    res.json({ success: true, plans: [...planMap.values()] });
  } catch (err) {
    console.error('Get plans error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getSubscription = async (req, res) => {
  try {
    const { userid } = req.query;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });

    const [rows] = await pool.query(
      `SELECT s.id, p.slug AS plan_slug, p.name AS plan_name, p.price_monthly, p.price_annual,
              s.billing_cycle, s.status, s.started_at, s.next_payment_at
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.userid = ? AND s.status = 'active'
       LIMIT 1`,
      [userid]
    );

    if (rows.length === 0) return res.json({ success: true, subscription: null });

    const sub = rows[0];
    const now = Date.now();
    const nextPayment = sub.next_payment_at ? new Date(sub.next_payment_at).getTime() : null;
    const started = new Date(sub.started_at).getTime();
    const daysInCycle = sub.billing_cycle === 'annual' ? 365 : 30;
    const daysRemaining = nextPayment ? Math.max(0, Math.ceil((nextPayment - now) / 86400000)) : 0;

    res.json({
      success: true,
      subscription: {
        id: sub.id,
        planSlug: sub.plan_slug,
        planName: sub.plan_name,
        priceMonthly: parseFloat(sub.price_monthly),
        priceAnnual: parseFloat(sub.price_annual),
        billingCycle: sub.billing_cycle,
        status: sub.status,
        nextPaymentAt: sub.next_payment_at,
        daysInCycle,
        daysRemaining,
      },
    });
  } catch (err) {
    console.error('Get subscription error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const { userid } = req.body;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });

    const [result] = await pool.query(
      "UPDATE subscriptions SET status = 'cancelled' WHERE userid = ? AND status = 'active'",
      [userid]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'No active subscription found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateSubscription = async (req, res) => {
  try {
    const { userid, planSlug, billingCycle } = req.body;
    if (!userid || !planSlug) return res.status(400).json({ success: false, message: 'userid and planSlug are required' });

    const [planRows] = await pool.query('SELECT id, price_monthly, price_annual FROM plans WHERE slug = ?', [planSlug]);
    if (planRows.length === 0) return res.status(404).json({ success: false, message: 'Plan not found' });

    const plan = planRows[0];
    const cycle = billingCycle ?? 'monthly';
    const price = cycle === 'annual' ? parseFloat(plan.price_annual) : parseFloat(plan.price_monthly);

    const now = new Date();
    const nextPayment = new Date(now);
    if (cycle === 'annual') nextPayment.setFullYear(nextPayment.getFullYear() + 1);
    else nextPayment.setMonth(nextPayment.getMonth() + 1);

    const [existing] = await pool.query(
      "SELECT id FROM subscriptions WHERE userid = ? AND status = 'active' LIMIT 1",
      [userid]
    );

    if (existing.length > 0) {
      await pool.query(
        'UPDATE subscriptions SET plan_id = ?, billing_cycle = ?, next_payment_at = ? WHERE id = ?',
        [plan.id, cycle, nextPayment, existing[0].id]
      );
    } else {
      await pool.query(
        'INSERT INTO subscriptions (userid, plan_id, billing_cycle, status, started_at, next_payment_at) VALUES (?, ?, ?, ?, ?, ?)',
        [userid, plan.id, cycle, 'active', now, nextPayment]
      );
    }

    res.json({ success: true, nextPaymentAt: nextPayment });
  } catch (err) {
    console.error('Update subscription error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
