const pool = require('./sql');
const { randomUUID } = require('crypto');
const { computeMonthlyAmountCents, computeStripeProcessingFeeCents, RATE } = require('./stripe');
const { calendarDateInTimeZone, deadlineCalendarDate, resolveTimeZone } = require('./timezone');
function fail(message) { const error = new Error(message); error.statusCode = 400; throw error; }
const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const active = value => (json(value) || []).filter(item => item.status !== 'inactive');
async function context(db, user, projectId, type, lock = false) {
 if (!projectId || !['solo','team'].includes(type)) fail('A valid project and project type are required');
 const sql = type === 'solo'
  ? 'SELECT p.* FROM projects p WHERE p.id = ? AND p.user_id = ?'
  : 'SELECT p.* FROM team_projects p JOIN teams t ON t.id = p.team_id WHERE p.id = ? AND t.user_id = ?';
 const [rows] = await db.query(sql + (lock ? (type === 'team' && process.env.DB_CLIENT !== 'mysql' ? ' FOR UPDATE OF p' : ' FOR UPDATE') : ''), [projectId,user.userid]);
 const project = rows[0];
 if (!project) fail('The project was not found or does not belong to your account');
 const documents = active(project.documents);
 const collaborators = active(project.collaborators);
 const due = deadlineCalendarDate(project.deadline);
 const today = calendarDateInTimeZone(new Date(), resolveTimeZone(user.timezone));
 const days = due ? Math.ceil((Date.parse(due + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000) : 0;
 if (days < 1 || !documents.length) fail('A future deadline and required documents are needed before activation');
 let assignmentCount;
 if (type === 'solo' && project.type === 'private') {
  const docs = json(project.documents) || [];
  const people = json(project.collaborators) || [];
  assignmentCount = Object.entries(json(project.assignments) || {}).reduce((sum,[index,indices]) =>
   sum + (people[index] && people[index].status !== 'inactive' && Array.isArray(indices)
    ? new Set(indices.filter(i => Number.isInteger(i) && docs[i] && docs[i].status !== 'inactive')).size : 0), 0);
  if (!assignmentCount) fail('Assign at least one document to a collaborator before activation');
 }
 return { project, usage: { projects: 1, documents: documents.length,
  collaborators: (project.type === 'public' || type === 'team') ? Math.max(1,Number(project.expected_collaborators) || 1) : Math.max(1,collaborators.length), days, assignmentCount } };
}
async function validate(db, code, user, projectId, type, lock = false) {
 const normalized = String(code || '').trim().toUpperCase();
 const [rows] = await db.query('SELECT * FROM coupons WHERE code = ?' + (lock ? ' FOR UPDATE' : ''), [normalized]);
 const coupon = rows[0];
 if (!coupon) fail('Invalid coupon code');
 const ctx = await context(db,user,projectId,type,lock);
 const [existing] = await db.query("SELECT * FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ? AND project_id = ? AND project_type = ? ORDER BY CASE WHEN status IN ('reserved','redeemed') THEN 0 ELSE 1 END, created_at DESC LIMIT 1", [coupon.id,user.userid,projectId,type]);
 if (existing[0]?.status === 'redeemed') return { coupon, ...ctx, redemption: existing[0] };
 const now = Date.now();
 if (!coupon.enabled || (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) || (coupon.expires_at && new Date(coupon.expires_at).getTime() <= now)) fail('Coupon is disabled or outside its validity period');
 if (coupon.eligible_user_id != null && String(coupon.eligible_user_id) !== String(user.userid)) fail('Coupon is not eligible for your account');
 if (coupon.project_type && coupon.project_type !== type) fail('Coupon is not eligible for this project type');
 if (ctx.project.status !== 'draft') fail('Coupons can only be applied to draft projects');
 for (const field of ['collaborators','documents','days']) {
  if (coupon['max_' + field] != null && ctx.usage[field] > Number(coupon['max_' + field])) fail('Project exceeds coupon ' + field + ' limit');
 }
 if (lock) {
  const [other] = await db.query("SELECT id FROM coupon_redemptions WHERE user_id = ? AND project_id = ? AND project_type = ? AND coupon_id <> ? AND status IN ('reserved','redeemed') LIMIT 1", [user.userid,projectId,type,coupon.id]);
  if (other.length) fail('Another coupon checkout already exists for this project');
 }
 const [counts] = await db.query("SELECT COUNT(*) AS total, SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS personal FROM coupon_redemptions WHERE coupon_id = ? AND status IN ('reserved','redeemed') AND id <> ?", [user.userid,coupon.id,existing[0]?.id || '']);
 if (coupon.max_redemptions != null && Number(counts[0].total) >= Number(coupon.max_redemptions)) fail('Coupon redemption limit reached');
 if (Number(counts[0].personal || 0) >= Number(coupon.max_per_user)) fail('You have already used this coupon');
 return { coupon, ...ctx, redemption: existing[0] || null };
}
function quote(result) {
 const full = computeMonthlyAmountCents(result.usage);
 const base = Math.round(result.usage.projects * (result.usage.assignmentCount ?? result.usage.collaborators * result.usage.documents) * RATE * result.usage.days * 100);
 const discountCents = result.coupon.benefit_type === 'free_activation' ? base : Math.round(base * Number(result.coupon.percent_off) / 100);
 const discounted = Math.max(0,base-discountCents);
 return { code: result.coupon.code, label: result.coupon.label, benefitType: result.coupon.benefit_type,
  baseAmountCents: base, percentOff: result.coupon.benefit_type === 'free_activation' ? 100 : Number(result.coupon.percent_off),
  discountCents, amountCents: discounted + computeStripeProcessingFeeCents(discounted), originalAmountCents: full };
}
async function reserve(code,user,projectId,type) {
 return pool.transaction(async db => {
  const result = await validate(db,code,user,projectId,type,true);
  if (result.coupon.benefit_type === 'free_activation') fail('Use free project activation for this coupon');
  const price = quote(result);
  if (result.redemption?.status === 'reserved') {
   if (!result.redemption.subscription_id && result.redemption.created_at && Date.now() - new Date(result.redemption.created_at).getTime() > 23 * 3600000) fail('Payment outcome needs reconciliation before this coupon can be retried');
   if (Number(result.redemption.amount_cents) !== price.amountCents) fail('Project or coupon changed during checkout. Complete or cancel the existing payment first.');
   return { ...result, price };
  }
  if (result.redemption?.status === 'redeemed') return { ...result, price };
  const id = randomUUID();
  await db.query("INSERT INTO coupon_redemptions (id,coupon_id,user_id,project_id,project_type,status,benefit_type,discount_cents,amount_cents) VALUES (?,?,?,?,?,'reserved',?,?,?)", [id,result.coupon.id,user.userid,projectId,type,result.coupon.benefit_type,price.discountCents,price.amountCents]);
  return { ...result, price, redemption: { id, status: 'reserved' } };
 });
}
async function settle(subscription, succeeded) {
 const id = subscription.metadata?.couponRedemptionId;
 if (!id) return;
 await pool.transaction(async db => {
  const [rows] = await db.query('SELECT * FROM coupon_redemptions WHERE id = ? FOR UPDATE', [id]);
  const row = rows[0];
  if (!row || String(row.user_id) !== String(subscription.metadata.userid) || row.project_id !== subscription.metadata.projectId) throw new Error('Coupon payment metadata mismatch');
  if (row.status === 'redeemed' || (row.status === 'released' && !succeeded)) return;
  if (row.status === 'released') throw new Error('Payment succeeded after coupon reservation was released; reconciliation required');
  await db.query("UPDATE coupon_redemptions SET status = ?, subscription_id = ?, redeemed_at = ? WHERE id = ?", [succeeded ? 'redeemed' : 'released',subscription.id,succeeded ? new Date() : null,id]);
 });
}
module.exports = { context, validate, quote, reserve, settle, fail };
