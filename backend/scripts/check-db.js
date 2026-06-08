require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../utils/sql');

const client = process.env.DB_CLIENT ?? 'pg';
const sql = client === 'mysql'
  ? 'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()'
  : "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'";

const required = [
  'users', 'projects', 'submissions', 'teams', 'team_members',
  'team_projects', 'team_project_collaborators', 'team_project_submissions',
];

db.query(sql)
  .then(([rows]) => {
    const tables = rows.map(r => r.table_name ?? r.TABLE_NAME);
    console.log(`Connected as: ${client}`);
    console.log(`Tables found (${tables.length}): ${tables.join(', ') || '(none)'}`);
    const missing = required.filter(t => !tables.includes(t));
    if (missing.length) {
      console.error(`Missing tables: ${missing.join(', ')}`);
    } else {
      console.log('All required tables present');
    }
    process.exit(0);
  })
  .catch(err => {
    console.error('Connection failed:', err.message);
    process.exit(1);
  });
