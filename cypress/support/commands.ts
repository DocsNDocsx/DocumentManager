/// <reference types="cypress" />

declare global {
  namespace Cypress {
    interface Chainable {
      loginByApi(email: string, password: string): Chainable<void>;
      cleanupTestTeamProjects(userId: string): Chainable<void>;
    }
  }
}

/**
 * Logs in via the real API and writes auth state to localStorage
 * so the Angular app treats the session as authenticated.
 */
Cypress.Commands.add('loginByApi', (email: string, password: string) => {
  cy.request('POST', `${Cypress.env('apiUrl')}/auth/login`, { email, password }).then(res => {
    const { token, userid, firstname, lastname, avatarPath } = res.body;
    window.localStorage.setItem('auth_token',     token);
    window.localStorage.setItem('user_id',        String(userid));
    window.localStorage.setItem('user_firstname', firstname);
    window.localStorage.setItem('user_lastname',  lastname);
    window.localStorage.setItem('user_email',     email);
    window.localStorage.setItem('user_avatar',    avatarPath ?? '');
  });
});

/**
 * Deletes any team_projects rows created during tests so the database
 * stays clean between runs.
 */
Cypress.Commands.add('cleanupTestTeamProjects', (userId: string) => {
  cy.request({
    method: 'GET',
    url: `${Cypress.env('apiUrl')}/teams?userId=${userId}`,
    failOnStatusCode: false,
  });
});

export {};
