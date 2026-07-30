jest.mock('../utils/sql', () => ({
  query: jest.fn(),
}));
jest.mock('../utils/logActivity', () => jest.fn());
jest.mock('../utils/emailservice', () => ({
  sendEmail: jest.fn(),
}));
jest.mock('../utils/blobStorage', () => ({
  uploadToBlob: jest.fn(),
}));
jest.mock('fs', () => ({
  readFileSync: jest.fn(() => (
    '{{BASE_URL}} {{OWNER_NAME}} {{COLLABORATOR_NAME}} {{PROJECT_NAME}} {{DOCUMENT_NAME}} ' +
    '{{STATUS_CLASS}} {{STATUS_LABEL}} {{FEEDBACK_BLOCK}} {{STATUS_MESSAGE}}'
  )),
}));

const pool = require('../utils/sql');
const logActivity = require('../utils/logActivity');
const { sendEmail } = require('../utils/emailservice');
const { uploadToBlob } = require('../utils/blobStorage');
const submissionController = require('../controllers/submissioncontroller');

function mockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function uploadFile(overrides = {}) {
  return {
    originalname: 'transcript.pdf',
    size: 2048,
    ...overrides,
  };
}

function submissionRow(overrides = {}) {
  return {
    id: 'submission-1',
    project_id: 'project-1',
    collaborator_index: 0,
    document_index: 1,
    file_name: 'transcript.pdf',
    file_size: 2048,
    file_path: 'https://blob.example.com/solo/transcript.pdf',
    status: 'submitted',
    feedback: null,
    ...overrides,
  };
}

function projectNotificationRow(overrides = {}) {
  return {
    user_id: '123',
    name: 'Research Intake',
    collaborators: JSON.stringify([
      { firstName: 'Ava', lastName: 'Ray', email: 'ava@example.com' },
    ]),
    documents: JSON.stringify([
      { name: 'CV' },
      { name: 'Transcript' },
    ]),
    firstname: 'Owner',
    lastname: 'Person',
    ownerEmail: 'owner@example.com',
    ...overrides,
  };
}

describe('submissioncontroller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uploadToBlob.mockResolvedValue('https://blob.example.com/solo/transcript.pdf');
  });

  it('requires an uploaded file when creating a submission', async () => {
    const res = mockResponse();

    await submissionController.createSubmission({
      params: { projectId: 'project-1' },
      body: { collabIndex: '0', docIndex: '1' },
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'No file uploaded' });
  });

  it('requires collaborator and document indexes when creating a submission', async () => {
    const res = mockResponse();

    await submissionController.createSubmission({
      params: { projectId: 'project-1' },
      body: {},
      file: uploadFile(),
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'collabIndex and docIndex are required' });
  });

  it('returns 404 when creating a submission for a missing project', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await submissionController.createSubmission({
      params: { projectId: 'missing' },
      body: { collabIndex: '0', docIndex: '1' },
      file: uploadFile(),
    }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Project not found' });
  });

  it('inserts a new submission, logs activity, and emails the owner', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 'project-1' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[submissionRow()]])
      .mockResolvedValueOnce([[projectNotificationRow()]]);
    sendEmail.mockResolvedValueOnce(undefined);
    const res = mockResponse();

    await submissionController.createSubmission({
      params: { projectId: 'project-1' },
      body: { collabIndex: '0', docIndex: '1' },
      file: uploadFile(),
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO submissions'),
      [
        expect.any(String),
        'project-1',
        0,
        1,
        'transcript.pdf',
        2048,
        'https://blob.example.com/solo/transcript.pdf',
      ],
    );
    expect(uploadToBlob).toHaveBeenCalledWith({
      folder: 'submissions/solo/project-1/0',
      prefix: 'doc-1',
      file: uploadFile(),
    });
    expect(logActivity).toHaveBeenCalledWith(
      '123',
      'upload',
      'New document uploaded to "Research Intake"',
      null,
      'Research Intake',
    );
    expect(sendEmail).toHaveBeenCalledWith(
      'owner@example.com',
      'DocsNDocs: New submission in "Research Intake"',
      expect.stringContaining('Ava Ray'),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, submission: submissionRow() });
  });

  it('updates an existing submission as a resubmission', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 'project-1' }]])
      .mockResolvedValueOnce([[{ id: 'existing-submission' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[submissionRow({ id: 'existing-submission', file_name: 'updated.pdf' })]])
      .mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await submissionController.createSubmission({
      params: { projectId: 'project-1' },
      body: { collabIndex: '0', docIndex: '1' },
      file: uploadFile({ originalname: 'updated.pdf', size: 4096 }),
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('UPDATE submissions'),
      ['updated.pdf', 4096, 'https://blob.example.com/solo/transcript.pdf', 'project-1', 0, 1],
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      submission: expect.objectContaining({ id: 'existing-submission', file_name: 'updated.pdf' }),
    });
  });

  it('rejects invalid submission review status', async () => {
    const res = mockResponse();

    await submissionController.updateSubmission({
      params: { projectId: 'project-1', submissionId: 'submission-1' },
      body: { status: 'submitted' },
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'status must be approved or revision' });
  });

  it('returns 404 when reviewing a missing submission', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    const res = mockResponse();

    await submissionController.updateSubmission({
      params: { projectId: 'project-1', submissionId: 'missing' },
      body: { status: 'approved' },
    }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Submission not found' });
  });

  it('updates a submission review and emails the collaborator', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[submissionRow({ status: 'revision', feedback: 'Please resubmit a clearer file.' })]])
      .mockResolvedValueOnce([[{
        name: 'Research Intake',
        collaborators: JSON.stringify([{ firstName: 'Ava', lastName: 'Ray', email: 'ava@example.com' }]),
        documents: JSON.stringify([{ name: 'Transcript' }, { name: 'Recommendation Letter' }]),
      }]]);
    sendEmail.mockResolvedValueOnce(undefined);
    const res = mockResponse();

    await submissionController.updateSubmission({
      params: { projectId: 'project-1', submissionId: 'submission-1' },
      body: { status: 'revision', feedback: 'Please resubmit a clearer file.' },
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      'UPDATE submissions SET status = ?, feedback = ? WHERE id = ? AND project_id = ?',
      ['revision', 'Please resubmit a clearer file.', 'submission-1', 'project-1'],
    );
    expect(sendEmail).toHaveBeenCalledWith(
      'ava@example.com',
      'DocsNDocs: Revision requested for your submission in "Research Intake"',
      expect.stringContaining('Revision Required'),
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      submission: expect.objectContaining({ id: 'submission-1', status: 'revision' }),
    });
  });

  it('returns empty stats when projectIds query is missing or empty', async () => {
    const missingRes = mockResponse();
    await submissionController.getSubmissionStats({ query: {} }, missingRes);
    expect(missingRes.json).toHaveBeenCalledWith({ success: true, stats: {} });

    const emptyRes = mockResponse();
    await submissionController.getSubmissionStats({ query: { projectIds: ',' } }, emptyRes);
    expect(emptyRes.json).toHaveBeenCalledWith({ success: true, stats: {} });
  });

  it('returns submission stats grouped by project id', async () => {
    pool.query.mockResolvedValueOnce([[
      { project_id: 'project-1', approved: '2', submitted: '3' },
      { project_id: 'project-2', approved: 1, submitted: 0 },
    ]]);
    const res = mockResponse();

    await submissionController.getSubmissionStats({ query: { projectIds: 'project-1,project-2' } }, res);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM submissions WHERE project_id IN (?,?) GROUP BY project_id'),
      ['project-1', 'project-2'],
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      stats: {
        'project-1': { approved: 2, submitted: 3 },
        'project-2': { approved: 1, submitted: 0 },
      },
    });
  });

  it('gets all project submissions when collabIndex is omitted', async () => {
    pool.query.mockResolvedValueOnce([[submissionRow(), submissionRow({ id: 'submission-2', collaborator_index: 1 })]]);
    const res = mockResponse();

    await submissionController.getSubmissions({ params: { projectId: 'project-1' }, query: {} }, res);

    expect(pool.query).toHaveBeenCalledWith(
      'SELECT * FROM submissions WHERE project_id = ?',
      ['project-1'],
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      submissions: [submissionRow(), submissionRow({ id: 'submission-2', collaborator_index: 1 })],
    });
  });

  it('gets submissions for one collaborator when collabIndex is provided', async () => {
    pool.query.mockResolvedValueOnce([[submissionRow({ collaborator_index: 2 })]]);
    const res = mockResponse();

    await submissionController.getSubmissions({
      params: { projectId: 'project-1' },
      query: { collabIndex: '2' },
    }, res);

    expect(pool.query).toHaveBeenCalledWith(
      'SELECT * FROM submissions WHERE project_id = ? AND collaborator_index = ?',
      ['project-1', 2],
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      submissions: [submissionRow({ collaborator_index: 2 })],
    });
  });
});
