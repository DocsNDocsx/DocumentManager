describe('PostgreSQL transactions', () => {
 function load() {
  jest.resetModules();
  process.env.DB_CLIENT = 'pg';
  const connection = {query:jest.fn(async () => ({rows:[],fields:[],rowCount:0})),release:jest.fn()};
  jest.doMock('pg', () => ({Pool:jest.fn(() => ({connect:jest.fn(async () => connection)}))}));
  return {connection,db:require('../utils/sql')};
 }
 afterEach(() => {jest.dontMock('pg');process.env.DB_CLIENT='mysql';});
 it('uses the same connection and commits successful work', async () => {
  const {connection,db}=load();
  await db.transaction(tx => tx.query('UPDATE coupons SET enabled = ? WHERE id = ?',[false,'c1']));
  expect(connection.query.mock.calls.map(([sql])=>sql)).toEqual(['BEGIN','UPDATE coupons SET enabled = $1 WHERE id = $2','COMMIT']);
  expect(connection.release).toHaveBeenCalled();
 });
 it('rolls back all writes when redemption fails', async () => {
  const {connection,db}=load();
  await expect(db.transaction(async tx => {await tx.query('UPDATE projects SET status = ?',['active']);throw new Error('redemption failed');})).rejects.toThrow('redemption failed');
  expect(connection.query.mock.calls.map(([sql])=>sql)).toEqual(['BEGIN','UPDATE projects SET status = $1','ROLLBACK']);
  expect(connection.release).toHaveBeenCalled();
 });
});
