const fs = require('fs');
const path = require('path');
const pool = require('./sql');
const { sendEmail } = require('./emailservice');
const { escapeHtml } = require('./html');

const isMySQL = (process.env.DB_CLIENT ?? 'pg') === 'mysql';
const REMINDER_DAYS = [7, 3, 1];

// Returns an SQL expression for the number of days between a date column and today
const daysUntil = col => isMySQL
  ? `DATEDIFF(DATE(${col}), CURDATE())`
  : `(${col}::date - CURRENT_DATE)`;

function buildBody(template, { collaboratorName, projectName, deadlineDate, daysLeft }) {
  const label = daysLeft === 1 ? 'day remaining' : 'days remaining';
  return template
    .replaceAll('{{BASE_URL}}',          escapeHtml(process.env.APP_BASE_URL ?? ''))
    .replaceAll('{{COLLABORATOR_NAME}}', escapeHtml(collaboratorName))
    .replaceAll('{{PROJECT_NAME}}',      escapeHtml(projectName))
    .replaceAll('{{DEADLINE_DATE}}',     escapeHtml(deadlineDate))
    .replaceAll('{{DAYS_LEFT}}',         String(daysLeft))
    .replaceAll('{{DAYS_LEFT_LABEL}}',   label);
}

async function processSoloProjects(days, template) {
  let sent = 0;
  const [projects] = await pool.query(
    `SELECT id, name, type, deadline, collaborators, documents, assignments
     FROM projects
     WHERE status = 'active'
       AND deadline IS NOT NULL
       AND ${daysUntil('deadline')} = ?`,
    [days]
  );

  for (const project of projects) {
    const collaborators = typeof project.collaborators === 'string'
      ? JSON.parse(project.collaborators) : (project.collaborators ?? []);
    const assignments = typeof project.assignments === 'string'
      ? JSON.parse(project.assignments) : (project.assignments ?? {});
    const documents = typeof project.documents === 'string'
      ? JSON.parse(project.documents) : (project.documents ?? []);

    for (let i = 0; i < collaborators.length; i++) {
      const collab = collaborators[i];
      if (!collab?.email) continue;

      const requiredDocs = project.type === 'public'
        ? documents.map((_, index) => index)
        : (assignments[String(i)] ?? []);
      if (requiredDocs.length === 0) continue;

      const [subs] = await pool.query(
        `SELECT document_index FROM submissions
         WHERE project_id = ? AND collaborator_index = ? AND status IN ('submitted','approved')`,
        [project.id, i]
      );
      const submitted = new Set(subs.map(s => s.document_index));
      const pending = requiredDocs.filter(d => !submitted.has(d));
      if (pending.length === 0) continue;

      const name = [collab.firstName, collab.lastName].filter(Boolean).join(' ') || 'Collaborator';
      try {
        const body = buildBody(template, {
          collaboratorName: name,
          projectName: project.name,
          deadlineDate: new Date(project.deadline).toDateString(),
          daysLeft: days,
        });
        await sendEmail(
          collab.email,
          `DocsNDocs: Reminder — "${project.name}" deadline in ${days} day${days === 1 ? '' : 's'}`,
          body
        );
        sent++;
      } catch (e) {
        console.error(`[deadline-reminder] Failed for ${collab.email}:`, e.message);
      }
    }
  }
  return sent;
}

async function processTeamProjects(days, template) {
  let sent = 0;
  const [rows] = await pool.query(
    `SELECT tp.id, tp.name, tp.deadline, tp.documents,
            tpc.id AS collab_id, tpc.email, tpc.first_name, tpc.last_name
     FROM team_projects tp
     JOIN team_project_collaborators tpc ON tpc.project_id = tp.id
     WHERE tp.status = 'active'
       AND tp.deadline IS NOT NULL
       AND ${daysUntil('tp.deadline')} = ?
       AND tpc.email IS NOT NULL`,
    [days]
  );

  for (const row of rows) {
    const documents = typeof row.documents === 'string'
      ? JSON.parse(row.documents) : (row.documents ?? []);
    if (documents.length === 0) continue;

    const [subs] = await pool.query(
      `SELECT document_index FROM team_project_submissions
       WHERE collaborator_id = ? AND status IN ('submitted','approved')`,
      [row.collab_id]
    );
    const submitted = new Set(subs.map(s => s.document_index));
    const pendingCount = documents.filter((_, idx) => !submitted.has(idx)).length;
    if (pendingCount === 0) continue;

    const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Collaborator';
    try {
      const body = buildBody(template, {
        collaboratorName: name,
        projectName: row.name,
        deadlineDate: new Date(row.deadline).toDateString(),
        daysLeft: days,
      });
      await sendEmail(
        row.email,
        `DocsNDocs: Reminder — "${row.name}" deadline in ${days} day${days === 1 ? '' : 's'}`,
        body
      );
      sent++;
    } catch (e) {
      console.error(`[deadline-reminder] Failed for ${row.email}:`, e.message);
    }
  }
  return sent;
}

async function sendDeadlineReminders() {
  await pool.query(
    "UPDATE projects SET status = 'completed' WHERE status = 'active' AND deadline IS NOT NULL AND deadline < CURRENT_DATE",
  );
  await pool.query(
    "UPDATE team_projects SET status = 'completed' WHERE status = 'active' AND deadline IS NOT NULL AND deadline < CURRENT_DATE",
  );
  const template = fs.readFileSync(
    path.join(__dirname, '../templates-email/reminderdeadline.html'), 'utf8'
  );

  let total = 0;
  for (const days of REMINDER_DAYS) {
    const [solo, team] = await Promise.all([
      processSoloProjects(days, template),
      processTeamProjects(days, template),
    ]);
    const count = solo + team;
    if (count > 0) console.log(`[deadline-reminder] ${days}d window: ${count} reminder(s) sent`);
    total += count;
  }

  console.log(`[deadline-reminder] Done — ${total} total reminder(s) sent`);
  return total;
}

module.exports = { sendDeadlineReminders };
