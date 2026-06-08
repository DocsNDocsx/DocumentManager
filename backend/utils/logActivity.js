const { randomUUID } = require('crypto');
const pool = require('./sql');

/**
 * Logs an activity event to the activity_log table.
 * Fires-and-forgets — errors are only logged, never thrown,
 * so a logging failure never breaks the main request.
 *
 * @param {number|string} userId - The project owner's user_id
 * @param {string} type - Activity type: 'upload'|'invite'|'team'|'decision'|'delete'|'settings'
 * @param {string} title - Human-readable description
 * @param {string|null} actor - Display name of the person who triggered the event, or null
 * @param {string|null} projectName - Name of the project associated with the event, or null
 */
async function logActivity(userId, type, title, actor = null, projectName = null) {
  try {
    await pool.query(
      `INSERT INTO activity_log (id, user_id, type, title, actor, project_name) VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), userId, type, title, actor, projectName]
    );
  } catch (err) {
    console.error('Activity log error:', err);
  }
}

module.exports = logActivity;
