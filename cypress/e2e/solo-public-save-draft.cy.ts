describe('Solo public project details - save as draft', () => {
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

  it('creates a draft from /new-solo-project/public/details', () => {
    const projectName = `Cypress Solo Public Draft ${Date.now()}`;

    cy.intercept('POST', `${apiUrl}/projects`).as('createProject');
    cy.visit('/new-solo-project/public/details');

    cy.get('#projectName').type(projectName);
    cy.get('#projectDescription').type('Draft created by Cypress save-as-draft verification.');
    cy.get('#projectDeadline').type('2027-12-31');
    cy.get('#expectedCollaborators').type('5');
    cy.get('#supportFirstName').type('Casey');
    cy.get('#supportLastName').type('Support');
    cy.get('#supportEmail').type('casey.support@cypress-e2e.test');
    cy.get('#supportAffiliation').type('DocsNDocs QA');

    cy.contains('button', 'Save as Draft').should('not.be.disabled').click();

    cy.wait('@createProject').then(interception => {
      expect(interception.response?.statusCode).to.eq(201);
      const project = interception.response?.body.project;
      expect(project).to.include({
        name: projectName,
        status: 'draft',
        type: 'public',
        expectedCollaborators: 5,
      });
      expect(project.staff.email).to.eq('casey.support@cypress-e2e.test');
      createdProjectId = project.id;
    });

    cy.url().should('match', /\/new-solo-project\/public\/[^/]+\/details$/);
  });
});
