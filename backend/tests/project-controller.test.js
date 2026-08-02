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
    '{{BASE_URL}} {{COLLABORATOR_NAME}} {{PROJECT_NAME}} {{DEADLINE_BLOCK}} {{PROJECT_CODE_BLOCK}}'
  )),
}));

const pool = require('../utils/sql');
const logActivity = require('../utils/logActivity');
const { sendEmail } = require('../utils/emailservice');
const { uploadToBlob } = require('../utils/blobStorage');
const projectController = require('../controllers/projectcontroller');

function mockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function projectRow(overrides = {}) {
  return {
    id: 'project-1',
    user_id: '123',
    name: 'Research Intake',
    description: 'Collect documents',
    deadline: '2026-09-15',
    status: 'draft',
    type: 'private',
    completed_step: 2,
    expected_collaborators: 3,
    project_code: null,
    collaborators: JSON.stringify([{ firstName: 'Ava', lastName: 'Ray', email: 'ava@example.com' }]),
    documents: JSON.stringify([{ name: 'Transcript' }]),
    assignments: JSON.stringify({ 0: [0] }),
    attachments: JSON.stringify([]),
    staff: JSON.stringify({ firstName: 'Sam', lastName: 'Staff', email: 'sam@example.com' }),
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('projectcontroller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uploadToBlob.mockResolvedValue('https://blob.example.com/project-files/file.pdf');
  });

  it('rejects an invalid status on the general project PATCH', async () => {
    const res = mockResponse();
    await projectController.updateProject({
      params: { id: 'project-1' },
      body: { status: 'hacked' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Invalid project status' });
  });

  it('prevents a non-owner from activating a solo project', async () => {
    pool.query
      .mockResolvedValueOnce([[{ userid: '999' }]])
      .mockResolvedValueOnce([[]]);
    const res = mockResponse();
    await projectController.activateProject({
      params: { id: 'project-1' },
      user: { email: 'intruder@example.com' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Only the project owner can activate this project' });
  });

  it('requires userid and project name when creating a project', async () => {
    const resMissingUser = mockResponse();
    await projectController.createProject({ body: { name: 'Draft' } }, resMissingUser);
    expect(resMissingUser.status).toHaveBeenCalledWith(400);
    expect(resMissingUser.json).toHaveBeenCalledWith({ success: false, message: 'userid is required' });

    const resMissingName = mockResponse();
    await projectController.createProject({ body: { userid: '123' } }, resMissingName);
    expect(resMissingName.status).toHaveBeenCalledWith(400);
    expect(resMissingName.json).toHaveBeenCalledWith({ success: false, message: 'name is required' });
  });

  it('creates a draft project with serialized form data', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[projectRow()]]);
    const res = mockResponse();

    await projectController.createProject({
      body: {
        userid: '123',
        name: 'Research Intake',
        description: 'Collect documents',
        deadline: '2026-09-15',
        type: 'public',
        collaborators: [{ email: 'ava@example.com' }],
        documents: [{ name: 'Transcript' }],
        assignments: { 0: [0] },
        attachments: [],
        staff: { email: 'sam@example.com' },
        expectedCollaborators: 3,
      },
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO projects'),
      expect.arrayContaining([
        expect.any(String),
        '123',
        'Research Intake',
        'Collect documents',
        '2026-09-15',
        'public',
        JSON.stringify([{ email: 'ava@example.com' }]),
        JSON.stringify([{ name: 'Transcript' }]),
        JSON.stringify({ 0: [0] }),
        JSON.stringify([]),
        JSON.stringify({ email: 'sam@example.com' }),
        3,
      ]),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      project: expect.objectContaining({
        id: 'project-1',
        userId: '123',
        collaborators: [{ firstName: 'Ava', lastName: 'Ray', email: 'ava@example.com' }],
        staff: { firstName: 'Sam', lastName: 'Staff', email: 'sam@example.com' },
      }),
    });
  });

  it('returns projects parsed from stored JSON', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[projectRow(), projectRow({ id: 'project-2', collaborators: 'bad-json' })]])
      .mockResolvedValueOnce([[{ email: 'owner@example.com' }]])
      .mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await projectController.getProjects({ query: { userid: '123' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      projects: [
        expect.objectContaining({ id: 'project-1', documents: [{ name: 'Transcript' }] }),
        expect.objectContaining({ id: 'project-2', collaborators: [] }),
      ],
    });
  });

  it('includes an active project joined as a collaborator', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ email: 'join@example.com' }]])
      .mockResolvedValueOnce([[
        projectRow({
          id: 'joined-project',
          user_id: '999',
          status: 'active',
          collaborators: JSON.stringify([
            { userId: '456', email: 'join@example.com' },
          ]),
        }),
      ]]);
    const res = mockResponse();

    await projectController.getProjects({ query: { userid: '456' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      projects: [expect.objectContaining({
        id: 'joined-project',
        userId: '999',
      })],
    });
  });

  it('gets one project with owner name', async () => {
    pool.query.mockResolvedValueOnce([[
      projectRow({
        owner_firstname: 'Owner',
        owner_lastname: 'Person',
      }),
    ]]);
    const res = mockResponse();

    await projectController.getProject({ params: { id: 'project-1' } }, res);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM projects p'),
      ['project-1'],
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      project: expect.objectContaining({
        id: 'project-1',
        ownerName: 'Owner Person',
        documents: [{ name: 'Transcript' }],
      }),
    });
  });

  it('returns 404 when getting a missing project', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await projectController.getProject({ params: { id: 'missing' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Project not found' });
  });

  it('returns 400 when no update fields are provided', async () => {
    const res = mockResponse();

    await projectController.updateProject({ params: { id: 'project-1' }, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'No fields to update' });
  });

  it('updates project form data and completed step', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[projectRow({ name: 'Updated' })]]);
    const res = mockResponse();

    await projectController.updateProject({
      params: { id: 'project-1' },
      body: {
        name: 'Updated',
        documents: [{ name: 'CV' }],
        assignments: { 0: [0] },
        completedStep: 4,
        status: 'draft',
      },
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      'UPDATE projects SET name = ?, documents = ?, assignments = ?, status = ?, completed_step = GREATEST(completed_step, ?) WHERE id = ?',
      ['Updated', JSON.stringify([{ name: 'CV' }]), JSON.stringify({ 0: [0] }), 'draft', 4, 'project-1'],
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      project: expect.objectContaining({ name: 'Updated' }),
    });
  });

  it('blocks completion until every required public document is approved', async () => {
    pool.query
      .mockResolvedValueOnce([[projectRow({
        type: 'public',
        expected_collaborators: 2,
        collaborators: JSON.stringify([{ email: 'a@example.com' }, { email: 'b@example.com' }]),
        documents: JSON.stringify([{ name: 'Transcript' }]),
      })]])
      .mockResolvedValueOnce([[{ approved_count: 1 }]]);
    const res = mockResponse();

    await projectController.updateProject({ params: { id: 'project-1' }, body: { status: 'completed' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'All required documents must be approved before completing the project',
    });
  });

  it('completes a public project after all required documents are approved', async () => {
    pool.query
      .mockResolvedValueOnce([[projectRow({
        type: 'public',
        expected_collaborators: 2,
        collaborators: JSON.stringify([{ email: 'a@example.com' }, { email: 'b@example.com' }]),
        documents: JSON.stringify([{ name: 'Transcript' }]),
      })]])
      .mockResolvedValueOnce([[{ approved_count: 2 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[projectRow({ status: 'completed' })]]);
    const res = mockResponse();

    await projectController.updateProject({ params: { id: 'project-1' }, body: { status: 'completed' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      project: expect.objectContaining({ status: 'completed' }),
    });
  });

  it('activates a public project, logs activity, and emails owner, collaborators, and support staff', async () => {
    const activeRow = projectRow({
      status: 'active',
      type: 'public',
      completed_step: 6,
      project_code: 'PRJ-ABCD-EFGH',
    });
    pool.query
      .mockResolvedValueOnce([[{
        type: 'public',
        deadline: new Date(Date.now() + 86400000).toISOString(),
        documents: JSON.stringify([{ name: 'Transcript' }]),
        ownerEmail: 'owner@example.com',
        ownerFirstName: 'Owner',
        ownerLastName: 'User',
      }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[activeRow]]);
    sendEmail.mockResolvedValue(undefined);
    const res = mockResponse();

    await projectController.activateProject({ params: { id: 'project-1' } }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      "UPDATE projects SET status = 'active', completed_step = 6, project_code = ? WHERE id = ?",
      [expect.stringMatching(/^PRJ-[A-Z0-9]{4}-[A-Z0-9]{4}$/), 'project-1'],
    );
    expect(logActivity).toHaveBeenCalledWith(
      '123',
      'settings',
      'Project "Research Intake" was activated',
      null,
      'Research Intake',
    );
    expect(sendEmail).toHaveBeenCalledTimes(3);
    expect(sendEmail).toHaveBeenCalledWith(
      'owner@example.com',
      'DocsNDocs: Your project "Research Intake" is now active',
      expect.stringContaining('Owner User'),
    );
    expect(sendEmail).toHaveBeenCalledWith(
      'sam@example.com',
      'DocsNDocs: "Research Intake" is now active',
      expect.stringContaining('Sam Staff'),
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      project: expect.objectContaining({ status: 'active', projectCode: 'PRJ-ABCD-EFGH' }),
    });
  });

  it('activates a private solo project and emails support staff without generating a project code', async () => {
    const activeRow = projectRow({
      status: 'active',
      type: 'private',
      completed_step: 6,
      project_code: null,
    });
    pool.query
      .mockResolvedValueOnce([[{
        type: 'private',
        deadline: new Date(Date.now() + 86400000).toISOString(),
        documents: JSON.stringify([{ name: 'Transcript' }]),
        ownerEmail: 'owner@example.com',
        ownerFirstName: 'Owner',
        ownerLastName: 'User',
      }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[activeRow]]);
    sendEmail.mockResolvedValue(undefined);
    const res = mockResponse();

    await projectController.activateProject({ params: { id: 'project-1' } }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      "UPDATE projects SET status = 'active', completed_step = 6, project_code = ? WHERE id = ?",
      [null, 'project-1'],
    );
    expect(sendEmail).toHaveBeenCalledWith(
      'sam@example.com',
      'DocsNDocs: "Research Intake" is now active',
      expect.stringContaining('Sam Staff'),
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      project: expect.objectContaining({ status: 'active', projectCode: null }),
    });
  });

  it('returns 404 when activating or deleting a missing project', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const activateRes = mockResponse();
    await projectController.activateProject({ params: { id: 'missing' } }, activateRes);
    expect(activateRes.status).toHaveBeenCalledWith(404);

    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 0 }]);
    const deleteRes = mockResponse();
    await projectController.deleteProject({ params: { id: 'missing' } }, deleteRes);
    expect(deleteRes.status).toHaveBeenCalledWith(404);
    expect(deleteRes.json).toHaveBeenCalledWith({ success: false, message: 'Project not found' });
  });

  it('cancels a project and returns the updated project', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[projectRow({ status: 'cancelled' })]]);
    const res = mockResponse();

    await projectController.cancelProject({ params: { id: 'project-1' } }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      "UPDATE projects SET status = 'cancelled' WHERE id = ?",
      ['project-1'],
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      project: expect.objectContaining({
        id: 'project-1',
        status: 'cancelled',
      }),
    });
  });

  it('returns 404 when cancelling a missing project', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    const res = mockResponse();

    await projectController.cancelProject({ params: { id: 'missing' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Project not found' });
  });

  it('deletes submissions before deleting a project', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 2 }]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockResponse();

    await projectController.deleteProject({ params: { id: 'project-1' } }, res);

    expect(pool.query).toHaveBeenNthCalledWith(1, 'DELETE FROM submissions WHERE project_id = ?', ['project-1']);
    expect(pool.query).toHaveBeenNthCalledWith(2, 'DELETE FROM projects WHERE id = ?', ['project-1']);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('uploads project attachment files to Blob and returns metadata', async () => {
    const res = mockResponse();
    const file = {
      originalname: 'project-plan.pdf',
      size: 4096,
      mimetype: 'application/pdf',
      buffer: Buffer.from('file-bytes'),
    };

    await projectController.uploadProjectAttachment({
      user: { email: 'owner@example.com' },
      body: { scope: 'team' },
      file,
    }, res);

    expect(uploadToBlob).toHaveBeenCalledWith({
      folder: 'project-attachments/team/owner-example.com',
      file,
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      attachment: {
        name: 'project-plan.pdf',
        size: 4096,
        mimeType: 'application/pdf',
        url: 'https://blob.example.com/project-files/file.pdf',
      },
    });
  });
});
