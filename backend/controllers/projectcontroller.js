const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../utils/sql');
const logActivity = require('../utils/logActivity');
const { sendEmail } = require('../utils/emailservice');
const { uploadToBlob } = require('../utils/blobStorage');
const { deadlineCalendarDate, isFutureDeadline } = require('../utils/timezone');
const { get } = require('@vercel/blob');
const { Readable } = require('stream');
const { soloProjectRoles, normalizeStaff } = require('../utils/projectRoles');
const { generateProjectCode } = require('../utils/projectCode');
const { escapeHtml } = require('../utils/html');

const isMySQL = (process.env.DB_CLIENT ?? 'pg') === 'mysql';
const jsonText = col => isMySQL ? `CAST(${col} AS CHAR)` : `${col}::text`;

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
  return collaborators.some(c => c?.status !== 'inactive' && String(c?.email ?? '').toLowerCase() === String(email ?? '').toLowerCase());
}

const activeCollaborators = collaborators => (collaborators ?? []).filter(c => c?.status !== 'inactive');
const activeDocuments = documents => (documents ?? []).filter(d => d?.status !== 'inactive');

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
    paidCollaboratorCapacity: parsed.paid_collaborator_capacity == null ? null : Number(parsed.paid_collaborator_capacity),
    paidDocumentCapacity: parsed.paid_document_capacity == null ? null : Number(parsed.paid_document_capacity),
    roles: Array.isArray(parsed.roles) ? parsed.roles : [],
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
    const normalizedStaff = normalizeStaff(staff);
    if (staff != null && normalizedStaff === undefined) {
      return res.status(400).json({ success: false, message: 'Support staff must have a valid email address' });
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
        JSON.stringify(normalizedStaff),
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
      "UPDATE projects SET status = 'completed' WHERE status = 'active' AND deadline IS NOT NULL AND deadline < CURRENT_DATE",
    );

    const [ownedRows] = await pool.query(
      "SELECT p.*, ppu.snapshot AS pending_billing_snapshot FROM projects p LEFT JOIN pending_project_upgrades ppu ON ppu.project_id = p.id WHERE p.user_id = ? ORDER BY p.created_at DESC",
      [userid]
    );
    const [userRows] = await pool.query(
      'SELECT email FROM users WHERE userid = ?',
      [userid]
    );
    const user = { id: userid, email: userRows[0]?.email };
    const userEmail = String(user.email ?? '').trim().toLowerCase();
    const [accessibleRows] = userEmail
      ? await pool.query(
        `SELECT * FROM projects
         WHERE user_id != ? AND (LOWER(${jsonText('collaborators')}) LIKE LOWER(?) OR LOWER(${jsonText('staff')}) LIKE LOWER(?))
         ORDER BY created_at DESC`,
        [userid, `%${userEmail}%`, `%${userEmail}%`]
      )
      : [[]];
    const roleRows = [...ownedRows, ...accessibleRows]
      .map(row => ({ row, roles: soloProjectRoles(row, user) }))
      .filter(entry => entry.roles.length > 0);

    res.json({
      success: true,
      projects: roleRows.map(({ row, roles }) => parseProject({ ...row, roles })),
    });
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getProject = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT p.*, u.firstname AS owner_firstname, u.lastname AS owner_lastname,
              ppu.snapshot AS pending_billing_snapshot,
              (SELECT ss.collaborators FROM stripe_subscriptions ss
               WHERE ss.project_id = p.id AND ss.status IN ('active', 'trialing')
               ORDER BY ss.created_at DESC LIMIT 1) AS paid_collaborator_capacity,
              (SELECT ss.documents FROM stripe_subscriptions ss
               WHERE ss.project_id = p.id AND ss.status IN ('active', 'trialing')
               ORDER BY ss.created_at DESC LIMIT 1) AS paid_document_capacity
       FROM projects p
       JOIN users u ON u.userid = p.user_id
       LEFT JOIN pending_project_upgrades ppu ON ppu.project_id = p.id AND ppu.project_type = 'solo'
       WHERE p.id = ?`,
      [id]
    );

    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });
    if (req.user?.email) {
      const userId = await authenticatedUserId(req);
      const roles = soloProjectRoles(rows[0], { id: userId, email: req.user.email });
      if (roles.length === 0) {
        return res.status(403).json({ success: false, message: 'You cannot access this project' });
      }
      rows[0].roles = roles;
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
    const normalizedStaff = staff === undefined ? undefined : normalizeStaff(staff);
    if (staff != null && normalizedStaff === undefined) {
      return res.status(400).json({ success: false, message: 'Support staff must have a valid email address' });
    }

    let ownedProject = null;
    let requesterRoles = [];
    if (req.user?.email) {
      const userId = await authenticatedUserId(req);
      const [accessible] = await pool.query('SELECT * FROM projects WHERE id = ?', [id]);
      if (accessible.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });
      requesterRoles = soloProjectRoles(accessible[0], { id: userId, email: req.user.email });
      if (!requesterRoles.includes('host') && !requesterRoles.includes('staff')) {
        return res.status(403).json({ success: false, message: 'Only the project host or support staff can update this project' });
      }
      ownedProject = accessible[0];
    }
    const currentSolo = ownedProject ? parseProject(ownedProject) : null;
    if (ownedProject && requesterRoles.includes('staff') && !requesterRoles.includes('host')) {
      const changesPricing =
        (deadline !== undefined && deadlineCalendarDate(deadline) !== deadlineCalendarDate(currentSolo.deadline)) ||
        (expectedCollaborators !== undefined && Number(expectedCollaborators) > Number(currentSolo.expectedCollaborators)) ||
        (collaborators !== undefined && activeCollaborators(collaborators).length !== activeCollaborators(currentSolo.collaborators).length) ||
        (documents !== undefined && activeDocuments(documents).length > activeDocuments(currentSolo.documents).length);
      const changesHostOnlyState = status !== undefined && status !== currentSolo.status;
      const changesStaffAssignment = staff !== undefined
        && JSON.stringify(normalizeStaff(currentSolo.staff)) !== JSON.stringify(normalizedStaff);
      if (changesPricing) {
        return res.status(403).json({ success: false, code: 'HOST_REQUIRED_FOR_PRICING', message: 'This change can affect the project price. Please ask the project host to make it.' });
      }
      if (changesHostOnlyState || changesStaffAssignment) {
        return res.status(403).json({ success: false, code: 'HOST_REQUIRED', message: 'Only the project host can change project status or support staff assignment' });
      }
    }
    if (ownedProject?.status === 'active' && currentSolo?.type === 'public' && expectedCollaborators !== undefined) {
      const joinedCollaboratorCount = activeCollaborators(currentSolo.collaborators).length;
      if (Number(expectedCollaborators) < Math.max(1, joinedCollaboratorCount)) {
        return res.status(409).json({
          success: false,
          message: `Expected collaborators cannot be lower than the ${joinedCollaboratorCount} collaborators who have already joined`,
        });
      }
    }
    if (ownedProject?.status === 'active' && documents !== undefined &&
        activeDocuments(documents).length < activeDocuments(currentSolo.documents).length) {
      const [submittedDocumentRows] = await pool.query(
        'SELECT DISTINCT document_index FROM submissions WHERE project_id = ?',
        [id]
      );
      const invalidatesSubmission = submittedDocumentRows.some(row => {
        const index = Number(row.document_index);
        const previousDocument = currentSolo.documents[index];
        const nextDocument = documents[index];
        return !nextDocument || nextDocument.status === 'inactive' || nextDocument.name !== previousDocument?.name;
      });
      if (invalidatesSubmission) {
        return res.status(409).json({
          success: false,
          message: 'A document with existing submissions cannot be removed or moved',
        });
      }
    }
    let paidSolo = currentSolo;
    if (ownedProject?.status === 'active') {
      const [pendingRows] = await pool.query("SELECT snapshot FROM pending_project_upgrades WHERE project_id = ? AND project_type = 'solo'", [id]);
      if (pendingRows.length > 0) {
        const snapshot = typeof pendingRows[0].snapshot === 'string' ? JSON.parse(pendingRows[0].snapshot) : pendingRows[0].snapshot;
        paidSolo = {
          ...currentSolo,
          deadline: snapshot.deadline,
          collaborators: snapshot.collaborators ?? [],
          documents: snapshot.documents ?? [],
          assignments: snapshot.assignments ?? {},
          expectedCollaborators: snapshot.expectedCollaborators ?? null,
        };
      }
    }
    const [capacityRows] = ownedProject?.status === 'active'
      ? await pool.query("SELECT collaborators, documents FROM stripe_subscriptions WHERE project_id = ? AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1", [id])
      : [[]];
    const paidCollaboratorCapacity = Number(capacityRows[0]?.collaborators ?? activeCollaborators(paidSolo?.collaborators).length);
    const paidDocumentCapacity = Number(capacityRows[0]?.documents ?? activeDocuments(paidSolo?.documents).length);
    if (ownedProject?.status === 'active' && deadline !== undefined &&
        deadlineCalendarDate(deadline) < deadlineCalendarDate(paidSolo.deadline)) {
      return res.status(409).json({ success: false, message: 'An active project deadline cannot be earlier than its last paid deadline' });
    }
    const soloBillingIncreased = ownedProject?.status === 'active' && (
      (deadline !== undefined && deadlineCalendarDate(deadline) > deadlineCalendarDate(paidSolo.deadline)) ||
      (collaborators !== undefined && activeCollaborators(collaborators).length > paidCollaboratorCapacity) ||
      (documents !== undefined && activeDocuments(documents).length > paidDocumentCapacity) ||
      (expectedCollaborators !== undefined && Number(expectedCollaborators) > Number(paidSolo.expectedCollaborators ?? 0))
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
    if (staff !== undefined) { setClauses.push('staff = ?'); values.push(JSON.stringify(normalizedStaff)); }
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
    rows[0].paid_collaborator_capacity = paidCollaboratorCapacity || null;
    rows[0].paid_document_capacity = paidDocumentCapacity || null;
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
    const projectCode = isPublic ? generateProjectCode('PRJ') : null;

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
      recipients.push(...activeCollaborators(project.collaborators));
      const templatePath = path.join(__dirname, '../templates-email/projectactivation.html');
      const template = fs.readFileSync(templatePath, 'utf8');

      const deadlineBlock = project.deadline
        ? `<p class="detail-row"><strong>Deadline:</strong> ${new Date(project.deadline).toDateString()}</p>`
        : '';
      const projectCodeBlock = project.projectCode
        ? `<div class="code-section"><p class="code-label">Project Code</p><div class="code-box"><p class="code-value">${escapeHtml(project.projectCode)}</p></div></div>`
        : '';

      if (project.staff?.email) {
        recipients.push({
          ...project.staff,
          name: [project.staff.firstName, project.staff.lastName].filter(Boolean).join(' ') || 'Support Staff',
          recipientRole: 'staff',
        });
      }

      await Promise.all(
        recipients
          .filter(c => c.email)
          .map(c => {
            const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || 'Collaborator';
            const body = template
              .replace('{{BASE_URL}}', process.env.APP_BASE_URL ?? '')
              .replace('{{COLLABORATOR_NAME}}', escapeHtml(name))
              .replace('{{PROJECT_NAME}}', escapeHtml(project.name))
              .replace('{{DEADLINE_BLOCK}}', deadlineBlock)
              .replace('{{PROJECT_CODE_BLOCK}}', projectCodeBlock);
            const staffAccessUrl = `${process.env.APP_BASE_URL ?? 'https://www.docsndocs.com'}/top-menu-solo-projects?projectId=${encodeURIComponent(project.id)}`;
            const accessBlock = c.recipientRole === 'staff'
              ? `<p><strong>Your role:</strong> Support Staff</p><p><a href="${escapeHtml(staffAccessUrl)}">Open project as support staff</a></p>`
              : '';
            return sendEmail(c.email, c.subject ?? `DocsNDocs: "${project.name}" is now active`, body.replace('{{ACCESS_BLOCK}}', accessBlock));
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

exports.downloadProjectAttachment = async (req, res) => {
  try {
    const { id, attachmentIndex } = req.params;
    const [rows] = await pool.query(
      'SELECT user_id, collaborators, staff, attachments FROM projects WHERE id = ?',
      [id],
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });

    const userId = await authenticatedUserId(req);
    const roles = soloProjectRoles(rows[0], { id: userId, email: req.user?.email });
    if (roles.length === 0) {
      return res.status(403).json({ success: false, message: 'You cannot access this project file' });
    }

    const attachments = parseProject({ attachments: rows[0].attachments }).attachments;
    const index = Number(attachmentIndex);
    const attachment = Number.isInteger(index) ? attachments[index] : null;
    if (!attachment?.url) return res.status(404).json({ success: false, message: 'Project file not found' });

    let result;
    if (String(attachment.url).startsWith('/public/uploads/local/')) {
      const absolutePath = path.join(__dirname, '..', String(attachment.url).replace(/^\//, ''));
      if (!fs.existsSync(absolutePath)) return res.status(404).json({ success: false, message: 'Project file not found' });
      result = { statusCode: 200, blob: { contentType: attachment.mimeType }, stream: fs.createReadStream(absolutePath) };
    } else {
      try {
        result = await get(attachment.url, { access: 'private' });
      } catch {
        result = await get(attachment.url, { access: 'public' });
      }
    }
    if (!result || result.statusCode !== 200) return res.status(404).json({ success: false, message: 'Project file not found' });

    res.set('Content-Type', result.blob?.contentType || attachment.mimeType || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${String(attachment.name || 'project-file').replace(/["\r\n]/g, '_')}"`);
    const stream = typeof result.stream?.pipe === 'function' ? result.stream : Readable.fromWeb(result.stream);
    stream.pipe(res);
  } catch (err) {
    console.error('Download project attachment error:', err);
    res.status(500).json({ success: false, message: 'Could not download project file' });
  }
};

exports.downloadDocumentTemplate = async (req, res) => {
  try {
    const { id, documentIndex } = req.params;
    const [rows] = await pool.query(
      'SELECT user_id, collaborators, staff, documents FROM projects WHERE id = ?',
      [id],
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });

    const userId = await authenticatedUserId(req);
    const roles = soloProjectRoles(rows[0], { id: userId, email: req.user?.email });
    if (roles.length === 0) {
      return res.status(403).json({ success: false, message: 'You cannot access this document template' });
    }

    const documents = parseProject({ documents: rows[0].documents }).documents;
    const index = Number(documentIndex);
    const document = Number.isInteger(index) ? documents[index] : null;
    if (!document?.templateUrl) return res.status(404).json({ success: false, message: 'Document template not found' });

    let result;
    if (String(document.templateUrl).startsWith('/public/uploads/local/')) {
      const absolutePath = path.join(__dirname, '..', String(document.templateUrl).replace(/^\//, ''));
      if (!fs.existsSync(absolutePath)) return res.status(404).json({ success: false, message: 'Document template not found' });
      result = { statusCode: 200, blob: { contentType: document.templateMimeType }, stream: fs.createReadStream(absolutePath) };
    } else {
      try {
        result = await get(document.templateUrl, { access: 'private' });
      } catch {
        result = await get(document.templateUrl, { access: 'public' });
      }
    }
    if (!result || result.statusCode !== 200) return res.status(404).json({ success: false, message: 'Document template not found' });

    res.set('Content-Type', result.blob?.contentType || document.templateMimeType || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${String(document.templateName || 'template').replace(/["\r\n]/g, '_')}"`);
    const stream = typeof result.stream?.pipe === 'function' ? result.stream : Readable.fromWeb(result.stream);
    stream.pipe(res);
  } catch (err) {
    console.error('Download document template error:', err);
    res.status(500).json({ success: false, message: 'Could not download document template' });
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
