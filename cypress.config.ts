import { defineConfig } from 'cypress';
import registerCodeCoverageTasks from '@cypress/code-coverage/task';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4200',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    fixturesFolder: 'cypress/testdata',
    viewportWidth: 1280,
    viewportHeight: 800,
    defaultCommandTimeout: 10000,
    video: false,
    screenshotOnRunFailure: true,
    setupNodeEvents(on, config) {
      if (String(config.env['coverage']).toLowerCase() === 'false') {
        return config;
      }

      registerCodeCoverageTasks(on, config);
      return config;
    },
  },
  env: {
    apiUrl: 'http://localhost:3000/api',
  },
  expose: {
    codeCoverage: {
      url: 'http://localhost:3000/__coverage__',
      exclude: ['cypress/**/*.*'],
    },
  },
});
