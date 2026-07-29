describe('Solo public project activation - subscription gate', () => {
  const email = Cypress.env('TEST_EMAIL') as string;
  const password = Cypress.env('TEST_PASSWORD') as string;
  const apiUrl = Cypress.env('apiUrl') as string;
  let createdProjectId: string | null = null;

  beforeEach(() => {
    cy.loginByApi(email, password);
  });

  afterEach(() => {
    if (!createdProjectId) return;
    cy.request({
      method: 'DELETE',
      url: `${apiUrl}/projects/${createdProjectId}`,
      failOnStatusCode: false,
    });
    createdProjectId = null;
  });

  it('checks subscription when activating a public solo project', () => {
    const projectName = `Cypress Solo Public Activation ${Date.now()}`;

    cy.intercept('POST', `${apiUrl}/projects`).as('createProject');
    cy.intercept('PATCH', `${apiUrl}/projects/*`).as('updateProject');
    cy.intercept('PATCH', `${apiUrl}/projects/*/activate`).as('activateProject');

    cy.visit('/new-solo-project/public/details');

    cy.get('#projectName').type(projectName);
    cy.get('#projectDescription').type('Draft created by Cypress activation verification.');
    cy.get('#projectDeadline').type('2027-12-31');
    cy.get('#expectedCollaborators').type('5');
    cy.contains('button', 'Continue').should('not.be.disabled').click();

    cy.wait('@createProject').then(interception => {
      expect(interception.response?.statusCode).to.eq(201);
      createdProjectId = interception.response?.body.project.id;
      expect(interception.response?.body.project).to.include({
        status: 'draft',
        type: 'public',
      });
    });

    cy.url().should('include', '/new-solo-project/public/documents');
    cy.get('#documentCount').type('{selectall}1');
    cy.contains('button', 'Generate Forms').click();
    cy.get('#docName0').type('Activation Test Document');
    cy.get('#docSize0').type('{selectall}10');
    cy.get('.doc-card').first().find('input[type="checkbox"]').first().check();
    cy.contains('button', 'Continue').should('not.be.disabled').click();

    cy.wait('@updateProject').then(interception => {
      expect(interception.response?.statusCode).to.eq(200);
      expect(interception.response?.body.project.documents).to.have.length(1);
    });

    cy.url().should('include', '/new-solo-project/public/decision');
    cy.contains(projectName).should('be.visible');
    cy.contains('button', 'Activate Project').click();
    cy.contains('Activate Public Project?').should('be.visible');
    cy.get('.btn-modal-confirm').click();

    cy.wait('@activateProject').then(interception => {
      const status = interception.response?.statusCode;
      expect([200, 402], 'activation response should be success or subscription required').to.include(status);

      if (status === 402) {
        expect(interception.response?.body).to.include({
          code: 'SUBSCRIPTION_REQUIRED',
        });
        cy.url().should('include', '/pricing-plan');
        cy.url().should('include', 'subscriptionRequired=1');
        cy.url().should('include', 'type=solo');
      } else {
        const project = interception.response?.body.project;
        expect(project.status).to.eq('active');
        expect(project.projectCode).to.match(/^PRJ-/);
        cy.get('.project-code-display').should('be.visible');
      }
    });
  });
});
