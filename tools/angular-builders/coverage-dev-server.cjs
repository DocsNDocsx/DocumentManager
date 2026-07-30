const { createBuilder } = require('@angular-devkit/architect');
const { executeDevServerBuilder } = require('@angular/build');
const { createInstrumenter } = require('istanbul-lib-instrument');

function createCoveragePlugin() {
  const instrumenter = createInstrumenter({
    coverageVariable: '__coverage__',
    compact: false,
    esModules: true,
    produceSourceMap: true,
  });

  return {
    name: 'docsndocs-istanbul-coverage',
    setup(build) {
      build.onEnd(result => {
        if (!process.env.CYPRESS_COVERAGE && !process.env.CYPRESS_coverage) {
          return;
        }

        for (const file of result.outputFiles ?? []) {
          const isApplicationScript = file.path.endsWith('.js') && !file.path.includes('polyfills');
          if (!isApplicationScript) {
            continue;
          }

          const code = file.text;
          if (code.includes('__coverage__')) {
            continue;
          }

          file.contents = Buffer.from(instrumenter.instrumentSync(code, file.path));
        }
      });
    },
  };
}

module.exports = createBuilder((options, context) => {
  return executeDevServerBuilder(options, context, {
    buildPlugins: [createCoveragePlugin()],
  });
});
