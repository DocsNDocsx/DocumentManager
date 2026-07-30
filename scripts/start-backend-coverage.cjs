const { spawn } = require('node:child_process');
const path = require('node:path');
const dotenv = require('../backend/node_modules/dotenv');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const nycBin = path.join(rootDir, 'node_modules', 'nyc', 'bin', 'nyc.js');
const backendEnv = dotenv.config({ path: path.join(backendDir, '.env') }).parsed ?? {};

const env = {
  ...process.env,
  ...backendEnv,
  NODE_ENV: 'test',
};

if (!env.STRIPE_SECRET_KEY) {
  env.STRIPE_SECRET_KEY = 'sk_test_cypress_placeholder';
}

const child = spawn(
  process.execPath,
  [
    nycBin,
    '--silent',
    '--no-clean',
    '--temp-dir',
    '../.nyc_output',
    '--report-dir',
    '../coverage/backend',
    'node',
    'server.js',
  ],
  {
    cwd: backendDir,
    env,
    stdio: 'inherit',
  }
);

child.on('exit', code => {
  process.exit(code ?? 0);
});
