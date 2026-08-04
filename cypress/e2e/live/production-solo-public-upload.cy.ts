describe('Production solo public private-Blob upload', () => {
  it('uploads a new document through the collaborator workspace', () => {
    const apiUrl = Cypress.env('apiUrl') as string;
    const email = Cypress.env('TEST_EMAIL') as string;
    const password = Cypress.env('TEST_PASSWORD') as string;

    expect(email, 'TEST_EMAIL is required').to.be.a('string').and.not.be.empty;
    expect(password, 'TEST_PASSWORD is required').to.be.a('string').and.not.be.empty;

    cy.request('POST', `${apiUrl}/auth/login`, { email, password }).then(loginResponse => {
      const { token, userid, firstname, lastname, avatarPath } = loginResponse.body;
      const headers = { Authorization: `Bearer ${token}` };

      cy.request({
        method: 'GET',
        url: `${apiUrl}/projects?userid=${userid}`,
        headers,
      }).then(projectResponse => {
        const projects = projectResponse.body.projects as Array<any>;
        const candidates = projects.filter(project =>
          project.type === 'public' &&
          project.status === 'active' &&
          String(project.userId) !== String(userid),
        );

        expect(candidates.length, 'an active public project joined by the production test account').to.be.greaterThan(0);

        const findUnusedSlot = (index: number): Cypress.Chainable<any> => {
          const project = candidates[index];
          if (!project) {
            throw new Error('No unsubmitted PDF slot exists for the production test account');
          }
          const collabIndex = project.collaborators.findIndex((collaborator: any) =>
            String(collaborator.userId ?? collaborator.userid ?? '') === String(userid) ||
            String(collaborator.email ?? '').toLowerCase() === email.toLowerCase(),
          );
          if (collabIndex < 0) return findUnusedSlot(index + 1);

          return cy.request({
            method: 'GET',
            url: `${apiUrl}/projects/${project.id}/submissions?collabIndex=${collabIndex}`,
            headers,
          }).then(submissionResponse => {
            const submissions = submissionResponse.body.submissions as Array<any>;
            const usedIndexes = new Set(submissions.map(submission => Number(submission.document_index)));
            const docIndex = project.documents.findIndex((document: any, documentIndex: number) =>
              !usedIndexes.has(documentIndex) &&
              (document.fileTypes ?? []).map((format: string) => format.toUpperCase()).includes('PDF'),
            );
            return docIndex >= 0 ? { project, collabIndex, docIndex } : findUnusedSlot(index + 1);
          });
        };

        findUnusedSlot(0).then(({ project, collabIndex, docIndex }) => {
          cy.visit(`/collaborator-view/${project.id}/${collabIndex}`, {
            onBeforeLoad(window) {
              window.localStorage.setItem('auth_token', token);
              window.localStorage.setItem('user_id', String(userid));
              window.localStorage.setItem('user_firstname', firstname ?? 'Production');
              window.localStorage.setItem('user_lastname', lastname ?? 'Test');
              window.localStorage.setItem('user_email', email);
              window.localStorage.setItem('user_avatar', avatarPath ?? '');
            },
          });

          cy.contains('h1', project.name, { timeout: 20000 }).should('be.visible');
          cy.intercept('POST', `${apiUrl}/projects/${project.id}/submissions/upload-token`).as('uploadToken');
          cy.intercept('POST', `${apiUrl}/projects/${project.id}/submissions`).as('recordSubmission');

          cy.get(`#file-${docIndex}`).selectFile({
            contents: Cypress.Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'),
            fileName: `production-upload-${Date.now()}.pdf`,
            mimeType: 'application/pdf',
          }, { force: true });
          cy.get(`#file-${docIndex}`).closest('.document-card').within(() => {
            cy.contains('button', 'Submit Document').click();
          });

          cy.wait('@uploadToken', { timeout: 30000 }).its('response.statusCode').should('eq', 200);
          cy.wait('@recordSubmission', { timeout: 60000 }).its('response.statusCode').should('eq', 201);
          cy.contains('Document Submitted!', { timeout: 10000 }).should('be.visible');
        });
      });
    });
  });
});
