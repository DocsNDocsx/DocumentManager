const pool = require('./sql');
const { del } = require('@vercel/blob');
const fs = require('fs/promises');
const path = require('path');

const isMySQL = (process.env.DB_CLIENT ?? 'pg') === 'mysql';
const STALE_PROJECT_DAYS = 15;
const LOCAL_UPLOAD_PREFIX = '/public/uploads/local/';
const LOCAL_UPLOAD_ROOT = path.resolve(__dirname, '..', 'public', 'uploads', 'local');

const staleProjectWhere = tableAlias => {
  const updatedAt = tableAlias ? `${tableAlias}.updated_at` : 'updated_at';
  const status = tableAlias ? `${tableAlias}.status` : 'status';
  const inactiveDays = isMySQL
    ? `DATEDIFF(CURDATE(), DATE(${updatedAt}))`
    : `(CURRENT_DATE - ${updatedAt}::date)`;

  return `${status} <> 'active' AND ${inactiveDays} >= ${STALE_PROJECT_DAYS}`;
};

const placeholders = values => values.map(() => '?').join(', ');

function parseList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function projectAssetUrls(project) {
  const attachmentUrls = parseList(project.attachments).map(item => item?.url);
  const templateUrls = parseList(project.documents).map(item => item?.templateUrl);
  return [...attachmentUrls, ...templateUrls].filter(Boolean);
}

async function deleteStoredAssets(urls) {
  const uniqueUrls = [...new Set(urls.filter(Boolean).map(String))];
  const localUrls = uniqueUrls.filter(url => url.startsWith(LOCAL_UPLOAD_PREFIX));
  const blobUrls = uniqueUrls.filter(url => /^https?:\/\//i.test(url));

  if (blobUrls.length > 0) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error('BLOB_READ_WRITE_TOKEN is required to delete completed project assets');
    }
    await del(blobUrls, { token: process.env.BLOB_READ_WRITE_TOKEN });
  }

  for (const url of localUrls) {
    const relativePath = url.slice(LOCAL_UPLOAD_PREFIX.length).replace(/\//g, path.sep);
    const absolutePath = path.resolve(LOCAL_UPLOAD_ROOT, relativePath);
    if (!absolutePath.startsWith(`${LOCAL_UPLOAD_ROOT}${path.sep}`)) {
      throw new Error(`Refusing to delete an asset outside the local upload directory: ${url}`);
    }
    await fs.unlink(absolutePath).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  return uniqueUrls.length;
}

async function submissionAssetUrls(table, ids) {
  if (ids.length === 0) return [];
  const marks = placeholders(ids);
  const [rows] = await pool.query(
    `SELECT file_path FROM ${table} WHERE project_id IN (${marks})`,
    ids,
  );
  return rows.map(row => row.file_path).filter(Boolean);
}

async function cleanupStaleProjects() {
  const [soloRows] = await pool.query(
    `SELECT id, attachments, documents FROM projects WHERE ${staleProjectWhere()}`
  );
  const [teamRows] = await pool.query(
    `SELECT id, attachments, documents FROM team_projects WHERE ${staleProjectWhere()}`
  );

  const soloIds = soloRows.map(row => row.id);
  const teamIds = teamRows.map(row => row.id);
  const soloSubmissionUrls = await submissionAssetUrls('submissions', soloIds);
  const teamSubmissionUrls = await submissionAssetUrls('team_project_submissions', teamIds);
  const assetUrls = [
    ...soloRows.flatMap(projectAssetUrls),
    ...teamRows.flatMap(projectAssetUrls),
    ...soloSubmissionUrls,
    ...teamSubmissionUrls,
  ];

  const assetsDeleted = await deleteStoredAssets(assetUrls);
  let soloDeleted = 0;
  let teamDeleted = 0;

  if (soloIds.length > 0) {
    const marks = placeholders(soloIds);
    await pool.query(`DELETE FROM submissions WHERE project_id IN (${marks})`, soloIds);
    const [result] = await pool.query(`DELETE FROM projects WHERE id IN (${marks})`, soloIds);
    soloDeleted = result.affectedRows ?? 0;
  }

  if (teamIds.length > 0) {
    const marks = placeholders(teamIds);
    const [result] = await pool.query(`DELETE FROM team_projects WHERE id IN (${marks})`, teamIds);
    teamDeleted = result.affectedRows ?? 0;
  }

  const totalDeleted = soloDeleted + teamDeleted;
  console.log(
    `[stale-project-cleanup] Deleted ${totalDeleted} inactive project(s) and ${assetsDeleted} asset(s): ${soloDeleted} solo, ${teamDeleted} team`
  );

  return { totalDeleted, soloDeleted, teamDeleted, assetsDeleted };
}

module.exports = { cleanupStaleProjects, STALE_PROJECT_DAYS };
