const fs = require('node:fs');
const path = require('node:path');

const summaryPath = path.resolve(__dirname, '..', 'coverage', 'coverage-summary.json');

if (!fs.existsSync(summaryPath)) {
  console.error('No coverage summary found. Run `npm run test:e2e:coverage` first.');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const total = summary.total;

function line(label, metric) {
  const data = total[metric];
  return `${label.padEnd(12)} : ${String(data.pct).padEnd(6)}% ( ${data.covered}/${data.total} )`;
}

console.log('');
console.log('=============================== Coverage summary ===============================');
console.log(line('Statements', 'statements'));
console.log(line('Branches', 'branches'));
console.log(line('Functions', 'functions'));
console.log(line('Lines', 'lines'));
console.log('================================================================================');
