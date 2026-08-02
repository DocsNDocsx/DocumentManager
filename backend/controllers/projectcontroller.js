const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../utils/sql');
const logActivity = require('../utils/logActivity');
const { sendEmail } = require('../utils/emailservice');
const { uploadToBlob } = require('../utils/blobStorage');

function parseProject(row) {
  const jsonCols = ['collaborators', 'documents', 'assignments', 'attachments'];
  const parsed = { ...row };

  for (const col of jsonCols) {
    if (parsed[col] !== undefined && parsed[col] !== null) {
      if (typeof parsed[col] === 'string') {
        try { parsed[col] = JSON.parse(parsed[col]); } catch { parsed[col] = []; }
      }
    } else {
      parsed[col] = col === 'assignments' ? {} : [];
    }
  }

  if (parsed.staff !== undefined && parsed.staff !== null) {
    if (typeof parsed.staff === 'string') {
      try { parsed.staff = JSON.parse(parsed.staff); } catch { parsed.staff = null; }
    }
  }

  return {
    id: parsed.id,
    userId: String(parsed.user_id),
    name: parsed.name,
    description: parsed.description ?? null,
    deadline: parsed.deadline ?? null,
    status: parsed.status,
    type: parsed.type,
    completedStep: parsed.completed_step,
    expectedCollaborators: parsed.expected_collaborators ?? null,
    projectCode: parsed.project_code ?? null,
    collaborators: parsed.collaborators,
    documents: parsed.documents,
    assignments: parsed.assignments,
    attachments: parsed.attachments,
    staff: parsed.staff ?? null,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  };
}

exports.createProject = async (req, res) => {
  try {
    const { userid, name, description, deadline, collaborators, documents, assignments, attachments, staff, expectedCollaborators, type } = req.body;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });
    if (!name) return res.status(400).json({ success: false, message: 'name is required' });

    const id = randomUUID();

    await pool.query(
      `INSERT INTO projects
        (id, user_id, name, description, deadline, status, completed_step, type,
         collaborators, documents, assignments, attachments, staff, expected_collaborators)
       VALUES (?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userid,
        name,
        description ?? null,
        deadline ?? null,
        type ?? 'private',
        JSON.stringify(collaborators ?? []),
        JSON.stringify(documents ?? []),
        JSON.stringify(assignments ?? {}),
        JSON.stringify(attachments ?? []),
        JSON.stringify(staff ?? null),
        expectedCollaborators ?? null,
      ]
    );

    const [rows] = await pool.query('SELECT * FROM projects WHERE id = ?', [id]);
    res.status(201).json({ success: true, project: parseProject(rows[0]) });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getProjects = async (req, res) => {
  try {
    const { userid } = req.query;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });

    const [ownedRows] = await pool.query(
      "SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC",
      [userid]
    );
    const [userRows] = await pool.query(
      'SELECT email FROM users WHERE userid = ?',
      [userid]
    );
    const [activeRows] = await pool.query(
      "SELECT * FROM projects WHERE user_id != ? AND status = 'active' ORDER BY created_at DESC",
      [userid]
    );

    const userEmail = String(userRows[0]?.email ?? '').toLowerCase();
    const collaboratorRows = activeRows.filter(row => {
      const collaborators = parseProject(row).collaborators;
      return collaborators.some(collaborator => {
        const collaboratorUserId = collaborator?.userId ?? collaborator?.userid ?? collaborator?.user_id;
        const collaboratorEmail = String(collaborator?.email ?? '').toLowerCase();
        return String(collaboratorUserId ?? '') === String(userid)
          || (userEmail && collaboratorEmail === userEmail);
      });
    });
    const rows = [...ownedRows, ...collaboratorRows];

    res.json({ success: true, projects: rows.map(parseProject) });
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getProject = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT p.*, u.firstname AS owner_firstname, u.lastname AS owner_lastname
       FROM projects p
       JOIN users u ON u.userid = p.user_id
       WHERE p.id = ?`,
      [id]
    );

    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });

    const project = parseProject(rows[0]);
    project.ownerName = `${rows[0].owner_firstname ?? ''} ${rows[0].owner_lastname ?? ''}`.trim() || null;
    res.json({ success: true, project });
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, deadline, attachments, collaborators, documents, assignments, staff, expectedCollaborators, completedStep, status } = req.body;

    const setClauses = [];
    const values = [];

    if (name !== undefined) { setClauses.push('name = ?'); values.push(name); }
    if (description !== undefined) { setClauses.push('description = ?'); values.push(description); }
    if (deadline !== undefined) { setClauses.push('deadline = ?'); values.push(deadline); }
    if (attachments !== undefined) { setClauses.push('attachments = ?'); values.push(JSON.stringify(attachments)); }
    if (collaborators !== undefined) { setClauses.push('collaborators = ?'); values.push(JSON.stringify(collaborators)); }
    if (documents !== undefined) { setClauses.push('documents = ?'); values.push(JSON.stringify(documents)); }
    if (assignments !== undefined) { setClauses.push('assignments = ?'); values.push(JSON.stringify(assignments)); }
    if (staff !== undefined) { setClauses.push('staff = ?'); values.push(JSON.stringify(staff)); }
    if (expectedCollaborators !== undefined) { setClauses.push('expected_collaborators = ?'); values.push(expectedCollaborators); }
    if (status !== undefined) { setClauses.push('status = ?'); values.push(status); }
    if (completedStep !== undefined) { setClauses.push('completed_step = GREATEST(completed_step, ?)'); values.push(completedStep); }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(id);
    const [result] = await pool.query(
      `UPDATE projects SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Project not found' });

    const [rows] = await pool.query('SELECT * FROM projects WHERE id = ?', [id]);
    res.json({ success: true, project: parseProject(rows[0]) });
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.activateProject = async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.query(
      `SELECT p.type, u.email AS ownerEmail, u.firstname AS ownerFirstName, u.lastname AS ownerLastName
       FROM projects p
       JOIN users u ON u.userid = p.user_id
       WHERE p.id = ?`,
      [id]
    );
    if (existing.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });

    const isPublic = existing[0].type === 'public';
    const rand = () => Math.random().toString(36).toUpperCase().slice(2, 6);
    const projectCode = isPublic ? `PRJ-${rand()}-${rand()}` : null;

    await pool.query(
      "UPDATE projects SET status = 'active', completed_step = 6, project_code = ? WHERE id = ?",
      [projectCode, id]
    );

    const [rows] = await pool.query('SELECT * FROM projects WHERE id = ?', [id]);

    // Log project activation
    await logActivity(
      rows[0].user_id,
      'settings',
      `Project "${rows[0].name}" was activated`,
      null,
      rows[0].name
    );

    // Notify collaborators and support staff - non-blocking
    try {
      const project = parseProject(rows[0]);
      const recipients = [];
      if (existing[0].ownerEmail) {
        recipients.push({
          email: existing[0].ownerEmail,
          firstName: existing[0].ownerFirstName,
          lastName: existing[0].ownerLastName,
          name: 'Project Owner',
          subject: `DocsNDocs: Your project "${project.name}" is now active`,
        });
      }
      recipients.push(...(project.collaborators ?? []));
      const templatePath = path.join(__dirname, '../templates-email/projectactivation.html');
      const template = fs.readFileSync(templatePath, 'utf8');

      const deadlineBlock = project.deadline
        ? `<p class="detail-row"><strong>Deadline:</strong> ${new Date(project.deadline).toDateString()}</p>`
        : '';
      const projectCodeBlock = project.projectCode
        ? `<div class="code-section"><p class="code-label">Project Code</p><div class="code-box"><p class="code-value">${project.projectCode}</p></div></div>`
        : '';

      if (project.staff?.email) {
        recipients.push({
          ...project.staff,
          name: [project.staff.firstName, project.staff.lastName].filter(Boolean).join(' ') || 'Support Staff',
        });
      }

      await Promise.all(
        recipients
          .filter(c => c.email)
          .map(c => {
            const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || 'Collaborator';
            const body = template
              .replace('{{BASE_URL}}', process.env.APP_BASE_URL ?? '')
              .replace('{{COLLABORATOR_NAME}}', name)
              .replace('{{PROJECT_NAME}}', project.name)
              .replace('{{DEADLINE_BLOCK}}', deadlineBlock)
              .replace('{{PROJECT_CODE_BLOCK}}', projectCodeBlock);
            return sendEmail(c.email, c.subject ?? `DocsNDocs: "${project.name}" is now active`, body);
          })
      );
    } catch (emailErr) {
      console.error('[email] Project activation email failed (non-fatal):', emailErr);
    }

    res.json({ success: true, project: parseProject(rows[0]) });
  } catch (err) {
    console.error('Activate project error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.cancelProject = async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.query(
      "UPDATE projects SET status = 'cancelled' WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Project not found' });

    const [rows] = await pool.query('SELECT * FROM projects WHERE id = ?', [id]);
    res.json({ success: true, project: parseProject(rows[0]) });
  } catch (err) {
    console.error('Cancel project error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { id } = req.params;

    // Submissions must be removed first due to the FK constraint on project_id.
    await pool.query('DELETE FROM submissions WHERE project_id = ?', [id]);

    const [result] = await pool.query('DELETE FROM projects WHERE id = ?', [id]);

    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Project not found' });

    res.json({ success: true });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.uploadProjectAttachment = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const scope = req.body?.scope === 'team' ? 'team' : 'solo';
    const emailPrefix = (req.user?.email ?? 'user').replace(/[^a-zA-Z0-9._-]+/g, '-');
    const url = await uploadToBlob({
      folder: `project-attachments/${scope}/${emailPrefix}`,
      file: req.file,
    });

    res.status(201).json({
      success: true,
      attachment: {
        name: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        url,
      },
    });
  } catch (err) {
    console.error('Upload project attachment error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
