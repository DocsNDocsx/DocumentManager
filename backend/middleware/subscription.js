const pool = require('../utils/sql');

async function hasPaidActivationForProject(userid, projectId) {
  if (!projectId) return false;
  const [stripeRows] = await pool.query(
    `SELECT id
       FROM stripe_subscriptions
      WHERE userid = ?
        AND project_id = ?
        AND status IN ('active', 'trialing')
      LIMIT 1`,
    [userid, projectId],
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

    if (await hasPaidActivationForProject(user.userid, req.params?.id)) return next();

    return res.status(402).json({
      success: false,
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'Please complete payment before activating this project.',
    });
  } catch (err) {
    console.error('Subscription check error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
