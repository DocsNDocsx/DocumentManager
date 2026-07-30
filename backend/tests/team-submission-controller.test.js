jest.mock('../utils/sql', () => ({
  query: jest.fn(),
}));
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
const { sendEmail } = require('../utils/emailservice');
const { uploadToBlob } = require('../utils/blobStorage');
const teamSubmissionController = require('../controllers/teamsubmissioncontroller');

function mockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function file(overrides = {}) {
  return {
    originalname: 'team-doc.pdf',
    size: 2048,
    ...overrides,
  };
}

function teamSubmissionRow(overrides = {}) {
  return {
    id: 'team-submission-1',
    documentIndex: 0,
    fileName: 'team-doc.pdf',
    fileSize: 2048,
    status: 'submitted',
    feedback: null,
    submittedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('teamsubmissioncontroller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uploadToBlob.mockResolvedValue('https://blob.example.com/team/team-doc.pdf');
  });

  it('gets upload info for a collaborator', async () => {
    pool.query
      .mockResolvedValueOnce([[{
        id: 'team-project-1',
        name: 'Team Intake',
        teamName: 'Review Team',
        documents: JSON.stringify([{ name: 'CV' }]),
        deadline: '2026-09-15',
        status: 'active',
      }]])
      .mockResolvedValueOnce([[{
        id: 'collab-1',
        firstName: 'Ava',
        lastName: 'Ray',
        email: 'ava@example.com',
        affiliation: 'Org',
        role: 'contributor',
      }]])
      .mockResolvedValueOnce([[teamSubmissionRow()]]);
    const res = mockResponse();

    await teamSubmissionController.getUploadInfo({
      params: { id: 'team-project-1', collaboratorId: 'collab-1' },
    }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      project: expect.objectContaining({
        id: 'team-project-1',
        name: 'Team Intake',
        documents: [{ name: 'CV' }],
      }),
      collaborator: expect.objectContaining({ id: 'collab-1', email: 'ava@example.com' }),
      submissions: [teamSubmissionRow()],
    });
  });

  it('requires collaboratorId for upload info', async () => {
    const res = mockResponse();

    await teamSubmissionController.getUploadInfo({ params: { id: 'team-project-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'collaboratorId is required' });
  });

  it('returns 404 when upload-info project or collaborator is missing', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const missingProjectRes = mockResponse();
    await teamSubmissionController.getUploadInfo({
      params: { id: 'missing', collaboratorId: 'collab-1' },
    }, missingProjectRes);
    expect(missingProjectRes.status).toHaveBeenCalledWith(404);
    expect(missingProjectRes.json).toHaveBeenCalledWith({ success: false, message: 'Project not found' });

    pool.query.mockResolvedValueOnce([[{ id: 'team-project-1', documents: '[]' }]]).mockResolvedValueOnce([[]]);
    const missingCollabRes = mockResponse();
    await teamSubmissionController.getUploadInfo({
      params: { id: 'team-project-1', collaboratorId: 'missing' },
    }, missingCollabRes);
    expect(missingCollabRes.status).toHaveBeenCalledWith(404);
    expect(missingCollabRes.json).toHaveBeenCalledWith({ success: false, message: 'Collaborator not found' });
  });

  it('gets team submissions for review view', async () => {
    pool.query
      .mockResolvedValueOnce([[{ documents: JSON.stringify([{ name: 'CV' }, { name: 'Transcript' }]) }]])
      .mockResolvedValueOnce([[
        {
          id: 'team-submission-1',
          documentIndex: 1,
          fileName: 'transcript.pdf',
          fileSize: 4096,
          status: 'submitted',
          feedback: null,
          submittedAt: '2026-07-01T00:00:00.000Z',
          firstName: 'Ava',
          lastName: 'Ray',
          email: 'ava@example.com',
        },
      ]]);
    const res = mockResponse();

    await teamSubmissionController.getSubmissions({ params: { id: 'team-project-1' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      submissions: [{
        id: 'team-submission-1',
        collaborator: { firstName: 'Ava', lastName: 'Ray', email: 'ava@example.com' },
        documentType: 'Transcript',
        fileName: 'transcript.pdf',
        submittedDate: '2026-07-01T00:00:00.000Z',
        status: 'pending',
        comments: null,
      }],
    });
  });

  it('returns 404 when getting submissions for missing project', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await teamSubmissionController.getSubmissions({ params: { id: 'missing' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Project not found' });
  });

  it('rejects invalid team submission review status', async () => {
    const res = mockResponse();

    await teamSubmissionController.updateSubmission({
      params: { id: 'team-project-1', submissionId: 'team-submission-1' },
      body: { status: 'submitted' },
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'status must be approved or revision' });
  });

  it('returns 404 when reviewing a missing team submission', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    const res = mockResponse();

    await teamSubmissionController.updateSubmission({
      params: { id: 'team-project-1', submissionId: 'missing' },
      body: { status: 'approved' },
    }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Submission not found' });
  });

  it('updates team submission review and emails collaborator', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{
        documentIndex: 0,
        fileName: 'team-doc.pdf',
        firstName: 'Ava',
        lastName: 'Ray',
        email: 'ava@example.com',
        projectName: 'Team Intake',
        documents: JSON.stringify([{ name: 'CV' }]),
      }]]);
    sendEmail.mockResolvedValueOnce(undefined);
    const res = mockResponse();

    await teamSubmissionController.updateSubmission({
      params: { id: 'team-project-1', submissionId: 'team-submission-1' },
      body: { status: 'approved', feedback: 'Looks good.' },
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      'UPDATE team_project_submissions SET status = ?, feedback = ? WHERE id = ? AND project_id = ?',
      ['approved', 'Looks good.', 'team-submission-1', 'team-project-1'],
    );
    expect(sendEmail).toHaveBeenCalledWith(
      'ava@example.com',
      'DocsNDocs: Your submission for "Team Intake" has been approved',
      expect.stringContaining('Approved'),
    );
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('requires file, collaboratorId, and docIndex when creating team submission', async () => {
    const noFileRes = mockResponse();
    await teamSubmissionController.createSubmission({
      params: { id: 'team-project-1' },
      body: { collaboratorId: 'collab-1', docIndex: '0' },
    }, noFileRes);
    expect(noFileRes.status).toHaveBeenCalledWith(400);
    expect(noFileRes.json).toHaveBeenCalledWith({ success: false, message: 'No file uploaded' });

    const noCollaboratorRes = mockResponse();
    await teamSubmissionController.createSubmission({
      params: { id: 'team-project-1' },
      body: { docIndex: '0' },
      file: file(),
    }, noCollaboratorRes);
    expect(noCollaboratorRes.status).toHaveBeenCalledWith(400);
    expect(noCollaboratorRes.json).toHaveBeenCalledWith({ success: false, message: 'collaboratorId is required' });

    const noDocRes = mockResponse();
    await teamSubmissionController.createSubmission({
      params: { id: 'team-project-1' },
      body: { collaboratorId: 'collab-1' },
      file: file(),
    }, noDocRes);
    expect(noDocRes.status).toHaveBeenCalledWith(400);
    expect(noDocRes.json).toHaveBeenCalledWith({ success: false, message: 'docIndex is required' });
  });

  it('returns 404 when creating team submission for missing collaborator', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await teamSubmissionController.createSubmission({
      params: { id: 'team-project-1' },
      body: { collaboratorId: 'missing', docIndex: '0' },
      file: file(),
    }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Collaborator not found' });
  });

  it('inserts a new team submission and emails host', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 'collab-1' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[teamSubmissionRow()]])
      .mockResolvedValueOnce([[{
        firstname: 'Host',
        lastname: 'User',
        email: 'host@example.com',
        projectName: 'Team Intake',
        documents: JSON.stringify([{ name: 'CV' }]),
        collabFirstName: 'Ava',
        collabLastName: 'Ray',
      }]]);
    sendEmail.mockResolvedValueOnce(undefined);
    const res = mockResponse();

    await teamSubmissionController.createSubmission({
      params: { id: 'team-project-1' },
      body: { collaboratorId: 'collab-1', docIndex: '0' },
      file: file(),
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO team_project_submissions'),
      [
        expect.any(String),
        'team-project-1',
        'collab-1',
        0,
        'team-doc.pdf',
        2048,
        'https://blob.example.com/team/team-doc.pdf',
      ],
    );
    expect(uploadToBlob).toHaveBeenCalledWith({
      folder: 'submissions/team/team-project-1/collab-1',
      prefix: 'doc-0',
      file: file(),
    });
    expect(sendEmail).toHaveBeenCalledWith(
      'host@example.com',
      'DocsNDocs: New submission in "Team Intake"',
      expect.stringContaining('Ava Ray'),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, submission: teamSubmissionRow() });
  });

  it('updates an existing team submission as a resubmission', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 'collab-1' }]])
      .mockResolvedValueOnce([[{ id: 'existing-submission' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[teamSubmissionRow({ id: 'existing-submission', fileName: 'updated.docx' })]])
      .mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await teamSubmissionController.createSubmission({
      params: { id: 'team-project-1' },
      body: { collaboratorId: 'collab-1', docIndex: '2' },
      file: file({ originalname: 'updated.docx', size: 4096 }),
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('UPDATE team_project_submissions'),
      ['updated.docx', 4096, 'https://blob.example.com/team/team-doc.pdf', 'team-project-1', 'collab-1', 2],
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      submission: expect.objectContaining({ id: 'existing-submission', fileName: 'updated.docx' }),
    });
  });
});
