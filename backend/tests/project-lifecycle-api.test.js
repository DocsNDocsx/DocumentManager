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
    '{{DEADLINE_BLOCK}} {{PROJECT_CODE_BLOCK}} {{STATUS_CLASS}} {{STATUS_LABEL}} ' +
    '{{FEEDBACK_BLOCK}} {{STATUS_MESSAGE}}'
  )),
}));

const pool = require('../utils/sql');
const logActivity = require('../utils/logActivity');
const { sendEmail } = require('../utils/emailservice');
const { uploadToBlob } = require('../utils/blobStorage');
const projectController = require('../controllers/projectcontroller');
const submissionController = require('../controllers/submissioncontroller');
const teamController = require('../controllers/teamcontroller');
const teamSubmissionController = require('../controllers/teamsubmissioncontroller');

function mockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function documents(count = 25) {
  return Array.from({ length: count }, (_, index) => ({
    name: `Required Document ${index + 1}`,
    description: `Upload document ${index + 1}`,
    required: true,
  }));
}

function collaborators(count = 25) {
  return Array.from({ length: count }, (_, index) => ({
    firstName: `Collab${index + 1}`,
    lastName: 'User',
    email: `collab${index + 1}@example.com`,
    affiliation: 'DocsNDocs',
  }));
}

function assignments(collabCount = 25, docCount = 25) {
  return Object.fromEntries(
    Array.from({ length: collabCount }, (_, index) => [
      String(index),
      Array.from({ length: docCount }, (_unused, docIndex) => docIndex),
    ]),
  );
}

function soloProjectRow(overrides = {}) {
  return {
    id: 'solo-project-1',
    user_id: '123',
    name: 'Solo Lifecycle',
    description: 'Collect solo lifecycle documents',
    deadline: '2026-09-15',
    status: 'draft',
    type: 'public',
    completed_step: 1,
    expected_collaborators: 25,
    project_code: null,
    collaborators: JSON.stringify(collaborators()),
    documents: JSON.stringify(documents()),
    assignments: JSON.stringify(assignments()),
    attachments: JSON.stringify([]),
    staff: JSON.stringify({ firstName: 'Support', lastName: 'Staff', email: 'support@example.com' }),
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

function teamProjectRow(overrides = {}) {
  return {
    id: 'team-project-1',
    team_id: 'team-1',
    name: 'Team Lifecycle',
    description: 'Collect team lifecycle documents',
    deadline: '2026-09-15',
    status: 'draft',
    type: 'public',
    completed_step: 1,
    expected_collaborators: 25,
    project_code: null,
    documents: JSON.stringify(documents()),
    attachments: JSON.stringify([]),
    support_staff: JSON.stringify({ firstName: 'Support', lastName: 'Staff', email: 'support@example.com' }),
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

function uploadFile(name = 'required-document-25.pdf') {
  return {
    originalname: name,
    size: 2048,
  };
}

function installSoloSqlMock(initialProject) {
  let project = initialProject;
  const submission = {
    id: 'solo-submission-1',
    project_id: project.id,
    collaborator_index: 24,
    document_index: 24,
    file_name: 'required-document-25.pdf',
    file_size: 2048,
    file_path: 'https://blob.example.com/solo/required-document-25.pdf',
    status: 'submitted',
    feedback: null,
  };

  pool.query.mockImplementation(async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, ' ').trim();

    if (text.startsWith('INSERT INTO projects')) {
      project = {
        ...project,
        status: 'draft',
        completed_step: 1,
      };
      return [{ affectedRows: 1 }];
    }

    if (text.startsWith('SELECT p.type, u.email AS ownerEmail')) {
      return [[{
        type: project.type,
        ownerEmail: 'owner@example.com',
        ownerFirstName: 'Owner',
        ownerLastName: 'Person',
      }]];
    }

    if (text === 'SELECT * FROM projects WHERE id = ?') {
      return [[project]];
    }

    if (text.startsWith('UPDATE projects SET')) {
      if (text.includes("status = 'active'")) {
        project = {
          ...project,
          status: 'active',
          completed_step: 6,
          project_code: params[0],
        };
      } else if (text.includes('status = ?')) {
        project = { ...project, status: params[0] };
      } else if (text.includes('completed_step')) {
        project = { ...project, completed_step: Math.max(project.completed_step, params.at(-2)) };
      }
      return [{ affectedRows: 1 }];
    }

    if (text === 'SELECT id FROM projects WHERE id = ?') {
      return [[{ id: project.id }]];
    }

    if (text.startsWith('SELECT id FROM submissions')) {
      return [[]];
    }

    if (text.startsWith('INSERT INTO submissions')) {
      return [{ affectedRows: 1 }];
    }

    if (text.startsWith('SELECT * FROM submissions WHERE project_id = ?')) {
      return [[submission]];
    }

    if (text.startsWith('SELECT p.user_id, p.name, p.collaborators')) {
      return [[{
        user_id: project.user_id,
        name: project.name,
        collaborators: project.collaborators,
        documents: project.documents,
        firstname: 'Owner',
        lastname: 'Person',
        ownerEmail: 'owner@example.com',
      }]];
    }

    if (text.startsWith('UPDATE submissions SET')) {
      submission.status = params[0];
      submission.feedback = params[1];
      return [{ affectedRows: 1 }];
    }

    if (text === 'SELECT * FROM submissions WHERE id = ?') {
      return [[submission]];
    }

    if (text === 'SELECT name, collaborators, documents FROM projects WHERE id = ?') {
      return [[{
        name: project.name,
        collaborators: project.collaborators,
        documents: project.documents,
      }]];
    }

    throw new Error(`Unexpected solo SQL: ${text}`);
  });

  return {
    get project() {
      return project;
    },
    submission,
  };
}

function installTeamSqlMock(initialProject) {
  let project = initialProject;
  const collaborator = {
    id: 'team-collab-25',
    firstName: 'TeamCollab25',
    lastName: 'User',
    email: 'teamcollab25@example.com',
    affiliation: 'DocsNDocs',
    role: 'contributor',
  };
  const submission = {
    id: 'team-submission-1',
    documentIndex: 24,
    fileName: 'team-required-document-25.pdf',
    fileSize: 2048,
    status: 'submitted',
    feedback: null,
    submittedAt: '2026-07-10T00:00:00.000Z',
  };

  pool.query.mockImplementation(async (sql, params = []) => {
    const text = String(sql).replace(/\s+/g, ' ').trim();

    if (text.startsWith('INSERT INTO team_projects')) {
      project = {
        ...project,
        status: 'draft',
        completed_step: params[6] ?? 1,
      };
      return [{ affectedRows: 1 }];
    }

    if (text.startsWith('INSERT INTO team_project_roles')) {
      return [{ affectedRows: 1 }];
    }

    if (text === 'SELECT * FROM team_projects WHERE id = ?') {
      return [[project]];
    }

    if (text === 'SELECT id FROM team_projects WHERE id = ?') {
      return [[{ id: project.id }]];
    }

    if (text === 'DELETE FROM team_project_collaborators WHERE project_id = ?') {
      return [{ affectedRows: 25 }];
    }

    if (text.startsWith('SELECT userid FROM users WHERE LOWER(email)')) {
      return [[]];
    }

    if (text.startsWith('INSERT INTO team_project_collaborators')) {
      return [{ affectedRows: 25 }];
    }

    if (text.startsWith('UPDATE team_projects SET')) {
      if (text.includes('documents = ?')) {
        project = {
          ...project,
          documents: params[0],
          completed_step: Math.max(project.completed_step, 3),
        };
      }
      if (text.includes('completed_step = ?')) {
        project = { ...project, completed_step: params[0] };
      }
      if (text.includes('status = ?')) {
        const statusValue = params.find(value => value === 'active' || value === 'completed');
        project = {
          ...project,
          status: statusValue,
          project_code: statusValue === 'active' ? 'TEAM-ABCD-1234' : project.project_code,
        };
      }
      return [{ affectedRows: 1 }];
    }

    if (text.startsWith('SELECT first_name AS firstName')) {
      return [[collaborator]];
    }

    if (text.startsWith('SELECT u.email, u.firstname')) {
      return [[{
        email: 'owner@example.com',
        firstName: 'Owner',
        lastName: 'Person',
      }]];
    }

    if (text.startsWith('SELECT id FROM team_project_collaborators WHERE id = ?')) {
      return [[{ id: collaborator.id }]];
    }

    if (text.startsWith('SELECT id FROM team_project_submissions')) {
      return [[]];
    }

    if (text.startsWith('INSERT INTO team_project_submissions')) {
      return [{ affectedRows: 1 }];
    }

    if (text.startsWith('SELECT id, document_index AS documentIndex')) {
      return [[submission]];
    }

    if (text.startsWith('SELECT u.firstname, u.lastname, u.email')) {
      return [[{
        firstname: 'Owner',
        lastname: 'Person',
        email: 'owner@example.com',
        projectName: project.name,
        documents: project.documents,
        collabFirstName: collaborator.firstName,
        collabLastName: collaborator.lastName,
      }]];
    }

    if (text.startsWith('UPDATE team_project_submissions SET')) {
      submission.status = params[0];
      submission.feedback = params[1];
      return [{ affectedRows: 1 }];
    }

    if (text.startsWith('SELECT tps.document_index AS documentIndex')) {
      return [[{
        documentIndex: submission.documentIndex,
        fileName: submission.fileName,
        firstName: collaborator.firstName,
        lastName: collaborator.lastName,
        email: collaborator.email,
        projectName: project.name,
        documents: project.documents,
      }]];
    }

    throw new Error(`Unexpected team SQL: ${text}`);
  });

  return {
    get project() {
      return project;
    },
    collaborator,
    submission,
  };
}

describe('project lifecycle backend APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uploadToBlob.mockResolvedValue('https://blob.example.com/submission.pdf');
  });

  it.each(['public', 'private'])('supports the solo %s lifecycle through backend APIs', async (type) => {
    const state = installSoloSqlMock(soloProjectRow({ type, project_code: type === 'public' ? 'PRJ-ABCD-1234' : null }));

    const createRes = mockResponse();
    await projectController.createProject({
      body: {
        userid: '123',
        name: 'Solo Lifecycle',
        description: 'Collect solo lifecycle documents',
        deadline: '2026-09-15',
        type,
        expectedCollaborators: 25,
        collaborators: collaborators(),
        documents: documents(),
        assignments: assignments(),
        staff: { firstName: 'Support', lastName: 'Staff', email: 'support@example.com' },
      },
    }, createRes);

    expect(createRes.status).toHaveBeenCalledWith(201);
    expect(createRes.json.mock.calls[0][0].project.type).toBe(type);

    const configureRes = mockResponse();
    await projectController.updateProject({
      params: { id: state.project.id },
      body: {
        collaborators: collaborators(),
        documents: documents(),
        assignments: assignments(),
        staff: { firstName: 'Support', lastName: 'Staff', email: 'support@example.com' },
        completedStep: 5,
      },
    }, configureRes);

    expect(configureRes.json.mock.calls[0][0].project.documents).toHaveLength(25);

    const activateRes = mockResponse();
    await projectController.activateProject({ params: { id: state.project.id } }, activateRes);

    expect(activateRes.json.mock.calls[0][0].project.status).toBe('active');
    expect(activateRes.json.mock.calls[0][0].project.projectCode).toEqual(type === 'public' ? expect.any(String) : null);
    expect(logActivity).toHaveBeenCalledWith('123', 'settings', 'Project "Solo Lifecycle" was activated', null, 'Solo Lifecycle');

    const submitRes = mockResponse();
    await submissionController.createSubmission({
      params: { projectId: state.project.id },
      body: { collabIndex: '24', docIndex: '24' },
      file: uploadFile(),
    }, submitRes);

    expect(submitRes.status).toHaveBeenCalledWith(201);
    expect(uploadToBlob).toHaveBeenCalledWith(expect.objectContaining({
      folder: `submissions/solo/${state.project.id}/24`,
      prefix: 'doc-24',
    }));

    const reviewRes = mockResponse();
    await submissionController.updateSubmission({
      params: { projectId: state.project.id, submissionId: state.submission.id },
      body: { status: 'approved', feedback: 'Looks good' },
    }, reviewRes);

    expect(reviewRes.json.mock.calls[0][0].submission.status).toBe('approved');

    const completeRes = mockResponse();
    await projectController.updateProject({
      params: { id: state.project.id },
      body: { status: 'completed' },
    }, completeRes);

    expect(completeRes.json.mock.calls[0][0].project.status).toBe('completed');
  });

  it.each(['public', 'private'])('supports the team %s lifecycle through backend APIs', async (type) => {
    const state = installTeamSqlMock(teamProjectRow({ type, project_code: type === 'public' ? 'TEAM-ABCD-1234' : null }));

    const createRes = mockResponse();
    await teamController.createTeamProject({
      body: {
        userId: '123',
        teamId: 'team-1',
        name: 'Team Lifecycle',
        description: 'Collect team lifecycle documents',
        deadline: '2026-09-15',
        type,
        expectedCollaborators: 25,
      },
    }, createRes);

    expect(createRes.status).toHaveBeenCalledWith(201);
    expect(createRes.json.mock.calls[0][0].project.type).toBe(type);

    const collaboratorRes = mockResponse();
    await teamController.saveProjectCollaborators({
      params: { id: state.project.id },
      body: { collaborators: collaborators() },
    }, collaboratorRes);

    expect(collaboratorRes.json.mock.calls[0][0].project.id).toBe(state.project.id);

    const documentRes = mockResponse();
    await teamController.saveProjectDocuments({
      params: { id: state.project.id },
      body: { documents: documents() },
    }, documentRes);

    expect(documentRes.json.mock.calls[0][0].project.documents).toHaveLength(25);

    const assignmentRes = mockResponse();
    await teamController.updateTeamProject({
      params: { id: state.project.id },
      body: { completedStep: 4 },
    }, assignmentRes);

    expect(assignmentRes.json.mock.calls[0][0].project.completedStep).toBe(4);

    const activateRes = mockResponse();
    await teamController.updateTeamProject({
      params: { id: state.project.id },
      body: { status: 'active', completedStep: 6 },
    }, activateRes);

    expect(activateRes.json.mock.calls[0][0].project.status).toBe('active');
    expect(activateRes.json.mock.calls[0][0].project.projectCode).toEqual(expect.any(String));

    const submitRes = mockResponse();
    await teamSubmissionController.createSubmission({
      params: { id: state.project.id },
      body: { collaboratorId: state.collaborator.id, docIndex: '24' },
      file: uploadFile('team-required-document-25.pdf'),
    }, submitRes);

    expect(submitRes.status).toHaveBeenCalledWith(201);
    expect(uploadToBlob).toHaveBeenCalledWith(expect.objectContaining({
      folder: `submissions/team/${state.project.id}/${state.collaborator.id}`,
      prefix: 'doc-24',
    }));

    const reviewRes = mockResponse();
    await teamSubmissionController.updateSubmission({
      params: { id: state.project.id, submissionId: state.submission.id },
      body: { status: 'approved', feedback: 'Approved' },
    }, reviewRes);

    expect(reviewRes.json).toHaveBeenCalledWith({ success: true });

    const completeRes = mockResponse();
    await teamController.updateTeamProject({
      params: { id: state.project.id },
      body: { status: 'completed' },
    }, completeRes);

    expect(completeRes.json.mock.calls[0][0].project.status).toBe('completed');
  });

  it('covers negative lifecycle API guards for missing uploads and missing projects', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const missingProjectRes = mockResponse();
    await projectController.activateProject({ params: { id: 'missing' } }, missingProjectRes);
    expect(missingProjectRes.status).toHaveBeenCalledWith(404);

    const missingSoloFileRes = mockResponse();
    await submissionController.createSubmission({
      params: { projectId: 'solo-project-1' },
      body: { collabIndex: '0', docIndex: '0' },
    }, missingSoloFileRes);
    expect(missingSoloFileRes.status).toHaveBeenCalledWith(400);

    const missingTeamFileRes = mockResponse();
    await teamSubmissionController.createSubmission({
      params: { id: 'team-project-1' },
      body: { collaboratorId: 'team-collab-1', docIndex: '0' },
    }, missingTeamFileRes);
    expect(missingTeamFileRes.status).toHaveBeenCalledWith(400);
  });
});
