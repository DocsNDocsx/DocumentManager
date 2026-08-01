const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../utils/sql');
const logActivity = require('../utils/logActivity');
const { sendEmail } = require('../utils/emailservice');

const isMySQL = (process.env.DB_CLIENT ?? 'pg') === 'mysql';
const jsonLen = col => isMySQL ? `JSON_LENGTH(${col})` : `jsonb_array_length(${col}::jsonb)`;
const emailCollate = isMySQL ? 'COLLATE utf8mb4_unicode_ci' : '';

function generateProjectCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = n => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part(4)}-${part(4)}`;
}

function parseProjectRow(p) {
  const docs = p.documents == null
    ? []
    : typeof p.documents === 'string' ? JSON.parse(p.documents) : p.documents;
  const attachments = p.attachments == null
    ? []
    : typeof p.attachments === 'string' ? JSON.parse(p.attachments) : p.attachments;
  const staff = p.support_staff == null
    ? null
    : typeof p.support_staff === 'string' ? JSON.parse(p.support_staff) : p.support_staff;
  return {
    id: p.id,
    teamId: p.team_id,
    name: p.name,
    description: p.description ?? null,
    type: p.type,
    status: p.status,
    completedStep: p.completed_step,
    deadline: p.deadline ?? null,
    expectedCollaborators: p.expected_collaborators ?? null,
    projectCode: p.project_code ?? null,
    documents: docs,
    attachments,
    supportStaff: staff,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseTeamRow(row, role) {
  return {
    id: row.id,
    userId: String(row.user_id),
    name: row.name,
    description: row.description ?? null,
    icon: row.icon,
    memberCount: Number(row.member_count ?? 0),
    projectCount: 0,
    lastActivity: row.updated_at ?? null,
    role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseTeamDetail(teamRow, memberRows) {
  const owner = memberRows.find(m => m.is_owner) ?? null;
  const members = memberRows.filter(m => !m.is_owner);

  return {
    id: teamRow.id,
    name: teamRow.name,
    description: teamRow.description ?? null,
    icon: teamRow.icon,
    owner: owner
      ? { id: owner.id, firstName: owner.first_name, lastName: owner.last_name, email: owner.email, affiliation: owner.affiliation, isOwner: true }
      : null,
    members: members.map(m => ({
      id: m.id,
      firstName: m.first_name,
      lastName: m.last_name,
      email: m.email,
      affiliation: m.affiliation,
      isOwner: false,
    })),
    projects: [],
    createdAt: teamRow.created_at,
    updatedAt: teamRow.updated_at,
  };
}

exports.getTeams = async (req, res) => {
  try {
    const { userid } = req.query;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });

    const [hostedRows] = await pool.query(
      `SELECT t.id, t.user_id, t.name, t.description, t.icon, t.created_at, t.updated_at,
              COUNT(tm.id) AS member_count
       FROM teams t
       LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.is_owner = false
       WHERE t.user_id = ?
       GROUP BY t.id, t.user_id, t.name, t.description, t.icon, t.created_at, t.updated_at
       ORDER BY t.created_at DESC`,
      [userid]
    );

    const [memberRows] = await pool.query(
      `SELECT t.id, t.user_id, t.name, t.description, t.icon, t.created_at, t.updated_at,
              COUNT(all_tm.id) AS member_count
       FROM teams t
       JOIN team_members my_m ON my_m.team_id = t.id
                              AND LOWER(my_m.email) = (SELECT LOWER(email) ${emailCollate} FROM users WHERE userid = ?)
                              AND my_m.is_owner = false
       LEFT JOIN team_members all_tm ON all_tm.team_id = t.id AND all_tm.is_owner = false
       WHERE t.user_id != ?
       GROUP BY t.id, t.user_id, t.name, t.description, t.icon, t.created_at, t.updated_at
       ORDER BY t.created_at DESC`,
      [userid, userid]
    );

    const teams = [
      ...hostedRows.map(r => parseTeamRow(r, 'host')),
      ...memberRows.map(r => parseTeamRow(r, 'member')),
    ];

    res.json({ success: true, teams });
  } catch (err) {
    console.error('Get teams error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getTeam = async (req, res) => {
  try {
    const { id } = req.params;

    const [teamRows] = await pool.query('SELECT * FROM teams WHERE id = ?', [id]);
    if (teamRows.length === 0) return res.status(404).json({ success: false, message: 'Team not found' });

    const [memberRows] = await pool.query(
      'SELECT * FROM team_members WHERE team_id = ? ORDER BY is_owner DESC, created_at ASC',
      [id]
    );

    res.json({ success: true, team: parseTeamDetail(teamRows[0], memberRows) });
  } catch (err) {
    console.error('Get team error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createTeam = async (req, res) => {
  try {
    const { userId, name, description, icon, members } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId is required' });
    if (!name) return res.status(400).json({ success: false, message: 'name is required' });

    const teamId = randomUUID();

    await pool.query(
      `INSERT INTO teams (id, user_id, name, description, icon) VALUES (?, ?, ?, ?, ?)`,
      [teamId, userId, name, description ?? null, icon ?? 'fa-users']
    );

    const [userRows] = await pool.query(
      'SELECT firstname, lastname, email, organization FROM users WHERE userid = ?',
      [userId]
    );

    if (userRows.length > 0) {
      const u = userRows[0];
      await pool.query(
        `INSERT INTO team_members (id, team_id, user_id, first_name, last_name, email, affiliation, is_owner)
         VALUES (?, ?, ?, ?, ?, ?, ?, true)`,
        [randomUUID(), teamId, userId, u.firstname, u.lastname, u.email, u.organization ?? '']
      );
    }

    if (Array.isArray(members) && members.length > 0) {
      const memberInserts = members.map(m => [
        randomUUID(), teamId, null,
        m.firstName ?? '', m.lastName ?? '', m.email ?? '', m.affiliation ?? '', false,
      ]);
      const flat = memberInserts.flat();
      const placeholders = memberInserts.map((_, i) =>
        `(?, ?, ?, ?, ?, ?, ?, ?)`
      ).join(', ');
      await pool.query(
        `INSERT INTO team_members (id, team_id, user_id, first_name, last_name, email, affiliation, is_owner) VALUES ${placeholders}`,
        flat
      );
    }

    const [teamRows] = await pool.query('SELECT * FROM teams WHERE id = ?', [teamId]);
    const [memberRows] = await pool.query(
      'SELECT * FROM team_members WHERE team_id = ? ORDER BY is_owner DESC, created_at ASC',
      [teamId]
    );

    await logActivity(userId, 'team', `Team "${name}" was created`, null, name);

    res.status(201).json({ success: true, team: parseTeamDetail(teamRows[0], memberRows) });
  } catch (err) {
    console.error('Create team error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, icon, members } = req.body;

    const [existing] = await pool.query('SELECT id FROM teams WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ success: false, message: 'Team not found' });

    const setClauses = [];
    const values = [];

    if (name !== undefined)        { setClauses.push('name = ?');        values.push(name); }
    if (description !== undefined) { setClauses.push('description = ?'); values.push(description); }
    if (icon !== undefined)        { setClauses.push('icon = ?');        values.push(icon); }

    if (setClauses.length > 0) {
      values.push(id);
      await pool.query(`UPDATE teams SET ${setClauses.join(', ')} WHERE id = ?`, values);
    }

    if (Array.isArray(members)) {
      await pool.query('DELETE FROM team_members WHERE team_id = ? AND is_owner = false', [id]);

      if (members.length > 0) {
        const memberInserts = members.map(m => [
          randomUUID(), id, null,
          m.firstName ?? '', m.lastName ?? '', m.email ?? '', m.affiliation ?? '', false,
        ]);
        const flat = memberInserts.flat();
        const placeholders = memberInserts.map(() => `(?, ?, ?, ?, ?, ?, ?, ?)`).join(', ');
        await pool.query(
          `INSERT INTO team_members (id, team_id, user_id, first_name, last_name, email, affiliation, is_owner) VALUES ${placeholders}`,
          flat
        );
      }
    }

    const [teamRows] = await pool.query('SELECT * FROM teams WHERE id = ?', [id]);
    const [memberRows] = await pool.query(
      'SELECT * FROM team_members WHERE team_id = ? ORDER BY is_owner DESC, created_at ASC',
      [id]
    );

    if (Array.isArray(members) && members.length > 0) {
      await logActivity(
        teamRows[0].user_id,
        'team',
        `${members.length} member${members.length !== 1 ? 's' : ''} added to team "${teamRows[0].name}"`,
        null,
        teamRows[0].name
      );
    }

    res.json({ success: true, team: parseTeamDetail(teamRows[0], memberRows) });
  } catch (err) {
    console.error('Update team error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteTeam = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.query('DELETE FROM teams WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Team not found' });

    res.json({ success: true });
  } catch (err) {
    console.error('Delete team error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.createTeamProject = async (req, res) => {
  try {
    const { userId, teamId, name, description, deadline, type, completedStep, expectedCollaborators, supportStaff, attachments } = req.body;

    if (!userId)  return res.status(400).json({ success: false, message: 'userId is required' });
    if (!teamId)  return res.status(400).json({ success: false, message: 'teamId is required' });
    if (!name)    return res.status(400).json({ success: false, message: 'name is required' });

    const projectId = randomUUID();
    const stepValue = completedStep ?? 1;

    await pool.query(
      `INSERT INTO team_projects (id, team_id, name, description, type, status, deadline, completed_step, expected_collaborators, attachments, support_staff)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
      [
        projectId, teamId, name, description ?? null, type ?? 'private', deadline ?? null,
        stepValue, expectedCollaborators ?? null, JSON.stringify(attachments ?? []),
        supportStaff ? JSON.stringify(supportStaff) : null,
      ]
    );

    await pool.query(
      `INSERT INTO team_project_roles (id, project_id, user_id, role) VALUES (?, ?, ?, 'host')`,
      [randomUUID(), projectId, userId]
    );

    const [rows] = await pool.query('SELECT * FROM team_projects WHERE id = ?', [projectId]);

    res.status(201).json({ success: true, project: parseProjectRow(rows[0]) });
  } catch (err) {
    console.error('Create team project error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateTeamProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, deadline, status, completedStep, expectedCollaborators, supportStaff, attachments } = req.body;

    const [existing] = await pool.query('SELECT * FROM team_projects WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });

    const setClauses = [];
    const values = [];

    if (name !== undefined)                 { setClauses.push('name = ?');                  values.push(name); }
    if (description !== undefined)          { setClauses.push('description = ?');           values.push(description); }
    if (deadline !== undefined)             { setClauses.push('deadline = ?');              values.push(deadline); }
    if (expectedCollaborators !== undefined){ setClauses.push('expected_collaborators = ?');values.push(expectedCollaborators); }
    if (attachments !== undefined)           { setClauses.push('attachments = ?');           values.push(JSON.stringify(attachments)); }
    if (completedStep !== undefined)        { setClauses.push('completed_step = ?');        values.push(completedStep); }
    if (supportStaff !== undefined)         { setClauses.push('support_staff = ?');         values.push(supportStaff ? JSON.stringify(supportStaff) : null); }

    if (status !== undefined) {
      setClauses.push('status = ?');
      values.push(status);

      if (status === 'active' && !existing[0].project_code) {
        setClauses.push('project_code = ?');
        values.push(generateProjectCode());
      }
    }

    if (setClauses.length > 0) {
      values.push(id);
      await pool.query(`UPDATE team_projects SET ${setClauses.join(', ')} WHERE id = ?`, values);
    }

    const [rows] = await pool.query('SELECT * FROM team_projects WHERE id = ?', [id]);

    // Notify collaborators when project transitions to active — non-blocking
    if (status === 'active' && existing[0].status !== 'active') {
      try {
        const project = parseProjectRow(rows[0]);
        const [collabRows] = await pool.query(
          `SELECT first_name AS firstName, last_name AS lastName, email
           FROM team_project_collaborators WHERE project_id = ? AND email IS NOT NULL AND email != ''`,
          [id]
        );
        const [ownerRows] = await pool.query(
          `SELECT u.email, u.firstname AS "firstName", u.lastname AS "lastName"
           FROM teams t
           JOIN users u ON u.userid = t.user_id
           WHERE t.id = ? AND u.email IS NOT NULL AND u.email != ''`,
          [project.teamId]
        );
        const templatePath = path.join(__dirname, '../templates-email/projectactivation.html');
        const template = fs.readFileSync(templatePath, 'utf8');

        const deadlineBlock = project.deadline
          ? `<p class="detail-row"><strong>Deadline:</strong> ${new Date(project.deadline).toDateString()}</p>`
          : '';
        const projectCodeBlock = project.projectCode
          ? `<div class="code-section"><p class="code-label">Project Code</p><div class="code-box"><p class="code-value">${project.projectCode}</p></div></div>`
          : '';
        const recipients = [
          ...ownerRows.map(owner => ({
            ...owner,
            subject: `DocsNDocs: Your team project "${project.name}" is now active`,
          })),
          ...collabRows,
        ];

        if (project.supportStaff?.email) {
          recipients.push({
            ...project.supportStaff,
            firstName: project.supportStaff.firstName,
            lastName: project.supportStaff.lastName,
          });
        }

        await Promise.all(
          recipients.filter(c => c.email).map(c => {
            const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Collaborator';
            const body = template
              .replace('{{BASE_URL}}', process.env.APP_BASE_URL ?? '')
              .replace('{{COLLABORATOR_NAME}}', name)
              .replace('{{PROJECT_NAME}}', project.name)
              .replace('{{DEADLINE_BLOCK}}', deadlineBlock)
              .replace('{{PROJECT_CODE_BLOCK}}', projectCodeBlock);
            return sendEmail(c.email, c.subject ?? `DocsNDocs: "${project.name}" is now active - submit your documents`, body);
          })
        );
      } catch (emailErr) {
        console.error('[email] Team project activation email failed (non-fatal):', emailErr);
      }
    }

    res.json({ success: true, project: parseProjectRow(rows[0]) });
  } catch (err) {
    console.error('Update team project error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.saveProjectCollaborators = async (req, res) => {
  try {
    const { id } = req.params;
    const { collaborators } = req.body;

    const [existing] = await pool.query('SELECT id FROM team_projects WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });

    await pool.query('DELETE FROM team_project_collaborators WHERE project_id = ?', [id]);

    if (Array.isArray(collaborators) && collaborators.length > 0) {
      const inserts = await Promise.all(
        collaborators.map(async c => {
          const [userRows] = await pool.query(
            'SELECT userid FROM users WHERE LOWER(email) = LOWER(?)',
            [c.email ?? ''],
          );
          const userId = userRows.length > 0 ? userRows[0].userid : null;
          return [
            randomUUID(), id, userId,
            c.firstName ?? '', c.lastName ?? '', c.email ?? '',
            c.affiliation ?? '', c.role ?? 'contributor',
          ];
        }),
      );

      const flat = inserts.flat();
      const placeholders = inserts.map(() => `(?, ?, ?, ?, ?, ?, ?, ?)`).join(', ');
      await pool.query(
        `INSERT INTO team_project_collaborators
           (id, project_id, user_id, first_name, last_name, email, affiliation, role)
         VALUES ${placeholders}`,
        flat,
      );
    }

    await pool.query(
      'UPDATE team_projects SET completed_step = GREATEST(completed_step, 2) WHERE id = ?',
      [id],
    );

    const [rows] = await pool.query('SELECT * FROM team_projects WHERE id = ?', [id]);

    res.json({ success: true, project: parseProjectRow(rows[0]) });
  } catch (err) {
    console.error('Save project collaborators error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.saveProjectDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const { documents } = req.body;

    const [existing] = await pool.query('SELECT id FROM team_projects WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });

    await pool.query(
      'UPDATE team_projects SET documents = ?, completed_step = GREATEST(completed_step, 3) WHERE id = ?',
      [JSON.stringify(documents ?? []), id],
    );

    const [rows] = await pool.query('SELECT * FROM team_projects WHERE id = ?', [id]);

    res.json({ success: true, project: parseProjectRow(rows[0]) });
  } catch (err) {
    console.error('Save project documents error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getTeamProject = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT * FROM team_projects WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });
    res.json({ success: true, project: parseProjectRow(rows[0]) });
  } catch (err) {
    console.error('Get team project error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getProjectCollaborators = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT id, first_name AS "firstName", last_name AS "lastName", email, affiliation, role
       FROM team_project_collaborators WHERE project_id = ? ORDER BY created_at ASC`,
      [id]
    );
    res.json({
      success: true,
      collaborators: rows.map((r, idx) => ({ ...r, index: idx })),
    });
  } catch (err) {
    console.error('Get project collaborators error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteTeamProject = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.query('DELETE FROM team_projects WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Project not found' });

    res.json({ success: true });
  } catch (err) {
    console.error('Delete team project error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getTeamProjects = async (req, res) => {
  try {
    const { userid } = req.query;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });

    const [hostedTeams] = await pool.query(
      `SELECT id, name FROM teams WHERE user_id = ?`,
      [userid]
    );

    const [memberTeams] = await pool.query(
      `SELECT t.id, t.name
       FROM teams t
       JOIN team_members tm ON tm.team_id = t.id
                            AND LOWER(tm.email) = (SELECT LOWER(email) ${emailCollate} FROM users WHERE userid = ?)
                            AND tm.is_owner = false
       WHERE t.user_id != ?`,
      [userid, userid]
    );

    const allTeams = [
      ...hostedTeams.map(t => ({ id: t.id, name: t.name, role: 'host' })),
      ...memberTeams.map(t => ({ id: t.id, name: t.name, role: 'member' })),
    ];

    const projectSqlFields = `
         tp.id,
         tp.team_id       AS "teamId",
         t.name           AS "teamName",
         tp.name,
         tp.type,
         tp.status,
         tp.deadline,
         tp.project_code  AS "projectCode",
         tp.created_at    AS "createdAt",
         tp.updated_at    AS "updatedAt",
         COUNT(DISTINCT tpr_all.id) AS "collaboratorCount",
         tpr_user.role    AS "userRole",
         MIN(tpc_me.id)   AS "myCollaboratorId",
         COALESCE(${jsonLen('tp.documents')}, 0) AS "documentCount",
         (SELECT COUNT(*) FROM team_project_submissions WHERE project_id = tp.id AND status = 'submitted') AS "submittedCount",
         (SELECT COUNT(*) FROM team_project_submissions WHERE project_id = tp.id AND status = 'approved') AS "approvedCount",
         (SELECT COUNT(*) FROM team_project_collaborators WHERE project_id = tp.id) AS "collabUploadCount"`;

    const mapProjectRow = row => ({
      id: row.id,
      teamId: row.teamId,
      teamName: row.teamName,
      userRole: row.userRole ?? null,
      name: row.name,
      type: row.type,
      status: row.status,
      deadline: row.deadline ?? null,
      projectCode: row.projectCode ?? null,
      collaboratorCount: Number(row.collaboratorCount),
      documentCount: Number(row.documentCount),
      submittedCount: Number(row.submittedCount),
      approvedCount: Number(row.approvedCount),
      collabUploadCount: Number(row.collabUploadCount),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      myCollaboratorId: row.myCollaboratorId ?? null,
    });

    let projects = [];

    if (allTeams.length > 0) {
      const teamIds = allTeams.map(t => t.id);
      const teamPlaceholders = teamIds.map(() => '?').join(', ');
      const [projectRows] = await pool.query(
        `SELECT ${projectSqlFields}
         FROM team_projects tp
         JOIN teams t ON t.id = tp.team_id
         LEFT JOIN team_project_roles tpr_all  ON tpr_all.project_id = tp.id
         LEFT JOIN team_project_roles tpr_user ON tpr_user.project_id = tp.id
                                               AND tpr_user.user_id   = ?
         LEFT JOIN team_project_collaborators tpc_me ON tpc_me.project_id = tp.id
                                               AND tpc_me.user_id = ?
         WHERE tp.team_id IN (${teamPlaceholders})
           AND tp.status != 'deleted'
         GROUP BY tp.id, tp.team_id, t.name, tp.name, tp.type, tp.status, tp.deadline, tp.project_code, tp.created_at, tp.updated_at, tp.documents, tpr_user.role
         ORDER BY tp.created_at DESC`,
        [userid, userid, ...teamIds]
      );
      projects = projectRows.map(mapProjectRow);
    }

    const seenIds = new Set(projects.map(p => p.id));
    const [directRows] = await pool.query(
      `SELECT ${projectSqlFields}
       FROM team_project_roles tpr_user
       JOIN team_projects tp  ON tp.id  = tpr_user.project_id
       JOIN teams t           ON t.id   = tp.team_id
       LEFT JOIN team_project_roles tpr_all ON tpr_all.project_id = tp.id
       LEFT JOIN team_project_collaborators tpc_me ON tpc_me.project_id = tp.id
                                              AND tpc_me.user_id = ?
       WHERE tpr_user.user_id = ?
         AND tp.status != 'deleted'
       GROUP BY tp.id, tp.team_id, t.name, tp.name, tp.type, tp.status, tp.deadline, tp.project_code, tp.created_at, tp.updated_at, tp.documents, tpr_user.role
       ORDER BY tp.created_at DESC`,
      [userid, userid]
    );
    for (const row of directRows) {
      if (!seenIds.has(row.id)) {
        projects.push(mapProjectRow(row));
        seenIds.add(row.id);
      }
    }

    const needsCode = projects.filter(p => p.status === 'active' && !p.projectCode);
    if (needsCode.length > 0) {
      await Promise.all(needsCode.map(async p => {
        const code = generateProjectCode();
        await pool.query('UPDATE team_projects SET project_code = ? WHERE id = ?', [code, p.id]);
        p.projectCode = code;
      }));
    }

    res.json({ success: true, teams: allTeams, projects });
  } catch (err) {
    console.error('Get team projects error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getTeamProjectStats = async (req, res) => {
  try {
    const { userid } = req.query;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });

    const [hostedTeams] = await pool.query(
      `SELECT id, name FROM teams WHERE user_id = ?`,
      [userid]
    );

    const [memberTeams] = await pool.query(
      `SELECT t.id, t.name
       FROM teams t
       JOIN team_members tm ON tm.team_id = t.id
                            AND LOWER(tm.email) = (SELECT LOWER(email) ${emailCollate} FROM users WHERE userid = ?)
                            AND tm.is_owner = false
       WHERE t.user_id != ?`,
      [userid, userid]
    );

    const allTeams = [
      ...hostedTeams.map(t => ({ id: t.id, name: t.name })),
      ...memberTeams.map(t => ({ id: t.id, name: t.name })),
    ];

    if (allTeams.length === 0) {
      return res.json({ success: true, totalProjects: 0, activeProjects: 0, totalDocuments: 0, teams: [] });
    }

    const teamIds = allTeams.map(t => t.id);
    const teamPlaceholders = teamIds.map(() => '?').join(', ');

    const [statsRows] = await pool.query(
      `SELECT
         tp.team_id,
         COUNT(*) AS "totalProjects",
         SUM(CASE WHEN tp.status = 'active' THEN 1 ELSE 0 END) AS "activeProjects",
         SUM(COALESCE(${jsonLen('tp.documents')}, 0)) AS "totalDocuments"
       FROM team_projects tp
       WHERE tp.team_id IN (${teamPlaceholders})
         AND tp.status != 'deleted'
       GROUP BY tp.team_id`,
      teamIds
    );

    const statsByTeam = new Map(statsRows.map(r => [r.team_id, r]));

    const teamsWithStats = allTeams.map(t => {
      const s = statsByTeam.get(t.id);
      return {
        id: t.id,
        name: t.name,
        totalProjects: s ? Number(s.totalProjects) : 0,
        activeProjects: s ? Number(s.activeProjects) : 0,
        totalDocuments: s ? Number(s.totalDocuments) : 0,
      };
    });

    const totalProjects   = teamsWithStats.reduce((sum, t) => sum + t.totalProjects, 0);
    const activeProjects  = teamsWithStats.reduce((sum, t) => sum + t.activeProjects, 0);
    const totalDocuments  = teamsWithStats.reduce((sum, t) => sum + t.totalDocuments, 0);

    res.json({
      success: true,
      totalProjects,
      activeProjects,
      totalDocuments,
      teams: teamsWithStats,
    });
  } catch (err) {
    console.error('Get team project stats error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.joinProject = async (req, res) => {
  try {
    const { projectCode, userId } = req.body;
    if (!projectCode) return res.status(400).json({ success: false, message: 'projectCode is required' });
    if (!userId)      return res.status(400).json({ success: false, message: 'userId is required' });
    const normalizedCode = String(projectCode).trim().toUpperCase();

    const [projectRows] = await pool.query(
      `SELECT tp.id, tp.name, t.name AS "teamName"
       FROM team_projects tp
       JOIN teams t ON t.id = tp.team_id
       WHERE tp.project_code = ? AND tp.type = 'public' AND tp.status = 'active'`,
      [normalizedCode]
    );

    const [userRows] = await pool.query(
      `SELECT userid, firstname, lastname, email, organization FROM users WHERE userid = ?`,
      [userId]
    );
    if (userRows.length === 0)
      return res.status(404).json({ success: false, message: 'User not found' });

    const user = userRows[0];

    if (projectRows.length === 0) {
      const [soloRows] = await pool.query(
        `SELECT p.id, p.name, p.collaborators, u.firstname AS "ownerFirstName", u.lastname AS "ownerLastName"
         FROM projects p
         JOIN users u ON u.userid = p.user_id
         WHERE p.project_code = ? AND p.type = 'public' AND p.status = 'active'`,
        [normalizedCode]
      );

      if (soloRows.length === 0)
        return res.status(404).json({ success: false, message: 'Invalid or inactive project code' });

      const soloProject = soloRows[0];
      const collaborators = parseJsonArray(soloProject.collaborators);
      const userIdText = String(user.userid);
      const userEmail = String(user.email ?? '').toLowerCase();
      const alreadyJoined = collaborators.some(c => {
        const collaboratorUserId = c?.userId ?? c?.userid ?? c?.user_id;
        const collaboratorEmail = String(c?.email ?? '').toLowerCase();
        return String(collaboratorUserId ?? '') === userIdText || (userEmail && collaboratorEmail === userEmail);
      });

      if (alreadyJoined)
        return res.status(409).json({ success: false, message: 'You have already joined this project' });

      collaborators.push({
        userId: user.userid,
        firstName: user.firstname ?? '',
        lastName: user.lastname ?? '',
        email: user.email ?? '',
        affiliation: user.organization ?? '',
      });

      await pool.query(
        'UPDATE projects SET collaborators = ? WHERE id = ?',
        [JSON.stringify(collaborators), soloProject.id]
      );

      const ownerName = [soloProject.ownerFirstName, soloProject.ownerLastName].filter(Boolean).join(' ') || 'Project Owner';
      return res.status(201).json({
        success: true,
        project: { id: soloProject.id, name: soloProject.name, projectType: 'solo', ownerName },
      });
    }

    const project = projectRows[0];

    const [existing] = await pool.query(
      `SELECT id FROM team_project_collaborators WHERE project_id = ? AND user_id = ?`,
      [project.id, userId]
    );
    if (existing.length > 0)
      return res.status(409).json({ success: false, message: 'You have already joined this project' });

    await pool.query(
      `INSERT INTO team_project_collaborators (id, project_id, user_id, first_name, last_name, email, affiliation, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'contributor')`,
      [randomUUID(), project.id, userId, user.firstname ?? '', user.lastname ?? '', user.email ?? '', user.organization ?? '']
    );

    res.status(201).json({
      success: true,
      project: { id: project.id, name: project.name, projectType: 'team', teamName: project.teamName },
    });
  } catch (err) {
    console.error('Join project error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

