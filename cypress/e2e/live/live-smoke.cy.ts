describe('DocsNDocs live website smoke checks', () => {
  it('loads the public homepage', () => {
    cy.visit('/');

    cy.get('img[alt="DocsNDocs logo"]').first().should('be.visible');
    cy.contains('h1', 'Streamline Your').should('be.visible');
    cy.contains('Document Collection').should('be.visible');
    cy.contains('a', 'Sign In').should('have.attr', 'href').and('include', '/sign-in');
  });

  it('loads the sign-in page', () => {
    cy.visit('/sign-in');

    cy.contains('h1', 'Sign In').should('be.visible');
    cy.get('#emailField').should('be.visible').and('have.attr', 'type', 'email');
    cy.get('#passwordField').should('be.visible');
    cy.get('button[type="submit"]').should('contain.text', 'Sign In');
  });

  it('redirects protected dashboard traffic to sign-in when logged out', () => {
    cy.clearLocalStorage();
    cy.visit('/dashboard');

    cy.location('pathname', { timeout: 10000 }).should('eq', '/sign-in');
    cy.contains('h1', 'Sign In').should('be.visible');
  });

  it('opens the dashboard for a valid live account', function () {
    const email = Cypress.env('TEST_EMAIL');
    const password = Cypress.env('TEST_PASSWORD');

    if (!email || !password) {
      this.skip();
    }

    cy.loginByApi(email, password);
    cy.visit('/dashboard');

    cy.location('pathname', { timeout: 10000 }).should('eq', '/dashboard');
    cy.contains('h1', 'Dashboard').should('be.visible');
    cy.contains('Active Projects').should('be.visible');
    cy.contains('Storage Used').should('be.visible');
  });
});
