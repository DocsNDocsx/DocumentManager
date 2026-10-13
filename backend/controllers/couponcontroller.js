const notifyActivation = require('../utils/couponActivationNotifications');
const pool = require('../utils/sql');
const coupons = require('../utils/coupons');
const { randomUUID } = require('crypto');
const { generateProjectCode } = require('../utils/projectCode');
async function userFor(req) {
 const [rows] = await pool.query('SELECT userid, timezone, email, firstname, lastname FROM users WHERE email = ?', [req.user?.email]);
 if (!rows[0]) { const error = new Error('Unauthorized'); error.statusCode = 401; throw error; }
 return rows[0];
}
function error(res, err) { res.status(err.statusCode || 500).json({ success: false, message: err.statusCode ? err.message : 'Could not process coupon' }); }
exports.validate = async (req,res) => {
 try {
  const user = await userFor(req);
  const result = await coupons.validate(pool,req.body?.code,user,req.body?.projectId,req.body?.type || 'solo');
  res.json({ success: true, ...coupons.quote(result) });
 } catch (err) { error(res,err); }
};
exports.activate = async (req,res) => {
 try {
  const user = await userFor(req);
  const { code, projectId, type = 'solo' } = req.body ?? {};
  let activatedProject;
  const result = await pool.transaction(async db => {
   const result = await coupons.validate(db,code,user,projectId,type,true);
   if (coupons.quote(result).amountCents !== 0) coupons.fail('This coupon does not cover the full activation amount');
   if (result.redemption?.status === 'redeemed') return { projectId, status: result.project.status };
   if (result.project.status !== 'draft') coupons.fail('Only a draft project can be activated');
   const table = type === 'team' ? 'team_projects' : 'projects';
   const price = coupons.quote(result);
   const projectCode = result.project.type === 'public' ? generateProjectCode(type === 'solo' ? 'PRJ' : undefined) : null;
   await db.query('UPDATE ' + table + " SET status = 'active', completed_step = ?, project_code = ? WHERE id = ?", [type === 'team' ? 5 : 6,projectCode,projectId]);
   await db.query("INSERT INTO coupon_redemptions (id,coupon_id,user_id,project_id,project_type,status,benefit_type,discount_cents,redeemed_at) VALUES (?,?,?,?,?,'redeemed','free_activation',?,CURRENT_TIMESTAMP)", [randomUUID(),result.coupon.id,user.userid,projectId,type,price.discountCents]);
   activatedProject = result.project;
   return { projectId, status: 'active', projectCode };
  });
  if (activatedProject) await notifyActivation(user, activatedProject, type, result.projectCode);
  res.json({ success: true, ...result });
 } catch (err) { error(res,err); }
};
