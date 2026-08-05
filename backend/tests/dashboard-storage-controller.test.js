jest.mock('../utils/sql', () => ({
  query: jest.fn(),
}));
jest.mock('@vercel/blob', () => ({
  list: jest.fn(),
}));

const pool = require('../utils/sql');
const { list } = require('@vercel/blob');
const dashboardController = require('../controllers/dashboardcontroller');

function mockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('dashboardcontroller.getStorageSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires userid for the storage dropdown API', async () => {
    const res = mockResponse();

    await dashboardController.getStorageSummary({ query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'userid is required' });
  });

  it('builds solo and team storage summaries from database rows', async () => {
    pool.query
      .mockResolvedValueOnce([[
        { status: 'active', project_count: 2, document_count: 5, total_bytes: 1073741824 },
        { status: 'draft', project_count: 1, document_count: 0, total_bytes: 0 },
        { status: 'not_completed', project_count: 1, document_count: 2, total_bytes: 1048576 },
      ]])
      .mockResolvedValueOnce([[
        { status: 'completed', project_count: 1, document_count: 3, total_bytes: 2097152 },
      ]])
      .mockResolvedValueOnce([[
        { value: 'team-1', label: 'Alpha Team' },
      ]]);
    const res = mockResponse();

    await dashboardController.getStorageSummary({
      query: { userid: '123', teamId: 'team-1' },
    }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      solo: expect.objectContaining({
        title: 'Storage Details - Solo Projects',
        totalUsed: '1 GB',
        totalUsedSub: 'of 10 GB (10%)',
        totalProjects: 4,
        totalProjectsSub: '2 Active, 2 Other',
        totalDocs: 7,
        statuses: expect.objectContaining({
          active: expect.objectContaining({
            count: expect.stringContaining('2 projects'),
            size: '1 GB',
            percent: '99.9%',
          }),
          notCompleted: expect.objectContaining({
            size: '1 MB',
          }),
        }),
      }),
      team: expect.objectContaining({
        title: 'Storage Details - Alpha Team',
        totalUsed: '2 MB',
        totalProjects: 1,
        totalDocs: 3,
      }),
      teams: [
        { value: 'all', label: 'All Teams Combined' },
        { value: 'team-1', label: 'Alpha Team' },
      ],
    });
  });

  it('returns 500 when storage lookup fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    pool.query.mockRejectedValueOnce(new Error('db failed'));
    const res = mockResponse();

    await dashboardController.getStorageSummary({ query: { userid: '123' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Internal server error' });
    console.error.mockRestore();
  });
});

describe('dashboardcontroller.getDashboardStats Blob reconciliation', () => {
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN;

  afterEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = originalToken;
  });

  it('excludes submission metadata when the backing blobs were deleted externally', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test';
    list.mockResolvedValueOnce({ blobs: [], hasMore: false });
    pool.query
      .mockResolvedValueOnce([[{ cnt: 1 }]])
      .mockResolvedValueOnce([[{ cnt: 0 }]])
      .mockResolvedValueOnce([[
        { file_path: 'https://store.private.blob.vercel-storage.com/submissions/solo/project-1/file.pdf', file_size: 4096, submitted_at: new Date(), project_status: 'active' },
      ]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ cnt: 1 }]]);
    const res = mockResponse();

    await dashboardController.getDashboardStats({ query: { userid: '123' } }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      documentsCollected: 0,
      documentsThisWeek: 0,
      storageUsedLabel: '0 B',
      storageUsedPercent: 0,
    }));
  });
});
