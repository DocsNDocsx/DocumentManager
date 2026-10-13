jest.mock('../utils/couponActivationNotifications', () => jest.fn(async () => {}));
jest.mock('../utils/sql', () => ({ query: jest.fn(), transaction: jest.fn() }));
const pool = require('../utils/sql');
const coupons = require('../utils/coupons');
const controller = require('../controllers/couponcontroller');
const user = { userid: 123, timezone: 'UTC' };
const project = { id: 'p1', type: 'public', status: 'draft', deadline: new Date(Date.now()+10*86400000).toISOString(), documents: [{name:'Document'}], expected_collaborators: 2 };
const coupon = { id: 'c1', code: 'FREE', label: 'One project', benefit_type: 'free_activation', percent_off: 0, enabled: true, max_per_user: 1 };
function reads(overrides = {}, counts = { total: 0, personal: 0 }, redemption = [], locked = false) {
 pool.query.mockResolvedValueOnce([[{...coupon,...overrides}]]).mockResolvedValueOnce([[project]]).mockResolvedValueOnce([redemption]);
 if (locked) pool.query.mockResolvedValueOnce([[]]);
 pool.query.mockResolvedValueOnce([[counts]]);
}
beforeEach(() => { require('../utils/couponActivationNotifications').mockClear(); pool.query.mockReset(); pool.transaction.mockReset(); pool.transaction.mockImplementation(work => work(pool)); });
it('rejects unknown coupons', async () => {
 pool.query.mockResolvedValueOnce([[]]);
 await expect(coupons.validate(pool,'missing',user,'p1','solo')).rejects.toThrow('Invalid coupon');
});
it.each([
 [{enabled:false},'disabled'],
 [{expires_at:'2000-01-01'},'validity'],
 [{starts_at:'2100-01-01'},'validity'],
 [{eligible_user_id:999},'account'],
 [{project_type:'team'},'project type'],
 [{max_collaborators:1},'collaborators limit'],
 [{max_documents:0},'documents limit'],
 [{max_days:1},'days limit'],
])('enforces coupon eligibility %j', async (rules,message) => {
 reads(rules);
 await expect(coupons.validate(pool,'free',user,'p1','solo')).rejects.toThrow(message);
});
it.each([
 [{max_redemptions:1},{total:1,personal:0},'redemption limit'],
 [{},{total:1,personal:1},'already used'],
])('enforces usage limits', async (rules,counts,message) => {
 reads(rules,counts);
 await expect(coupons.validate(pool,'FREE',user,'p1','solo')).rejects.toThrow(message);
});
it('rejects another users project before reserving', async () => {
 pool.query.mockResolvedValueOnce([[coupon]]).mockResolvedValueOnce([[]]);
 await expect(coupons.reserve('FREE',user,'p1','solo')).rejects.toThrow('does not belong');
 expect(pool.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
});
it('quotes free activation without consuming a redemption', async () => {
 reads();
 const result = await coupons.validate(pool,' free ',user,'p1','solo');
 expect(coupons.quote(result)).toMatchObject({amountCents:0,percentOff:100,benefitType:'free_activation'});
 expect(pool.query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});
it('quotes percentage discount before card fees', async () => {
 reads({benefit_type:'percent_off',percent_off:25});
 const result = await coupons.validate(pool,'FREE',user,'p1','solo');
 const price = coupons.quote(result);
 expect(price.discountCents).toBe(45);
 expect(price.amountCents).toBe(169);
});
it('reserves a slot using a locked coupon and authoritative project usage', async () => {
 reads({benefit_type:'percent_off',percent_off:25},undefined,[],true);
 pool.query.mockResolvedValueOnce([{affectedRows:1}]);
 const result = await coupons.reserve('FREE',user,'p1','solo');
 expect(result.redemption.status).toBe('reserved');
 expect(pool.query.mock.calls[0][0]).toContain('FOR UPDATE');
 expect(pool.query.mock.calls[1][0]).toContain('FOR UPDATE');
 expect(pool.query.mock.calls[5][0]).toContain("'reserved'");
});
it('does not consume an existing reservation twice', async () => {
 reads({benefit_type:'percent_off',percent_off:25},{total:0,personal:0},[{id:'r1',status:'reserved',amount_cents:169}],true);
 const result = await coupons.reserve('FREE',user,'p1','solo');
 expect(result.redemption.id).toBe('r1');
 expect(pool.query).toHaveBeenCalledTimes(5);
});
it('settles payment once and ignores duplicate successful webhook deliveries', async () => {
 const sub = {id:'sub1',metadata:{couponRedemptionId:'r1',userid:'123',projectId:'p1'}};
 pool.query.mockResolvedValueOnce([[{id:'r1',user_id:123,project_id:'p1',status:'reserved'}]]).mockResolvedValueOnce([{affectedRows:1}]);
 await coupons.settle(sub,true);
 expect(pool.query.mock.calls[1][1][0]).toBe('redeemed');
 pool.query.mockClear();
 pool.query.mockResolvedValueOnce([[{id:'r1',user_id:123,project_id:'p1',status:'redeemed'}]]);
 await coupons.settle(sub,true);
 expect(pool.query).toHaveBeenCalledTimes(1);
});
it('rejects a payment linked to a different user', async () => {
 pool.query.mockResolvedValueOnce([[{user_id:999,project_id:'p1',status:'reserved'}]]);
 await expect(coupons.settle({id:'sub1',metadata:{couponRedemptionId:'r1',userid:'123',projectId:'p1'}},true)).rejects.toThrow('mismatch');
});
it('activates and redeems free coupon in the same transaction', async () => {
 pool.query.mockResolvedValueOnce([[user]]);
 reads({},undefined,[],true);
 pool.query.mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([{affectedRows:1}]);
 const res = {status:jest.fn().mockReturnThis(),json:jest.fn()};
 await controller.activate({user:{email:'test@example.com'},body:{code:'FREE',projectId:'p1',type:'solo'}},res);
 expect(pool.transaction).toHaveBeenCalledTimes(1);
 expect(pool.query.mock.calls[6][0]).toContain("SET status = 'active'");
 expect(pool.query.mock.calls[7][0]).toContain("'redeemed'");
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({success:true,status:'active',projectId:'p1'}));
});
it('does not write a redemption when activation fails', async () => {
 pool.query.mockResolvedValueOnce([[user]]);
 reads({},undefined,[],true);
 pool.query.mockRejectedValueOnce(new Error('activation update failed'));
 const res = {status:jest.fn().mockReturnThis(),json:jest.fn()};
 await controller.activate({user:{email:'test@example.com'},body:{code:'FREE',projectId:'p1',type:'solo'}},res);
 expect(res.status).toHaveBeenCalledWith(500);
 expect(require('../utils/couponActivationNotifications')).not.toHaveBeenCalled();
 expect(pool.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO coupon_redemptions'))).toBe(false);
});

it('keeps failed attempt history when reserving another attempt', async () => {
 reads({benefit_type:'percent_off',percent_off:25},undefined,[{id:'old-attempt',status:'released'}],true);
 pool.query.mockResolvedValueOnce([{affectedRows:1}]);
 const result = await coupons.reserve('FREE',user,'p1','solo');
 expect(result.redemption.id).not.toBe('old-attempt');
 expect(pool.query.mock.calls[5][0]).toContain('INSERT INTO coupon_redemptions');
});
it('blocks another coupon checkout for the same project', async () => {
 pool.query.mockResolvedValueOnce([[{...coupon,benefit_type:'percent_off',percent_off:25}]])
  .mockResolvedValueOnce([[project]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{id:'other-attempt'}]]);
 await expect(coupons.reserve('FREE',user,'p1','solo')).rejects.toThrow('Another coupon checkout');
});
it('requires reconciliation when an unknown payment outlives the retry window', async () => {
 reads({benefit_type:'percent_off',percent_off:25},undefined,[{id:'old',status:'reserved',amount_cents:169,created_at:new Date(Date.now()-24*3600000)}],true);
 await expect(coupons.reserve('FREE',user,'p1','solo')).rejects.toThrow('reconciliation');
});
it('repeating free activation keeps the existing project code and redemption', async () => {
 pool.query.mockResolvedValueOnce([[user]]).mockResolvedValueOnce([[coupon]])
  .mockResolvedValueOnce([[{...project,status:'active',project_code:'PRJ-EXISTING'}]])
  .mockResolvedValueOnce([[{id:'r1',status:'redeemed',benefit_type:'free_activation'}]]);
 const res = {status:jest.fn().mockReturnThis(),json:jest.fn()};
 await controller.activate({user:{email:'test@example.com'},body:{code:'FREE',projectId:'p1',type:'solo'}},res);
 expect(pool.query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
 expect(require('../utils/couponActivationNotifications')).not.toHaveBeenCalled();
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({success:true,status:'active'}));
});

it('activates a 100 percent coupon without a Stripe payment', async () => {
 pool.query.mockResolvedValueOnce([[user]]);
 reads({benefit_type:'percent_off',percent_off:100},undefined,[],true);
 pool.query.mockResolvedValueOnce([{affectedRows:1}]).mockResolvedValueOnce([{affectedRows:1}]);
 const res = {status:jest.fn().mockReturnThis(),json:jest.fn()};
 await controller.activate({user:{email:'test@example.com'},body:{code:'FREE',projectId:'p1',type:'solo'}},res);
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({success:true,status:'active'}));
 expect(pool.query.mock.calls[7][0]).toContain("'free_activation'");
});
