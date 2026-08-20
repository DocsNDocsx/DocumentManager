const pool = require('./sql');
const { sendEmail } = require('./emailservice');

const isMySQL = (process.env.DB_CLIENT ?? 'pg') === 'mysql';
const REMINDER_DAYS = [14];

const daysSinceUpdate = column => isMySQL
  ? `DATEDIFF(CURDATE(), DATE(${column}))`
  : `(CURRENT_DATE - ${column}::date)`;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function reminderBody(project, inactiveDays) {
  const daysRemaining = 15 - inactiveDays;
  const ownerName = [project.firstname, project.lastname].filter(Boolean).join(' ') || 'Project owner';
  const appBaseUrl = (process.env.APP_BASE_URL || 'https://docsndocs.com').replace(/\/$/, '');
  const projectListPath = project.project_kind === 'team'
    ? '/top-menu-team-projects'
    : '/top-menu-solo-projects';
  const timing = 'This is the final reminder: the project is scheduled for permanent deletion tomorrow at 11:30 PM.';

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2937">
      <div style="background:#176b57;padding:24px;text-align:center">
        <img src="{{EMAIL_LOGO_URL}}" alt="DocsNDocs" style="max-width:190px;height:auto">
      </div>
      <div style="padding:28px;border:1px solid #e5e7eb;border-top:0">
        <p>Hello ${escapeHtml(ownerName)},</p>
        <p>Your inactive project <strong>${escapeHtml(project.name)}</strong> has not been updated for ${inactiveDays} days.</p>
        <p>${timing} This will remove the project and all associated documents, submissions, templates, and attachments.</p>
        <p>Open or update the project before deletion if you need to keep it.</p>
        <p><a href="${escapeHtml(appBaseUrl + projectListPath)}" style="display:inline-block;background:#176b57;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px">View projects</a></p>
      </div>
    </div>`;
}

async function reminderProjects() {
  const dayMarks = REMINDER_DAYS.map(() => '?').join(', ');
  const [solo] = await pool.query(
    `SELECT p.id, p.name, p.updated_at, u.email, u.firstname, u.lastname,
            'solo' AS project_kind, ${daysSinceUpdate('p.updated_at')} AS inactive_days
     FROM projects p
     JOIN users u ON u.userid = p.user_id
     WHERE p.status <> 'active'
       AND ${daysSinceUpdate('p.updated_at')} IN (${dayMarks})`,
    REMINDER_DAYS,
  );
  const [team] = await pool.query(
    `SELECT tp.id, tp.name, tp.updated_at, u.email, u.firstname, u.lastname,
            'team' AS project_kind, ${daysSinceUpdate('tp.updated_at')} AS inactive_days
     FROM team_projects tp
     JOIN teams t ON t.id = tp.team_id
     JOIN users u ON u.userid = t.user_id
     WHERE tp.status <> 'active'
       AND ${daysSinceUpdate('tp.updated_at')} IN (${dayMarks})`,
    REMINDER_DAYS,
  );
  return [...solo, ...team];
}

async function sendStaleProjectReminders() {
  const projects = await reminderProjects();
  let sent = 0;
  let failed = 0;

  for (const project of projects) {
    const inactiveDays = Number(project.inactive_days);
    const daysRemaining = 15 - inactiveDays;

    try {
      await sendEmail(
        project.email,
        daysRemaining === 1
          ? `DocsNDocs: Final deletion reminder for "${project.name}"`
          : `DocsNDocs: "${project.name}" will be deleted in ${daysRemaining} days`,
        reminderBody(project, inactiveDays),
      );
      sent++;
    } catch (error) {
      failed++;
      console.error(`[stale-project-reminder] Failed for ${project.email}:`, error.message);
    }
  }

  console.log(`[stale-project-reminder] Sent ${sent} reminder(s); ${failed} failed`);
  return { sent, failed };
}

module.exports = { sendStaleProjectReminders, REMINDER_DAYS };
