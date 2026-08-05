const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../utils/sql');
const logActivity = require('../utils/logActivity');
const { sendEmail } = require('../utils/emailservice');
const { uploadToBlob } = require('../utils/blobStorage');
const { deadlineCalendarDate, isFutureDeadline } = require('../utils/timezone');

const PROJECT_STATUSES = new Set(['draft', 'active', 'completed', 'not_completed', 'cancelled']);
const STATUS_TRANSITIONS = {
  draft: new Set(['draft', 'active', 'cancelled']),
  active: new Set(['active', 'completed', 'not_completed', 'cancelled']),
  not_completed: new Set(['not_completed', 'completed', 'cancelled']),
  cancelled: new Set(['cancelled', 'draft']),
  completed: new Set(['completed']),
};

async function authenticatedUserId(req) {
  if (!req.user?.email) return null;
  const [rows] = await pool.query('SELECT userid FROM users WHERE email = ?', [req.user.email]);
  return rows[0]?.userid == null ? null : String(rows[0].userid);
}

function includesCollaboratorEmail(value, email) {
  const collaborators = typeof value === 'string' ? JSON.parse(value || '[]') : (value ?? []);
  return collaborators.some(c => String(c?.email ?? '').toLowerCase() === String(email ?? '').toLowerCase());
}

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

  let pendingBillingUpgrade = null;
  if (parsed.pending_billing_snapshot) {
    try { pendingBillingUpgrade = typeof parsed.pending_billing_snapshot === 'string' ? JSON.parse(parsed.pending_billing_snapshot) : parsed.pending_billing_snapshot; } catch { pendingBillingUpgrade = null; }
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
    pendingBillingUpgrade,
  };
}

async function preservePaidSoloConfiguration(row) {
  const [pending] = await pool.query('SELECT project_id FROM pending_project_upgrades WHERE project_id = ?', [row.id]);
  if (pending.length > 0) return;
  const snapshot = {
    deadline: row.deadline, collaborators: parseProject(row).collaborators,
    documents: parseProject(row).documents, assignments: parseProject(row).assignments,
    expectedCollaborators: row.expected_collaborators,
  };
  await pool.query('INSERT INTO pending_project_upgrades (project_id, project_type, snapshot) VALUES (?, ?, ?)', [row.id, 'solo', JSON.stringify(snapshot)]);
}

exports.createProject = async (req, res) => {
  try {
    const { userid, name, description, deadline, collaborators, documents, assignments, attachments, staff, expectedCollaborators, type } = req.body;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });
    if (!name) return res.status(400).json({ success: false, message: 'name is required' });
    if (expectedCollaborators !== undefined && (!Number.isInteger(Number(expectedCollaborators)) || Number(expectedCollaborators) <= 0)) {
      return res.status(400).json({ success: false, message: 'expectedCollaborators must be a positive integer' });
    }
    if (req.user?.email) {
      const authenticatedId = await authenticatedUserId(req);
      if (!authenticatedId || String(userid) !== authenticatedId) {
        return res.status(403).json({ success: false, message: 'Projects can only be created for the authenticated user' });
      }
    }

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
    if (req.user?.email) {
      const authenticatedId = await authenticatedUserId(req);
      if (!authenticatedId || authenticatedId !== String(userid)) {
        return res.status(403).json({ success: false, message: 'You can only list your own projects' });
      }
    }

    await pool.query(
      "UPDATE projects SET status = 'not_completed' WHERE status = 'active' AND deadline IS NOT NULL AND deadline < CURRENT_DATE",
    );

    const [ownedRows] = await pool.query(
      "SELECT p.*, ppu.snapshot AS pending_billing_snapshot FROM projects p LEFT JOIN pending_project_upgrades ppu ON ppu.project_id = p.id WHERE p.user_id = ? ORDER BY p.created_at DESC",
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
    if (req.user?.email) {
      const userId = await authenticatedUserId(req);
      const isOwner = String(rows[0].user_id) === String(userId);
      if (!isOwner && !includesCollaboratorEmail(rows[0].collaborators, req.user.email)) {
        return res.status(403).json({ success: false, message: 'You cannot access this project' });
      }
    }

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

    if (expectedCollaborators !== undefined && (!Number.isInteger(Number(expectedCollaborators)) || Number(expectedCollaborators) <= 0)) {
      return res.status(400).json({ success: false, message: 'expectedCollaborators must be a positive integer' });
    }

    let ownedProject = null;
    if (req.user?.email) {
      const userId = await authenticatedUserId(req);
      const [owned] = await pool.query('SELECT * FROM projects WHERE id = ? AND user_id = ?', [id, userId]);
      if (owned.length === 0) return res.status(403).json({ success: false, message: 'Only the project owner can update this project' });
      ownedProject = owned[0];
    }
    if (ownedProject?.status === 'active' && deadline !== undefined &&
        deadlineCalendarDate(deadline) < deadlineCalendarDate(ownedProject.deadline)) {
      return res.status(409).json({ success: false, message: 'An active project deadline can only be extended' });
    }
    const currentSolo = ownedProject ? parseProject(ownedProject) : null;
    if (ownedProject?.status === 'active' && collaborators !== undefined && collaborators.length < currentSolo.collaborators.length) {
      return res.status(409).json({ success: false, message: 'The collaborator count of an active project cannot be reduced' });
    }
    if (ownedProject?.status === 'active' && expectedCollaborators !== undefined && Number(expectedCollaborators) < Number(ownedProject.expected_collaborators ?? 0)) {
      return res.status(409).json({ success: false, message: 'The expected collaborator count of an active project cannot be reduced' });
    }
    if (ownedProject?.status === 'active' && documents !== undefined && documents.length < currentSolo.documents.length) {
      return res.status(409).json({ success: false, message: 'The document count of an active project cannot be reduced' });
    }
    const soloBillingIncreased = ownedProject?.status === 'active' && (
      (deadline !== undefined && deadlineCalendarDate(deadline) > deadlineCalendarDate(ownedProject.deadline)) ||
      (collaborators !== undefined && collaborators.length > currentSolo.collaborators.length) ||
      (documents !== undefined && documents.length > currentSolo.documents.length) ||
      (expectedCollaborators !== undefined && Number(expectedCollaborators) > Number(ownedProject.expected_collaborators ?? 0))
    );
    if (soloBillingIncreased) {
      await preservePaidSoloConfiguration(ownedProject);
    }
    if (status !== undefined) {
      if (!PROJECT_STATUSES.has(status)) {
        return res.status(400).json({ success: false, message: 'Invalid project status' });
      }
      if (ownedProject && !STATUS_TRANSITIONS[ownedProject.status]?.has(status)) {
        return res.status(409).json({ success: false, message: `Project cannot transition from ${ownedProject.status} to ${status}` });
      }
    }

    const setClauses = [];
    const values = [];

    if (status === 'completed') {
      const forceComplete = req.body?.forceComplete === true;
      const [projectRows] = await pool.query(
        'SELECT type, collaborators, documents, assignments, expected_collaborators FROM projects WHERE id = ?',
        [id]
      );
      if (projectRows.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });
      const project = parseProject(projectRows[0]);
      const collaboratorsCount = project.collaborators.length;
      const missingCollaborators = project.type === 'public'
        ? Math.max(0, Number(project.expectedCollaborators ?? 0) - collaboratorsCount)
        : 0;
      const requiredSlots = project.type === 'public'
        ? collaboratorsCount * project.documents.length
        : Object.values(project.assignments).reduce((sum, docs) => sum + docs.length, 0);
      const [approvedRows] = await pool.query(
        "SELECT COUNT(*) AS approved_count FROM submissions WHERE project_id = ? AND status = 'approved'",
        [id]
      );
      const approvedSlots = Number(approvedRows[0]?.approved_count ?? 0);
      const missingApprovals = Math.max(0, requiredSlots - approvedSlots);
      if (!forceComplete && (missingCollaborators > 0 || requiredSlots === 0 || missingApprovals > 0)) {
        const requirements = [];
        if (missingCollaborators > 0) requirements.push(`${missingCollaborators} expected collaborator${missingCollaborators === 1 ? '' : 's'} have not joined`);
        if (requiredSlots === 0) requirements.push('no required document assignments exist');
        else if (missingApprovals > 0) requirements.push(`${missingApprovals} required document${missingApprovals === 1 ? '' : 's'} ${missingApprovals === 1 ? 'is' : 'are'} not approved`);
        return res.status(409).json({
          success: false,
          code: 'INCOMPLETE_REQUIREMENTS',
          message: requirements.join('; '),
          requirements: { missingCollaborators, missingApprovals, requiredSlots, approvedSlots },
        });
      }
    }

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

    if (req.user?.email) {
      const userId = await authenticatedUserId(req);
      const [owned] = await pool.query('SELECT id FROM projects WHERE id = ? AND user_id = ?', [id, userId]);
      if (owned.length === 0) return res.status(403).json({ success: false, message: 'Only the project owner can activate this project' });
    }

    const [existing] = await pool.query(
      `SELECT p.type, p.deadline, p.documents, u.email AS ownerEmail, u.firstname AS ownerFirstName, u.lastname AS ownerLastName,
              u.timezone AS ownerTimezone
       FROM projects p
       JOIN users u ON u.userid = p.user_id
       WHERE p.id = ?`,
      [id]
    );
    if (existing.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });
    if (!isFutureDeadline(existing[0].deadline, existing[0].ownerTimezone)) {
      return res.status(400).json({ success: false, message: 'A future deadline is required before activation' });
    }
    if (parseProject({ documents: existing[0].documents }).documents.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one required document is needed before activation' });
    }

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

    if (req.user?.email) {
      const userId = await authenticatedUserId(req);
      const [owned] = await pool.query('SELECT id FROM projects WHERE id = ? AND user_id = ?', [id, userId]);
      if (owned.length === 0) return res.status(403).json({ success: false, message: 'Only the project owner can cancel this project' });
    }

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

    if (req.user?.email) {
      const userId = await authenticatedUserId(req);
      const [owned] = await pool.query('SELECT id FROM projects WHERE id = ? AND user_id = ?', [id, userId]);
      if (owned.length === 0) return res.status(403).json({ success: false, message: 'Only the project owner can delete this project' });
    }

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

exports.discardPendingUpgrade = async (req, res) => {
  try {
    const userId = await authenticatedUserId(req);
    const [projects] = await pool.query('SELECT * FROM projects WHERE id = ? AND user_id = ?', [req.params.id, userId]);
    if (projects.length === 0) return res.status(403).json({ success: false, message: 'Only the project owner can discard these changes' });
    const [pending] = await pool.query("SELECT snapshot FROM pending_project_upgrades WHERE project_id = ? AND project_type = 'solo'", [req.params.id]);
    if (pending.length === 0) return res.status(404).json({ success: false, message: 'No unpaid project changes were found' });
    const snapshot = typeof pending[0].snapshot === 'string' ? JSON.parse(pending[0].snapshot) : pending[0].snapshot;
    await pool.query('UPDATE projects SET deadline = ?, collaborators = ?, documents = ?, assignments = ?, expected_collaborators = ? WHERE id = ?', [snapshot.deadline, JSON.stringify(snapshot.collaborators ?? []), JSON.stringify(snapshot.documents ?? []), JSON.stringify(snapshot.assignments ?? {}), snapshot.expectedCollaborators, req.params.id]);
    await pool.query('DELETE FROM pending_project_upgrades WHERE project_id = ?', [req.params.id]);
    const [rows] = await pool.query('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    return res.json({ success: true, project: parseProject(rows[0]) });
  } catch (err) {
    console.error('Discard pending project upgrade error:', err);
    return res.status(500).json({ success: false, message: 'Could not discard unpaid changes' });
  }
};

exports.validateActivation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = await authenticatedUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const [rows] = await pool.query(
      `SELECT p.id, p.deadline, p.documents, u.timezone AS "ownerTimezone"
       FROM projects p JOIN users u ON u.userid = p.user_id
       WHERE p.id = ? AND p.user_id = ?`,
      [id, userId]
    );
    if (rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Only the project owner can activate this project' });
    }
    if (!isFutureDeadline(rows[0].deadline, rows[0].ownerTimezone)) {
      return res.status(400).json({ success: false, message: 'A future deadline is required before activation' });
    }
    if (parseProject({ documents: rows[0].documents }).documents.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one required document is needed before activation' });
    }
    return next();
  } catch (err) {
    console.error('Validate activation error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
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
