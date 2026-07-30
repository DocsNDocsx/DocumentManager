jest.mock('../utils/sql', () => ({
  query: jest.fn(),
}));
jest.mock('../utils/logActivity', () => jest.fn());
jest.mock('../utils/emailservice', () => ({
  sendEmail: jest.fn(),
}));
jest.mock('fs', () => ({
  readFileSync: jest.fn(() => (
    '{{BASE_URL}} {{COLLABORATOR_NAME}} {{PROJECT_NAME}} {{DEADLINE_BLOCK}} {{PROJECT_CODE_BLOCK}}'
  )),
}));

const pool = require('../utils/sql');
const logActivity = require('../utils/logActivity');
const { sendEmail } = require('../utils/emailservice');
const teamController = require('../controllers/teamcontroller');

function mockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function teamRow(overrides = {}) {
  return {
    id: 'team-1',
    user_id: '123',
    name: 'Review Team',
    description: 'Annual review',
    icon: 'fa-users',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

function memberRow(overrides = {}) {
  return {
    id: 'member-1',
    team_id: 'team-1',
    user_id: '123',
    first_name: 'Owner',
    last_name: 'User',
    email: 'owner@example.com',
    affiliation: 'DocsNDocs',
    is_owner: true,
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function teamProjectRow(overrides = {}) {
  return {
    id: 'team-project-1',
    team_id: 'team-1',
    name: 'Team Intake',
    description: 'Collect team docs',
    type: 'public',
    status: 'draft',
    completed_step: 1,
    deadline: '2026-09-15',
    expected_collaborators: 5,
    project_code: null,
    documents: JSON.stringify([{ name: 'CV' }]),
    attachments: JSON.stringify([]),
    support_staff: JSON.stringify({ firstName: 'Support', lastName: 'Staff', email: 'support@example.com' }),
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('teamcontroller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockReset();
    logActivity.mockReset();
    sendEmail.mockReset();
  });

  it('requires userid when listing teams', async () => {
    const res = mockResponse();

    await teamController.getTeams({ query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'userid is required' });
  });

  it('combines hosted and member teams', async () => {
    pool.query
      .mockResolvedValueOnce([[{ ...teamRow(), member_count: 2 }]])
      .mockResolvedValueOnce([[{ ...teamRow({ id: 'team-2', user_id: '999', name: 'Joined Team' }), member_count: 4 }]]);
    const res = mockResponse();

    await teamController.getTeams({ query: { userid: '123' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      teams: [
        expect.objectContaining({ id: 'team-1', role: 'host', memberCount: 2 }),
        expect.objectContaining({ id: 'team-2', role: 'member', memberCount: 4 }),
      ],
    });
  });

  it('creates a team with owner and invited members', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ firstname: 'Owner', lastname: 'User', email: 'owner@example.com', organization: 'DocsNDocs' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockResolvedValueOnce([[teamRow()]])
      .mockResolvedValueOnce([[memberRow(), memberRow({ id: 'member-2', is_owner: false, first_name: 'Member', last_name: 'One' })]]);
    const res = mockResponse();

    await teamController.createTeam({
      body: {
        userId: '123',
        name: 'Review Team',
        members: [{ firstName: 'Member', lastName: 'One', email: 'member@example.com' }],
      },
    }, res);

    expect(logActivity).toHaveBeenCalledWith('123', 'team', 'Team "Review Team" was created', null, 'Review Team');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      team: expect.objectContaining({
        id: 'team-1',
        owner: expect.objectContaining({ email: 'owner@example.com', isOwner: true }),
        members: [expect.objectContaining({ firstName: 'Member', isOwner: false })],
      }),
    });
  });

  it('updates members and logs member additions', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 'team-1' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockResolvedValueOnce([[teamRow()]])
      .mockResolvedValueOnce([[memberRow(), memberRow({ id: 'member-2', is_owner: false, first_name: 'Member' })]]);
    const res = mockResponse();

    await teamController.updateTeam({
      params: { id: 'team-1' },
      body: { name: 'Updated Team', members: [{ firstName: 'Member', email: 'member@example.com' }] },
    }, res);

    expect(logActivity).toHaveBeenCalledWith(
      '123',
      'team',
      '1 member added to team "Review Team"',
      null,
      'Review Team',
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      team: expect.objectContaining({ id: 'team-1' }),
    });
  });

  it('gets one team with owner and members', async () => {
    pool.query
      .mockResolvedValueOnce([[teamRow()]])
      .mockResolvedValueOnce([[
        memberRow(),
        memberRow({ id: 'member-2', is_owner: false, first_name: 'Member', last_name: 'One', email: 'member@example.com' }),
      ]]);
    const res = mockResponse();

    await teamController.getTeam({ params: { id: 'team-1' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      team: expect.objectContaining({
        id: 'team-1',
        owner: expect.objectContaining({ email: 'owner@example.com', isOwner: true }),
        members: [expect.objectContaining({ email: 'member@example.com', isOwner: false })],
      }),
    });
  });

  it('returns 404 when getting a missing team', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await teamController.getTeam({ params: { id: 'missing' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Team not found' });
  });

  it('deletes a team', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockResponse();

    await teamController.deleteTeam({ params: { id: 'team-1' } }, res);

    expect(pool.query).toHaveBeenCalledWith('DELETE FROM teams WHERE id = ?', ['team-1']);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('returns 404 when deleting a missing team', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    const res = mockResponse();

    await teamController.deleteTeam({ params: { id: 'missing' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Team not found' });
  });

  it('creates a team project draft and host role', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[teamProjectRow()]]);
    const res = mockResponse();

    await teamController.createTeamProject({
      body: {
        userId: '123',
        teamId: 'team-1',
        name: 'Team Intake',
        type: 'public',
        expectedCollaborators: 5,
        attachments: [{ name: 'overview.pdf', url: 'https://blob.example.com/overview.pdf' }],
        supportStaff: { email: 'support@example.com' },
      },
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO team_projects'),
      expect.arrayContaining([
        expect.any(String),
        'team-1',
        'Team Intake',
        null,
        'public',
        null,
        1,
        5,
        JSON.stringify([{ name: 'overview.pdf', url: 'https://blob.example.com/overview.pdf' }]),
        JSON.stringify({ email: 'support@example.com' }),
      ]),
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO team_project_roles'),
      expect.arrayContaining([expect.any(String), expect.any(String), '123']),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('activates a team project and sends collaborator notifications', async () => {
    pool.query
      .mockResolvedValueOnce([[teamProjectRow({ status: 'draft', project_code: null })]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[teamProjectRow({ status: 'active', project_code: 'ABCD-2345' })]])
      .mockResolvedValueOnce([[{ firstName: 'Ava', lastName: 'Ray', email: 'ava@example.com' }]]);
    sendEmail.mockResolvedValue(undefined);
    const res = mockResponse();

    await teamController.updateTeamProject({
      params: { id: 'team-project-1' },
      body: { status: 'active', completedStep: 6 },
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE team_projects SET completed_step = ?, status = ?, project_code = ? WHERE id = ?'),
      [6, 'active', expect.stringMatching(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/), 'team-project-1'],
    );
    expect(sendEmail).toHaveBeenCalledWith(
      'ava@example.com',
      expect.stringContaining('DocsNDocs: "Team Intake" is now active'),
      expect.stringContaining('Ava Ray'),
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      project: expect.objectContaining({ status: 'active', projectCode: 'ABCD-2345' }),
    });
  });

  it('updates team project attachments', async () => {
    const attachments = [{ name: 'overview.pdf', url: 'https://blob.example.com/overview.pdf' }];
    pool.query
      .mockResolvedValueOnce([[teamProjectRow()]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[teamProjectRow({ attachments: JSON.stringify(attachments) })]]);
    const res = mockResponse();

    await teamController.updateTeamProject({
      params: { id: 'team-project-1' },
      body: { attachments },
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      'UPDATE team_projects SET attachments = ? WHERE id = ?',
      [JSON.stringify(attachments), 'team-project-1'],
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      project: expect.objectContaining({ attachments }),
    });
  });

  it('saves collaborators and advances completed step', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 'team-project-1' }]])
      .mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockResolvedValueOnce([[{ userid: '456' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[teamProjectRow({ completed_step: 2 })]]);
    const res = mockResponse();

    await teamController.saveProjectCollaborators({
      params: { id: 'team-project-1' },
      body: {
        collaborators: [
          { firstName: 'Known', email: 'known@example.com' },
          { firstName: 'Guest', email: 'guest@example.com' },
        ],
      },
    }, res);

    expect(pool.query).toHaveBeenCalledWith(
      'UPDATE team_projects SET completed_step = GREATEST(completed_step, 2) WHERE id = ?',
      ['team-project-1'],
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      project: expect.objectContaining({ completedStep: 2 }),
    });
  });

  it('saves project documents and advances completed step', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 'team-project-1' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[teamProjectRow({ completed_step: 3, documents: JSON.stringify([{ name: 'Transcript' }]) })]]);
    const res = mockResponse();

    await teamController.saveProjectDocuments({
      params: { id: 'team-project-1' },
      body: { documents: [{ name: 'Transcript' }] },
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      'UPDATE team_projects SET documents = ?, completed_step = GREATEST(completed_step, 3) WHERE id = ?',
      [JSON.stringify([{ name: 'Transcript' }]), 'team-project-1'],
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      project: expect.objectContaining({ completedStep: 3, documents: [{ name: 'Transcript' }] }),
    });
  });

  it('returns 404 when saving documents for a missing project', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await teamController.saveProjectDocuments({
      params: { id: 'missing' },
      body: { documents: [] },
    }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Project not found' });
  });

  it('gets one team project', async () => {
    pool.query.mockResolvedValueOnce([[teamProjectRow()]]);
    const res = mockResponse();

    await teamController.getTeamProject({ params: { id: 'team-project-1' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      project: expect.objectContaining({ id: 'team-project-1', documents: [{ name: 'CV' }] }),
    });
  });

  it('returns 404 when getting a missing team project', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await teamController.getTeamProject({ params: { id: 'missing' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Project not found' });
  });

  it('gets project collaborators with indexes', async () => {
    pool.query.mockResolvedValueOnce([[
      { id: 'collab-1', firstName: 'Ava', lastName: 'Ray', email: 'ava@example.com', affiliation: 'Org', role: 'contributor' },
      { id: 'collab-2', firstName: 'Ben', lastName: 'Kay', email: 'ben@example.com', affiliation: 'Org', role: 'reviewer' },
    ]]);
    const res = mockResponse();

    await teamController.getProjectCollaborators({ params: { id: 'team-project-1' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      collaborators: [
        expect.objectContaining({ id: 'collab-1', index: 0 }),
        expect.objectContaining({ id: 'collab-2', index: 1 }),
      ],
    });
  });

  it('deletes a team project', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockResponse();

    await teamController.deleteTeamProject({ params: { id: 'team-project-1' } }, res);

    expect(pool.query).toHaveBeenCalledWith('DELETE FROM team_projects WHERE id = ?', ['team-project-1']);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('returns 404 when deleting a missing team project', async () => {
    pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    const res = mockResponse();

    await teamController.deleteTeamProject({ params: { id: 'missing' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Project not found' });
  });

  it('gets team projects for hosted teams and generates missing active project codes', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 'team-1', name: 'Review Team' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[
        {
          id: 'team-project-1',
          teamId: 'team-1',
          teamName: 'Review Team',
          userRole: 'host',
          name: 'Team Intake',
          type: 'public',
          status: 'active',
          deadline: null,
          projectCode: null,
          collaboratorCount: '2',
          documentCount: '3',
          submittedCount: '1',
          approvedCount: '1',
          collabUploadCount: '2',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-02T00:00:00.000Z',
          myCollaboratorId: null,
        },
      ]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockResponse();

    await teamController.getTeamProjects({ query: { userid: '123' } }, res);

    expect(pool.query).toHaveBeenLastCalledWith(
      'UPDATE team_projects SET project_code = ? WHERE id = ?',
      [expect.stringMatching(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/), 'team-project-1'],
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      teams: [{ id: 'team-1', name: 'Review Team', role: 'host' }],
      projects: [expect.objectContaining({
        id: 'team-project-1',
        projectCode: expect.stringMatching(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/),
        collaboratorCount: 2,
        documentCount: 3,
      })],
    });
  });

  it('requires userid when getting team projects', async () => {
    const res = mockResponse();

    await teamController.getTeamProjects({ query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'userid is required' });
  });

  it('gets team project stats across teams', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 'team-1', name: 'Review Team' }]])
      .mockResolvedValueOnce([[{ id: 'team-2', name: 'Joined Team' }]])
      .mockResolvedValueOnce([[
        { team_id: 'team-1', totalProjects: '2', activeProjects: '1', totalDocuments: '5' },
        { team_id: 'team-2', totalProjects: '1', activeProjects: '1', totalDocuments: '2' },
      ]]);
    const res = mockResponse();

    await teamController.getTeamProjectStats({ query: { userid: '123' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      totalProjects: 3,
      activeProjects: 2,
      totalDocuments: 7,
      teams: [
        { id: 'team-1', name: 'Review Team', totalProjects: 2, activeProjects: 1, totalDocuments: 5 },
        { id: 'team-2', name: 'Joined Team', totalProjects: 1, activeProjects: 1, totalDocuments: 2 },
      ],
    });
  });

  it('returns empty stats when the user has no teams', async () => {
    pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await teamController.getTeamProjectStats({ query: { userid: '123' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      totalProjects: 0,
      activeProjects: 0,
      totalDocuments: 0,
      teams: [],
    });
  });

  it('joins a public active team project by project code', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 'team-project-1', name: 'Team Intake', teamName: 'Review Team' }]])
      .mockResolvedValueOnce([[{ userid: '456', firstname: 'Join', lastname: 'User', email: 'join@example.com', organization: 'Org' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockResponse();

    await teamController.joinProject({ body: { projectCode: 'ABCD-2345', userId: '456' } }, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      project: { id: 'team-project-1', name: 'Team Intake', teamName: 'Review Team' },
    });
  });

  it('rejects duplicate project joins', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 'team-project-1', name: 'Team Intake', teamName: 'Review Team' }]])
      .mockResolvedValueOnce([[{ userid: '456', firstname: 'Join', lastname: 'User', email: 'join@example.com' }]])
      .mockResolvedValueOnce([[{ id: 'collab-1' }]]);
    const res = mockResponse();

    await teamController.joinProject({ body: { projectCode: 'ABCD-2345', userId: '456' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'You have already joined this project' });
  });
});
