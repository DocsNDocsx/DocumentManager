const apiUrl = Cypress.env('apiUrl') as string;

function signInLocally() {
  window.localStorage.setItem('auth_token', 'cypress-local-token');
  window.localStorage.setItem('user_id', '1785326001');
  window.localStorage.setItem('user_firstname', 'Cypress');
  window.localStorage.setItem('user_lastname', 'Tester');
  window.localStorage.setItem('user_email', 'cypress.local@example.com');
  window.localStorage.setItem('user_avatar', '');
}

describe('Local frontend coverage smoke paths', () => {
  beforeEach(() => {
    cy.intercept('GET', `${apiUrl}/dashboard/stats*`, {
      activeProjects: 2,
      soloProjects: 1,
      teamProjects: 1,
      documentsCollected: 8,
      documentsThisWeek: 3,
      activeCollaborators: 4,
      storageUsedPercent: 12,
      storageUsedLabel: '1.2 GB',
    }).as('dashboardStats');

    cy.intercept('GET', `${apiUrl}/dashboard/recent-projects*`, {
      projects: [
        {
          id: 'local-public-project',
          name: 'Local Coverage Public Project',
          type: 'solo',
          visibility: 'public',
          documentCount: 3,
          submittedCount: 1,
          totalExpected: 4,
          collaboratorCount: 4,
          deadline: '2026-12-31',
          isOngoing: false,
          projectCode: 'COV123',
          teamName: null,
        },
      ],
    }).as('recentProjects');

    cy.intercept('GET', `${apiUrl}/dashboard/activity*`, {
      activities: [
        {
          id: 'activity-1',
          type: 'upload',
          title: 'Document uploaded',
          actor: 'Cypress Tester',
          timestamp: new Date().toISOString(),
        },
      ],
    }).as('dashboardActivity');
  });

  it('covers public homepage and pricing copy', () => {
    cy.visit('/');

    cy.contains('Streamline Your').should('be.visible');
    cy.contains('Document Collection').should('be.visible');
    cy.contains('Simple, Usage-Based Pricing').should('be.visible');
    cy.contains('See How It Works').click();
    cy.contains('h2', 'How It Works').should('be.visible');
  });

  it('covers sign-in validation and API error state', () => {
    cy.intercept('POST', `${apiUrl}/auth/login`, {
      statusCode: 401,
      body: { success: false, message: 'Invalid email or password' },
    }).as('loginFailure');

    cy.visit('/sign-in');
    cy.get('#emailField').type('wrong@example.com');
    cy.get('#passwordField').type('bad-password');
    cy.get('#togglePassword').click();
    cy.get('button[type="submit"]').click();

    cy.wait('@loginFailure');
    cy.contains('Invalid email or password').should('be.visible');
  });

  it('covers dashboard with mocked local API data', () => {
    cy.visit('/dashboard', { onBeforeLoad: signInLocally });

    cy.wait(['@dashboardStats', '@recentProjects', '@dashboardActivity']);
    cy.contains('h1', 'Dashboard').should('be.visible');
    cy.contains('Local Coverage Public Project').should('be.visible');
    cy.contains('Storage Used').should('be.visible');
    cy.contains('Document uploaded').should('be.visible');
  });

  it('covers public solo project draft flow with mocked API save', () => {
    cy.intercept('POST', `${apiUrl}/projects`, req => {
      expect(req.body).to.include({
        userid: '1785326001',
        type: 'public',
        status: 'draft',
        completedStep: 1,
      });

      req.reply({
        statusCode: 201,
        body: {
          project: {
            id: 'coverage-project-1',
            name: req.body.name,
            description: req.body.description,
            deadline: req.body.deadline,
            attachments: req.body.attachments,
            expectedCollaborators: req.body.expectedCollaborators,
            staff: req.body.staff,
            collaborators: [],
            documents: [],
            assignments: {},
            completedStep: 1,
            projectCode: null,
            type: 'public',
            status: 'draft',
          },
        },
      });
    }).as('createProject');

    cy.visit('/new-solo-project/public/details', { onBeforeLoad: signInLocally });

    cy.get('#projectName').type('Local Coverage Draft');
    cy.get('#projectDescription').type('Coverage-only draft created with mocked API responses.');
    cy.get('#projectDeadline').type('2026-12-31');
    cy.get('#expectedCollaborators').type('5');
    cy.get('#supportFirstName').type('Casey');
    cy.get('#supportLastName').type('Support');
    cy.get('#supportEmail').type('casey.coverage@example.com');
    cy.get('#supportAffiliation').type('DocsNDocs QA');
    cy.contains('button', 'Save as Draft').click();

    cy.wait('@createProject');
    cy.location('pathname').should('eq', '/new-solo-project/public/coverage-project-1/details');
  });
});
