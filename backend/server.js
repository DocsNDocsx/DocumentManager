require('dotenv').config();

const REQUIRED_ENV = ['JWT_SECRET', 'SMTP2GO_API_KEY', 'CRON_SECRET', 'STRIPE_SECRET_KEY'];
const missing = REQUIRED_ENV.filter(k => !process.env[k] || process.env[k].startsWith('your-'));
if (missing.length) {
  console.error(`[startup] Missing or placeholder env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const app = require('./app');
const db = require('./utils/sql');
const { sendDeadlineReminders } = require('./utils/deadlineReminder');

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  validateDb();
  // On Vercel, cron calls the /api/internal/deadline-reminders endpoint instead
  if (!process.env.VERCEL) scheduleDeadlineReminders();
});

function scheduleDeadlineReminders() {
  // Runs every day at 09:00 local server time
  function msUntil9am() {
    const now = new Date();
    const next = new Date();
    next.setHours(9, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
  }

  function tick() {
    sendDeadlineReminders().catch(err =>
      console.error('[deadline-reminder] Unexpected error:', err.message)
    );
    setTimeout(tick, msUntil9am() + 86400000); // schedule next day's run
  }

  setTimeout(tick, msUntil9am());
  console.log(`[deadline-reminder] Scheduled daily at 09:00`);
}

async function validateDb() {
  const client = process.env.DB_CLIENT ?? 'pg';
  try {
    const sql = client === 'mysql'
      ? "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()"
      : "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'";

    const [rows] = await db.query(sql);
    const tables = rows.map(r => r.table_name ?? r.TABLE_NAME);

    const required = ['users', 'projects', 'submissions', 'teams', 'team_members',
      'team_projects', 'team_project_collaborators', 'team_project_submissions'];
    const missing = required.filter(t => !tables.includes(t));

    if (missing.length > 0) {
      console.error(`[db] ❌ Connected (${client}) but missing tables: ${missing.join(', ')}`);
    } else {
      console.log(`[db] ✅ Connected (${client}) — all required tables present`);
    }
  } catch (err) {
    console.error(`[db] ❌ Connection failed (${client}):`, err.message);
  }
}
