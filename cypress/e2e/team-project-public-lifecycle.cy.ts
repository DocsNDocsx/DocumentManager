/**
 * E2E: Public team project — full lifecycle
 *
 * All test data is loaded from cypress/testdata/team-project-public-lifecycle.json.
 *
 * Suite setup (before / after):
 *   - Creates a dedicated Cypress test team via API before any test runs
 *   - Deletes that team after the suite completes
 *
 * Flow tested per test:
 *   1. Step 1  — fill project details, advance to documents page
 *   2. Step 2  — fill 3 document forms, advance to decision page
 *   3. Full flow — complete wizard end-to-end, verify project code is issued
 *   4. Dashboard — activated project appears in /top-menu-team-projects
 *   5. API: POST /teams/projects          creates a real DB row
 *   6. API: POST /teams/projects/:id/documents  saves documents
 *   7. API: PATCH /teams/projects/:id     activation assigns project code
 */

describe('Public Team Project — Full Lifecycle (live backend)', () => {
  const email    = Cypress.env('TEST_EMAIL') as string;
  const password = Cypress.env('TEST_PASSWORD') as string;
  const apiUrl   = Cypress.env('apiUrl') as string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let td: any;
  let testTeamId: string | null = null;
  let createdProjectId: string | null = null;

  // ── Suite setup ────────────────────────────────────────────────────────────

  before(() => {
    expect(email,    'TEST_EMAIL must be set in cypress.env.json').to.be.a('string').and.not.equal('');
    expect(password, 'TEST_PASSWORD must be set in cypress.env.json').to.be.a('string').and.not.equal('YOUR_PASSWORD_HERE');

    cy.fixture('team-project-public-lifecycle').then(data => {
      td = data;

      cy.request('POST', `${apiUrl}/auth/login`, { email, password }).then(loginRes => {
        const userId = String(loginRes.body.userid);

        cy.request('POST', `${apiUrl}/teams`, {
          userId,
          name:        td.team.name,
          description: td.team.description,
          icon:        td.team.icon,
          members:     td.team.members,
        }).then(teamRes => {
          testTeamId = teamRes.body.team.id;
          cy.log(`Test team created: ${testTeamId}`);
        });
      });
    });
  });

  after(() => {
    if (testTeamId) {
      cy.request({
        method: 'DELETE',
        url: `${apiUrl}/teams/${testTeamId}`,
        failOnStatusCode: false,
      });
      testTeamId = null;
    }
  });

  // ── Per-test hooks ─────────────────────────────────────────────────────────

  beforeEach(() => {
    cy.loginByApi(email, password);
  });

  afterEach(() => {
    if (createdProjectId) {
      cy.request({
        method: 'DELETE',
        url: `${apiUrl}/teams/projects/${createdProjectId}`,
        failOnStatusCode: false,
      });
      createdProjectId = null;
    }
  });

  // ── Step 1: Details ────────────────────────────────────────────────────────

  it('Step 1 — fills in project details and advances to documents page', () => {
    cy.intercept('POST', `${apiUrl}/teams/projects`).as('createProject');

    cy.visit('/new-team-project/public/details');
    cy.get('#teamSelect option').should('have.length.greaterThan', 1);
    cy.get('#teamSelect').select(td.team.name, { force: true });

    cy.get('#projectName').type(td.projects.step1.name);
    cy.get('#projectDescription').type(td.projects.step1.description);
    cy.get('#projectDeadline').type(td.projects.step1.deadline);
    cy.get('#expectedCollaborators').type(`{selectall}${td.projects.step1.expectedCollaborators}`);

    cy.get('.btn-continue').should('not.be.disabled').click();

    cy.wait('@createProject').then(interception => {
      createdProjectId = interception.response?.body?.project?.id ?? null;
    });

    cy.url().should('include', '/new-team-project/public/documents');
  });

  // ── Step 2: Documents ──────────────────────────────────────────────────────

  it('Step 2 — generates document forms, fills them in, and advances to decision', () => {
    cy.intercept('POST', `${apiUrl}/teams/projects`).as('createProject');

    cy.visit('/new-team-project/public/details');
    cy.get('#teamSelect option').should('have.length.greaterThan', 1);
    cy.get('#teamSelect').select(td.team.name, { force: true });
    cy.get('#projectName').type(td.projects.step2.name);
    cy.get('#projectDescription').type(td.projects.step2.description);
    cy.get('#projectDeadline').type(td.projects.step2.deadline);
    cy.get('#expectedCollaborators').type(`{selectall}${td.projects.step2.expectedCollaborators}`);
    cy.get('.btn-continue').click();

    cy.wait('@createProject').then(interception => {
      createdProjectId = interception.response?.body?.project?.id ?? null;
    });

    cy.url().should('include', '/new-team-project/public/documents');

    const docs = td.documents.standard3;
    cy.get('#documentCount').type(`{selectall}${docs.length}`);
    cy.get('.btn-generate').click();
    cy.get('.doc-card').should('have.length', docs.length);

    docs.forEach((doc: any, i: number) => {
      cy.get(`#docName${i}`).type(doc.name);
      cy.get(`[id="docSize${i}"]`).type(`{selectall}${doc.maxSize}`);
      cy.get('.doc-card').eq(i).find('input[type="checkbox"]').first().check();
    });

    cy.get('.btn-continue').should('not.be.disabled').click();
    cy.url().should('include', '/new-team-project/public/decision');
  });

  // ── Full wizard flow (steps 1 → 2 → 3 → activated) ───────────────────────

  it('Full flow — creates project, saves documents, activates, receives project code', () => {
    cy.intercept('POST', `${apiUrl}/teams/projects`).as('createProject');

    cy.visit('/new-team-project/public/details');
    cy.get('#teamSelect option').should('have.length.greaterThan', 1);
    cy.get('#teamSelect').select(td.team.name, { force: true });
    cy.get('#projectName').type(td.projects.fullFlow.name);
    cy.get('#projectDescription').type(td.projects.fullFlow.description);
    cy.get('#projectDeadline').type(td.projects.fullFlow.deadline);
    cy.get('#expectedCollaborators').type(`{selectall}${td.projects.fullFlow.expectedCollaborators}`);
    cy.get('.btn-continue').click();

    cy.wait('@createProject').then(interception => {
      createdProjectId = interception.response?.body?.project?.id ?? null;
    });

    // ── Documents page ────────────────────────────────────────────────────
    cy.url().should('include', '/new-team-project/public/documents');

    const docs = td.documents.standard3;
    cy.get('#documentCount').type(`{selectall}${docs.length}`);
    cy.get('.btn-generate').click();
    cy.get('.doc-card').should('have.length', docs.length);

    docs.forEach((doc: any, i: number) => {
      cy.get(`#docName${i}`).type(doc.name);
      cy.get(`[id="docSize${i}"]`).type(`{selectall}${doc.maxSize}`);
      cy.get('.doc-card').eq(i).find('input[type="checkbox"]').first().check();
    });

    cy.get('.btn-continue').should('not.be.disabled').click();

    // ── Decision page ─────────────────────────────────────────────────────
    cy.url().should('include', '/new-team-project/public/decision');
    cy.contains(td.assertions.fullFlow.decisionPageProjectName).should('be.visible');
    cy.contains(td.assertions.fullFlow.decisionPageDocumentChip).should('be.visible');

    cy.get('.btn-activate').click();
    cy.get('.modal-box').should('be.visible');
    cy.contains('Activate Public Team Project?').should('be.visible');
    cy.get('.btn-modal-confirm').click();

    // ── Code modal — project is now live ─────────────────────────────────
    cy.get('.project-code-display', { timeout: 15000 }).should('be.visible');
    cy.get('.project-code-value').invoke('text').then(code => {
      expect(code.trim()).to.have.length.greaterThan(0);
      cy.log(`Project code received from server: ${code.trim()}`);
    });

    cy.get('.btn-modal-confirm').click();
    cy.url().should('include', '/top-menu-team-projects');
  });

  // ── Project appears in dashboard ──────────────────────────────────────────

  it('Activated project appears as active in /top-menu-team-projects', () => {
    cy.request('POST', `${apiUrl}/auth/login`, { email, password }).then(loginRes => {
      const userId = String(loginRes.body.userid);
      const p = td.projects.dashboardCheck;

      cy.request('POST', `${apiUrl}/teams/projects`, {
        userId,
        teamId:               testTeamId,
        name:                 p.name,
        description:          p.description,
        deadline:             p.deadline,
        type:                 p.type,
        expectedCollaborators: p.expectedCollaborators,
        completedStep:        p.completedStep,
      }).then(createRes => {
        const projectId = createRes.body.project.id;
        createdProjectId = projectId;

        cy.request('PATCH', `${apiUrl}/teams/projects/${projectId}`, {
          status: 'active',
          completedStep: 3,
        }).then(() => {
          cy.visit('/top-menu-team-projects');
          cy.contains('Active').click();
          cy.contains(p.name).should('be.visible');
        });
      });
    });
  });

  // ── API contract validation ───────────────────────────────────────────────

  it('POST /api/teams/projects creates a real row in the database', () => {
    cy.request('POST', `${apiUrl}/auth/login`, { email, password }).then(loginRes => {
      const userId = String(loginRes.body.userid);
      const p = td.projects.apiContract;
      const expected = td.assertions.apiContract;

      cy.request('POST', `${apiUrl}/teams/projects`, {
        userId,
        teamId:               testTeamId,
        name:                 p.name,
        description:          p.description,
        deadline:             p.deadline,
        type:                 p.type,
        expectedCollaborators: p.expectedCollaborators,
        completedStep:        p.completedStep,
      }).then(res => {
        expect(res.status).to.eq(expected.expectedStatus);
        expect(res.body.success).to.be.true;

        const project = res.body.project;
        createdProjectId = project.id;

        expect(project.id).to.be.a('string').and.have.length.greaterThan(0);
        expect(project.teamId).to.eq(testTeamId);
        expect(project.name).to.eq(expected.project.name);
        expect(project.type).to.eq(expected.project.type);
        expect(project.status).to.eq(expected.project.status);
        expect(project.expectedCollaborators).to.eq(expected.project.expectedCollaborators);
      });
    });
  });

  it('POST /api/teams/projects/:id/documents saves documents and returns them', () => {
    cy.request('POST', `${apiUrl}/auth/login`, { email, password }).then(loginRes => {
      const userId = String(loginRes.body.userid);
      const p = td.projects.documentSave;

      cy.request('POST', `${apiUrl}/teams/projects`, {
        userId,
        teamId:               testTeamId,
        name:                 p.name,
        description:          p.description,
        deadline:             p.deadline,
        type:                 p.type,
        expectedCollaborators: p.expectedCollaborators,
        completedStep:        p.completedStep,
      }).then(createRes => {
        const projectId = createRes.body.project.id;
        createdProjectId = projectId;

        cy.request('POST', `${apiUrl}/teams/projects/${projectId}/documents`, {
          documents: td.documents.standard3WithDocx,
        }).then(docsRes => {
          expect(docsRes.status).to.be.oneOf([200, 201]);
          expect(docsRes.body.success).to.be.true;
          expect(docsRes.body.project.completedStep).to.be.at.least(
            td.assertions.documentSave.expectedCompletedStep
          );
        });
      });
    });
  });

  it('DELETE /api/teams/projects/:id removes the project', () => {
    cy.request('POST', `${apiUrl}/auth/login`, { email, password }).then(loginRes => {
      const userId = String(loginRes.body.userid);
      const p = td.projects.deleteProject;

      cy.request('POST', `${apiUrl}/teams/projects`, {
        userId,
        teamId:               testTeamId,
        name:                 p.name,
        description:          p.description,
        deadline:             p.deadline,
        type:                 p.type,
        expectedCollaborators: p.expectedCollaborators,
        completedStep:        p.completedStep,
      }).then(createRes => {
        expect(createRes.status).to.eq(201);
        const projectId = createRes.body.project.id;

        cy.request('DELETE', `${apiUrl}/teams/projects/${projectId}`).then(deleteRes => {
          expect(deleteRes.status).to.eq(td.assertions.deleteProject.expectedDeleteStatus);
          expect(deleteRes.body.success).to.be.true;
        });

        // Verify it is gone — a second DELETE should return 404
        cy.request({
          method: 'DELETE',
          url: `${apiUrl}/teams/projects/${projectId}`,
          failOnStatusCode: false,
        }).then(secondDelete => {
          expect(secondDelete.status).to.eq(404);
        });
      });
    });
  });

  it('DELETE /api/teams/:id removes the team', () => {
    cy.request('POST', `${apiUrl}/auth/login`, { email, password }).then(loginRes => {
      const userId = String(loginRes.body.userid);
      const t = td.teamToDelete;

      cy.request('POST', `${apiUrl}/teams`, {
        userId,
        name:        t.name,
        description: t.description,
        icon:        t.icon,
        members:     t.members,
      }).then(createRes => {
        expect(createRes.status).to.eq(201);
        const teamId = createRes.body.team.id;

        cy.request('DELETE', `${apiUrl}/teams/${teamId}`).then(deleteRes => {
          expect(deleteRes.status).to.eq(td.assertions.deleteTeam.expectedDeleteStatus);
          expect(deleteRes.body.success).to.be.true;
        });

        // Verify it is gone — a second DELETE should return 404
        cy.request({
          method: 'DELETE',
          url: `${apiUrl}/teams/${teamId}`,
          failOnStatusCode: false,
        }).then(secondDelete => {
          expect(secondDelete.status).to.eq(404);
        });
      });
    });
  });

  it('PATCH /api/teams/projects/:id updates project details', () => {
    cy.request('POST', `${apiUrl}/auth/login`, { email, password }).then(loginRes => {
      const userId = String(loginRes.body.userid);
      const p = td.projects.updateProject;
      const updated = td.projects.updatedProject;
      const expected = td.assertions.updateProject;

      cy.request('POST', `${apiUrl}/teams/projects`, {
        userId,
        teamId:               testTeamId,
        name:                 p.name,
        description:          p.description,
        deadline:             p.deadline,
        type:                 p.type,
        expectedCollaborators: p.expectedCollaborators,
        completedStep:        p.completedStep,
      }).then(createRes => {
        expect(createRes.status).to.eq(201);
        const projectId = createRes.body.project.id;
        createdProjectId = projectId;

        cy.request('PATCH', `${apiUrl}/teams/projects/${projectId}`, {
          name:                 updated.name,
          description:          updated.description,
          deadline:             updated.deadline,
          expectedCollaborators: updated.expectedCollaborators,
        }).then(patchRes => {
          expect(patchRes.status).to.eq(expected.expectedStatus);
          expect(patchRes.body.success).to.be.true;

          const project = patchRes.body.project;
          expect(project.name).to.eq(expected.project.name);
          expect(project.description).to.eq(expected.project.description);
          expect(project.expectedCollaborators).to.eq(expected.project.expectedCollaborators);
          expect(project.status).to.eq(expected.project.status);
          expect(project.deadline).to.include(expected.project.deadline);
        });
      });
    });
  });

  it('PATCH /api/teams/projects/:id with status=active assigns a project code', () => {
    cy.request('POST', `${apiUrl}/auth/login`, { email, password }).then(loginRes => {
      const userId = String(loginRes.body.userid);
      const p = td.projects.activation;

      cy.request('POST', `${apiUrl}/teams/projects`, {
        userId,
        teamId:               testTeamId,
        name:                 p.name,
        description:          p.description,
        deadline:             p.deadline,
        type:                 p.type,
        expectedCollaborators: p.expectedCollaborators,
        completedStep:        p.completedStep,
      }).then(createRes => {
        const projectId = createRes.body.project.id;
        createdProjectId = projectId;

        cy.request('PATCH', `${apiUrl}/teams/projects/${projectId}`, {
          status:        td.assertions.activation.expectedStatus,
          completedStep: 3,
        }).then(activateRes => {
          expect(activateRes.status).to.be.oneOf([200, 201]);
          expect(activateRes.body.success).to.be.true;

          const activated = activateRes.body.project;
          expect(activated.status).to.eq(td.assertions.activation.expectedStatus);
          expect(activated.projectCode).to.be.a('string').and.have.length.greaterThan(0);

          cy.log(`Server-issued project code: ${activated.projectCode}`);
        });
      });
    });
  });
});
