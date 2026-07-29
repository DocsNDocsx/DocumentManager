const pool = require('../utils/sql');

async function hasActiveSubscription(userid) {
  const [userRows] = await pool.query(
    "SELECT issubscribed FROM users WHERE userid = ?",
    [userid],
  );

  if (String(userRows[0]?.issubscribed).toLowerCase() === 'true') {
    return true;
  }

  const [stripeRows] = await pool.query(
    "SELECT id FROM stripe_subscriptions WHERE userid = ? AND status IN ('active', 'trialing') LIMIT 1",
    [userid],
  );
  return stripeRows.length > 0;
}

module.exports = async function requireActiveSubscription(req, res, next) {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const [users] = await pool.query(
      'SELECT userid FROM users WHERE email = ? LIMIT 1',
      [email],
    );
    const user = users[0];
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });

    if (await hasActiveSubscription(user.userid)) return next();

    return res.status(402).json({
      success: false,
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'Please subscribe before activating a project.',
    });
  } catch (err) {
    console.error('Subscription check error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
