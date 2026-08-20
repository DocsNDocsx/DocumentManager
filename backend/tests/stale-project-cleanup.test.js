jest.mock('../utils/sql', () => ({
  query: jest.fn(),
}));
jest.mock('@vercel/blob', () => ({
  del: jest.fn(),
}));
jest.mock('fs/promises', () => ({
  unlink: jest.fn(),
}));

const pool = require('../utils/sql');
const { del } = require('@vercel/blob');
const fs = require('fs/promises');
const { cleanupStaleProjects, STALE_PROJECT_DAYS } = require('../utils/staleProjectCleanup');

describe('cleanupStaleProjects', () => {
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    pool.query.mockReset();
    del.mockReset();
    fs.unlink.mockReset().mockResolvedValue(undefined);
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test';
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
    if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
  });

  it('does nothing when no stale projects exist', async () => {
    pool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    await expect(cleanupStaleProjects()).resolves.toEqual({
      totalDeleted: 0,
      soloDeleted: 0,
      teamDeleted: 0,
      assetsDeleted: 0,
    });

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[0][0]).toContain("status <> 'active'");
    expect(pool.query.mock.calls[0][0]).toContain(`>= ${STALE_PROJECT_DAYS}`);
  });

  it('deletes stale projects, submissions, templates, attachments, and submission files', async () => {
    pool.query
      .mockResolvedValueOnce([[
        {
          id: 'solo-1',
          attachments: JSON.stringify([{ url: 'https://blob.example.com/attachment.pdf' }]),
          documents: [{ templateUrl: '/public/uploads/local/templates/solo.docx' }],
        },
      ]])
      .mockResolvedValueOnce([[
        {
          id: 'team-1',
          attachments: [],
          documents: JSON.stringify([{ templateUrl: 'https://blob.example.com/team-template.docx' }]),
        },
      ]])
      .mockResolvedValueOnce([[{ file_path: 'https://blob.example.com/solo-submission.pdf' }]])
      .mockResolvedValueOnce([[{ file_path: '/public/uploads/local/submissions/team.pdf' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await expect(cleanupStaleProjects()).resolves.toEqual({
      totalDeleted: 2,
      soloDeleted: 1,
      teamDeleted: 1,
      assetsDeleted: 5,
    });

    expect(del).toHaveBeenCalledWith([
      'https://blob.example.com/attachment.pdf',
      'https://blob.example.com/team-template.docx',
      'https://blob.example.com/solo-submission.pdf',
    ], { token: 'vercel_blob_rw_test' });
    expect(fs.unlink).toHaveBeenCalledTimes(2);
    expect(pool.query).toHaveBeenNthCalledWith(
      5,
      'DELETE FROM submissions WHERE project_id IN (?)',
      ['solo-1'],
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      6,
      'DELETE FROM projects WHERE id IN (?)',
      ['solo-1'],
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      7,
      'DELETE FROM team_projects WHERE id IN (?)',
      ['team-1'],
    );
  });

  it('does not delete database rows when remote asset deletion cannot run', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    pool.query
      .mockResolvedValueOnce([[
        { id: 'solo-1', attachments: [{ url: 'https://blob.example.com/file.pdf' }], documents: [] },
      ]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    await expect(cleanupStaleProjects()).rejects.toThrow('BLOB_READ_WRITE_TOKEN is required');
    expect(pool.query).toHaveBeenCalledTimes(3);
  });
});
