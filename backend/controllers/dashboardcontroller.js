const { randomUUID } = require('crypto');
const { list } = require('@vercel/blob');
const pool = require('../utils/sql');

const isMySQL = (process.env.DB_CLIENT ?? 'pg') === 'mysql';
const jsonLen = col => isMySQL ? `JSON_LENGTH(${col})` : `jsonb_array_length(${col}::jsonb)`;

const STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;
const STORAGE_STATUSES = ['active', 'draft', 'completed', 'not_completed', 'deleted'];

async function existingSubmissionBlobUrls() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || process.env.USE_LOCAL_FILE_STORAGE === 'true') return null;

  try {
    const urls = new Set();
    let cursor;
    do {
      const page = await list({ prefix: 'submissions/', limit: 1000, cursor, token });
      for (const blob of page.blobs) urls.add(blob.url);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return urls;
  } catch (err) {
    console.warn('Could not reconcile dashboard with Blob storage; using submission metadata:', err.message);
    return null;
  }
}

function existingSubmissions(rows, blobUrls) {
  if (!blobUrls) return rows;
  return rows.filter(row => !String(row.file_path ?? '').includes('.blob.vercel-storage.com') || blobUrls.has(row.file_path));
}

function emptyStorageStatus() {
  return { projects: 0, documents: 0, bytes: 0 };
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1048576) return `${Math.round(value / 1024 * 10) / 10} KB`;
  if (value < 1073741824) return `${Math.round(value / 1048576 * 10) / 10} MB`;
  return `${Math.round(value / 1073741824 * 10) / 10} GB`;
}

function statusLabel(status) {
  return status === 'not_completed'
    ? 'notCompleted'
    : status;
}

function storageLimitPercent(bytes) {
  return Math.min(Math.round((Number(bytes) || 0) / STORAGE_LIMIT_BYTES * 1000) / 10, 100);
}

function buildStorageData({ title, subtitle, rows }) {
  const statuses = Object.fromEntries(
    STORAGE_STATUSES.map(status => [statusLabel(status), emptyStorageStatus()])
  );

  for (const row of rows) {
    const key = statusLabel(row.status);
    if (!statuses[key]) continue;
    statuses[key] = {
      projects: Number(row.project_count) || 0,
      documents: Number(row.document_count) || 0,
      bytes: Number(row.total_bytes) || 0,
    };
  }

  const totals = Object.values(statuses).reduce(
    (acc, item) => ({
      projects: acc.projects + item.projects,
      documents: acc.documents + item.documents,
      bytes: acc.bytes + item.bytes,
    }),
    { projects: 0, documents: 0, bytes: 0 }
  );

  const view = {
    title,
    subtitle,
    totalUsed: formatBytes(totals.bytes),
    totalUsedSub: `of ${formatBytes(STORAGE_LIMIT_BYTES)} (${storageLimitPercent(totals.bytes)}%)`,
    totalProjects: totals.projects,
    totalProjectsSub: `${statuses.active.projects} Active, ${totals.projects - statuses.active.projects} Other`,
    totalDocs: totals.documents,
    totalDocsSub: 'Across matching projects',
    statuses: {},
  };

  for (const [key, item] of Object.entries(statuses)) {
    const percentNum = totals.bytes > 0 ? Math.round(item.bytes / totals.bytes * 1000) / 10 : 0;
    view.statuses[key] = {
      count: `${item.projects} project${item.projects === 1 ? '' : 's'} · ${item.documents} document${item.documents === 1 ? '' : 's'}`,
      size: formatBytes(item.bytes),
      percent: `${percentNum}%`,
      percentNum,
    };
  }

  return view;
}

exports.getDashboardStats = async (req, res) => {
  try {
    const { userid } = req.query;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });

    const [
      [soloActiveRows],
      [teamActiveRows],
      [soloSubmissionRows],
      [teamSubmissionRows],
      [collaboratorsRows],
    ] = await Promise.all([
      pool.query(
        'SELECT COUNT(*) AS cnt FROM projects WHERE user_id = ? AND status = ?',
        [userid, 'active']
      ),
      pool.query(
        `SELECT COUNT(DISTINCT tp.id) AS cnt
         FROM team_projects tp
         JOIN team_project_roles tpr ON tpr.project_id = tp.id AND tpr.user_id = ?
         WHERE tp.status = ?`,
        [userid, 'active']
      ),
      pool.query(
        `SELECT s.file_path, s.file_size, s.submitted_at, p.status AS project_status
         FROM submissions s
         JOIN projects p ON p.id = s.project_id
         WHERE p.user_id = ?`,
        [userid]
      ),
      pool.query(
        `SELECT DISTINCT tps.id, tps.file_path, tps.file_size, tps.submitted_at, tp.status AS project_status
         FROM team_project_submissions tps
         JOIN team_projects tp ON tp.id = tps.project_id
         JOIN team_project_roles tpr ON tpr.project_id = tp.id AND tpr.user_id = ?
        `,
        [userid]
      ),
      pool.query(
        `SELECT collaborators FROM projects WHERE user_id = ? AND status = ?`,
        [userid, 'active']
      ),
    ]);

    const blobUrls = await existingSubmissionBlobUrls();
    const submissions = existingSubmissions([...soloSubmissionRows, ...teamSubmissionRows], blobUrls);
    const activeSubmissions = submissions.filter(row => row.project_status === 'active');
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const soloProjects = Number(soloActiveRows[0].cnt);
    const teamProjects = Number(teamActiveRows[0].cnt);
    const documentsThisWeek = submissions.filter(row => new Date(row.submitted_at).getTime() >= weekAgo).length;
    const activeCollaborators = collaboratorsRows.reduce((sum, row) => {
      const collaborators = typeof row.collaborators === 'string' ? JSON.parse(row.collaborators || '[]') : (row.collaborators ?? []);
      return sum + collaborators.filter(c => c?.status !== 'inactive').length;
    }, 0);
    const totalBytes = submissions.reduce((sum, row) => sum + (Number(row.file_size) || 0), 0);

    res.json({
      success: true,
      activeProjects: soloProjects + teamProjects,
      soloProjects,
      teamProjects,
      documentsCollected: activeSubmissions.length,
      documentsThisWeek,
      activeCollaborators,
      storageUsedPercent: storageLimitPercent(totalBytes),
      storageUsedLabel: formatBytes(totalBytes),
    });
  } catch (err) {
    console.error('Get dashboard stats error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getStorageSummary = async (req, res) => {
  try {
    const { userid } = req.query;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });

    const [soloRows] = await pool.query(
      `SELECT status,
              COUNT(*) AS project_count,
              COALESCE(SUM(document_count), 0) AS document_count,
              COALESCE(SUM(total_bytes), 0) AS total_bytes
       FROM (
         SELECT p.id, p.status, ${jsonLen('p.documents')} AS document_count,
                COALESCE(SUM(s.file_size), 0) AS total_bytes
         FROM projects p
         LEFT JOIN submissions s ON s.project_id = p.id
         WHERE p.user_id = ?
         GROUP BY p.id, p.status, p.documents
       ) project_storage
       GROUP BY status`,
      [userid]
    );

    const [teamRows] = await pool.query(
      `SELECT status,
              COUNT(*) AS project_count,
              COALESCE(SUM(document_count), 0) AS document_count,
              COALESCE(SUM(total_bytes), 0) AS total_bytes
       FROM (
         SELECT tp.id, tp.status, COALESCE(${jsonLen('tp.documents')}, 0) AS document_count,
                COALESCE(SUM(tps.file_size), 0) AS total_bytes
         FROM team_projects tp
         JOIN team_project_roles tpr ON tpr.project_id = tp.id AND tpr.user_id = ?
         LEFT JOIN team_project_submissions tps ON tps.project_id = tp.id
         WHERE (? = 'all' OR tp.team_id = ?)
         GROUP BY tp.id, tp.status, tp.documents
       ) project_storage
       GROUP BY status`,
      [userid, req.query.teamId ?? 'all', req.query.teamId ?? 'all']
    );

    const [teams] = await pool.query(
      `SELECT DISTINCT t.id AS value, t.name AS label
       FROM teams t
       LEFT JOIN team_members tm ON tm.team_id = t.id
       WHERE t.user_id = ? OR tm.user_id = ?
       ORDER BY t.name ASC`,
      [userid, userid]
    );

    const selectedTeam = (req.query.teamId && req.query.teamId !== 'all')
      ? teams.find(t => t.value === req.query.teamId)
      : null;

    res.json({
      success: true,
      solo: buildStorageData({
        title: 'Storage Details - Solo Projects',
        subtitle: 'Monitor storage usage across your solo projects',
        rows: soloRows,
      }),
      team: buildStorageData({
        title: selectedTeam ? `Storage Details - ${selectedTeam.label}` : 'Storage Details - Team Projects',
        subtitle: selectedTeam ? `Monitor storage usage for ${selectedTeam.label}` : 'Monitor storage usage across your team projects',
        rows: teamRows,
      }),
      teams: [{ value: 'all', label: 'All Teams Combined' }, ...teams],
    });
  } catch (err) {
    console.error('Get storage summary error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getRecentProjects = async (req, res) => {
  try {
    const { userid } = req.query;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });

    const [soloRows] = await pool.query(
      `SELECT
         p.id,
         p.name,
         p.type AS visibility,
         p.project_code,
         p.description,
         ${jsonLen('p.documents')} AS document_count,
         p.collaborators,
         p.expected_collaborators,
         p.deadline,
         p.updated_at,
         (SELECT COUNT(DISTINCT s.collaborator_index) FROM submissions s WHERE s.project_id = p.id) AS submitted_count
       FROM projects p
       WHERE p.user_id = ? AND p.status = ?
       ORDER BY p.updated_at DESC
       LIMIT 4`,
      [userid, 'active']
    );

    const [teamRows] = await pool.query(
      `SELECT
         tp.id,
         tp.name,
         tp.type AS visibility,
         tp.project_code,
         t.name AS team_name,
         COALESCE(${jsonLen('tp.documents')}, 0) AS document_count,
         COUNT(tpc.id) AS collaborator_count,
         tp.expected_collaborators,
         tp.deadline,
         tp.updated_at
       FROM team_projects tp
       JOIN team_project_roles tpr ON tpr.project_id = tp.id AND tpr.user_id = ?
       JOIN teams t ON t.id = tp.team_id
       LEFT JOIN team_project_collaborators tpc ON tpc.project_id = tp.id
       WHERE tp.status = ?
       GROUP BY tp.id, tp.name, tp.type, tp.project_code, t.name, tp.documents, tp.expected_collaborators, tp.deadline, tp.updated_at
       ORDER BY tp.updated_at DESC
       LIMIT 4`,
      [userid, 'active']
    );

    const soloProjects = soloRows.map(row => {
      const collaborators = typeof row.collaborators === 'string' ? JSON.parse(row.collaborators || '[]') : (row.collaborators ?? []);
      const collaboratorCount = collaborators.filter(c => c?.status !== 'inactive').length;
      const submittedCount = Number(row.submitted_count) || 0;
      const isPublic = row.visibility === 'public';

      return {
        id: row.id,
        type: 'solo',
        name: row.name,
        visibility: row.visibility,
        projectCode: isPublic ? (row.project_code ?? null) : null,
        teamName: null,
        description: row.description ?? null,
        documentCount: Number(row.document_count) || 0,
        collaboratorCount,
        submittedCount: isPublic ? null : submittedCount,
        totalExpected: isPublic ? null : (row.expected_collaborators ?? null),
        pendingCount: isPublic ? null : collaboratorCount - submittedCount,
        deadline: row.deadline ? row.deadline.toISOString().split('T')[0] : null,
        isOngoing: !row.deadline,
        updatedAt: row.updated_at,
      };
    });

    const teamProjects = teamRows.map(row => ({
      id: row.id,
      type: 'team',
      name: row.name,
      visibility: row.visibility,
      projectCode: row.project_code ?? null,
      teamName: row.team_name ?? null,
      description: null,
      documentCount: Number(row.document_count) || 0,
      collaboratorCount: Number(row.collaborator_count) || 0,
      submittedCount: null,
      totalExpected: null,
      pendingCount: null,
      deadline: row.deadline ? row.deadline.toISOString().split('T')[0] : null,
      isOngoing: !row.deadline,
      updatedAt: row.updated_at,
    }));

    const merged = [...soloProjects, ...teamProjects]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 4)
      .map(({ updatedAt: _updatedAt, ...project }) => project);

    res.json({ success: true, projects: merged });
  } catch (err) {
    console.error('Get recent projects error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getDashboardActivity = async (req, res) => {
  try {
    const { userid } = req.query;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });

    const [rows] = await pool.query(
      `SELECT id, type, title, actor, created_at AS timestamp
       FROM activity_log
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [userid]
    );

    const activities = rows.map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      actor: row.actor ?? null,
      timestamp: row.timestamp,
    }));

    res.json({ success: true, activities });
  } catch (err) {
    console.error('Get dashboard activity error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getDashboardAllActivity = async (req, res) => {
  try {
    const { userid } = req.query;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });

    const [rows] = await pool.query(
      `SELECT id, type, title, actor, project_name AS projectName, created_at AS timestamp
       FROM activity_log
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userid]
    );

    const activities = rows.map(row => ({
      id: row.id,
      type: row.type,
      title: row.title,
      actor: row.actor ?? null,
      projectName: row.projectName ?? null,
      timestamp: row.timestamp,
    }));

    res.json({ success: true, activities });
  } catch (err) {
    console.error('Get all dashboard activity error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
