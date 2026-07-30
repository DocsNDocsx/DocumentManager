jest.mock('../utils/sql', () => ({
  query: jest.fn(),
}));

const pool = require('../utils/sql');
const { cleanupStaleProjects, STALE_PROJECT_DAYS } = require('../utils/staleProjectCleanup');

describe('cleanupStaleProjects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
  });

  it('does nothing when no stale projects exist', async () => {
    pool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    await expect(cleanupStaleProjects()).resolves.toEqual({
      totalDeleted: 0,
      soloDeleted: 0,
      teamDeleted: 0,
    });

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[0][0]).toContain(`INTERVAL ${STALE_PROJECT_DAYS} DAY`);
  });

  it('deletes stale solo submissions, solo projects, and team projects', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 'solo-1' }, { id: 'solo-2' }]])
      .mockResolvedValueOnce([[{ id: 'team-1' }]])
      .mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await expect(cleanupStaleProjects()).resolves.toEqual({
      totalDeleted: 3,
      soloDeleted: 2,
      teamDeleted: 1,
    });

    expect(pool.query).toHaveBeenNthCalledWith(
      3,
      'DELETE FROM submissions WHERE project_id IN (?, ?)',
      ['solo-1', 'solo-2'],
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      4,
      'DELETE FROM projects WHERE id IN (?, ?)',
      ['solo-1', 'solo-2'],
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      5,
      'DELETE FROM team_projects WHERE id IN (?)',
      ['team-1'],
    );
  });
});
