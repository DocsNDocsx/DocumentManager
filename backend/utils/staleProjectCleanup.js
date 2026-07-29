const pool = require('./sql');

const isMySQL = (process.env.DB_CLIENT ?? 'pg') === 'mysql';
const STALE_PROJECT_DAYS = 14;

const staleProjectWhere = tableAlias => {
  const updatedAt = tableAlias ? `${tableAlias}.updated_at` : 'updated_at';
  const status = tableAlias ? `${tableAlias}.status` : 'status';
  const cutoff = isMySQL
    ? `DATE_SUB(NOW(), INTERVAL ${STALE_PROJECT_DAYS} DAY)`
    : `NOW() - INTERVAL '${STALE_PROJECT_DAYS} days'`;

  return `${status} <> 'active' AND ${updatedAt} < ${cutoff}`;
};

const placeholders = values => values.map(() => '?').join(', ');

async function deleteSoloProjects(ids) {
  if (ids.length === 0) return 0;

  const marks = placeholders(ids);
  await pool.query(`DELETE FROM submissions WHERE project_id IN (${marks})`, ids);
  const [result] = await pool.query(`DELETE FROM projects WHERE id IN (${marks})`, ids);
  return result.affectedRows ?? 0;
}

async function deleteTeamProjects(ids) {
  if (ids.length === 0) return 0;

  const marks = placeholders(ids);
  const [result] = await pool.query(`DELETE FROM team_projects WHERE id IN (${marks})`, ids);
  return result.affectedRows ?? 0;
}

async function cleanupStaleProjects() {
  const [soloRows] = await pool.query(
    `SELECT id FROM projects WHERE ${staleProjectWhere()}`
  );
  const [teamRows] = await pool.query(
    `SELECT id FROM team_projects WHERE ${staleProjectWhere()}`
  );

  const soloIds = soloRows.map(row => row.id);
  const teamIds = teamRows.map(row => row.id);

  const soloDeleted = await deleteSoloProjects(soloIds);
  const teamDeleted = await deleteTeamProjects(teamIds);
  const totalDeleted = soloDeleted + teamDeleted;

  console.log(
    `[stale-project-cleanup] Deleted ${totalDeleted} stale project(s): ${soloDeleted} solo, ${teamDeleted} team`
  );

  return { totalDeleted, soloDeleted, teamDeleted };
}

module.exports = { cleanupStaleProjects, STALE_PROJECT_DAYS };
