const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../utils/sql');
const { sendEmail } = require('../utils/emailservice');
const { uploadToBlob } = require('../utils/blobStorage');
const { isSupportStaff } = require('../utils/projectRoles');

async function requireTeamProjectReviewer(req, res) {
  if (!req.user?.email) return true;
  const [users] = await pool.query('SELECT userid FROM users WHERE LOWER(email) = LOWER(?)', [req.user.email]);
  const userId = users[0]?.userid;
  const [rows] = await pool.query(
    `SELECT tp.id, tp.support_staff FROM team_projects tp
     JOIN teams t ON t.id = tp.team_id
     LEFT JOIN team_project_roles tpr ON tpr.project_id = tp.id AND tpr.user_id = ? AND tpr.role IN ('host', 'supervisor')
     WHERE tp.id = ? AND (t.user_id = ? OR tpr.user_id IS NOT NULL)
     LIMIT 1`,
    [userId, req.params.id, userId]
  );
  if (rows.length > 0) return true;
  const [staffRows] = await pool.query('SELECT support_staff FROM team_projects WHERE id = ?', [req.params.id]);
  if (staffRows.length > 0 && isSupportStaff(staffRows[0], req.user.email, 'support_staff')) return true;
  res.status(403).json({ success: false, message: 'Only the team owner, host, supervisor, or support staff can review submissions' });
  return false;
}

// GET /teams/projects/:id/upload-info/:collaboratorId
exports.getUploadInfo = async (req, res) => {
  try {
    const { id, collaboratorId } = req.params;
    if (!collaboratorId) return res.status(400).json({ success: false, message: 'collaboratorId is required' });

    const [projectRows] = await pool.query(
      `SELECT tp.id, tp.name, tp.documents, tp.deadline, tp.status, t.name AS teamName
       FROM team_projects tp
       JOIN teams t ON t.id = tp.team_id
       WHERE tp.id = ?`,
      [id]
    );
    if (projectRows.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });

    const row = projectRows[0];
    let documents = [];
    if (row.documents) {
      try { documents = typeof row.documents === 'string' ? JSON.parse(row.documents) : row.documents; } catch { documents = []; }
    }

    const [collabRows] = await pool.query(
      `SELECT id, first_name AS firstName, last_name AS lastName, email, affiliation, role
       FROM team_project_collaborators WHERE id = ? AND project_id = ?`,
      [collaboratorId, id]
    );
    if (collabRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Collaborator not found' });
    }

    const collaborator = collabRows[0];
    if (req.user?.email && String(collaborator.email).toLowerCase() !== String(req.user.email).toLowerCase()) {
      return res.status(403).json({ success: false, message: 'You cannot access this collaborator workspace' });
    }

    const [submissions] = await pool.query(
      `SELECT id, document_index AS documentIndex, file_name AS fileName, file_size AS fileSize,
              status, feedback, submitted_at AS submittedAt
       FROM team_project_submissions WHERE project_id = ? AND collaborator_id = ?`,
      [id, collaborator.id]
    );

    res.json({
      success: true,
      project: {
        id: row.id,
        name: row.name,
        teamName: row.teamName,
        deadline: row.deadline ?? null,
        status: row.status,
        documents,
      },
      collaborator,
      submissions,
    });
  } catch (err) {
    console.error('Get upload info error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /teams/projects/:id/submissions  (host/supervisor review view)
exports.getSubmissions = async (req, res) => {
  try {
    const { id } = req.params;
    if (!await requireTeamProjectReviewer(req, res)) return;

    const [projectRows] = await pool.query(
      'SELECT documents FROM team_projects WHERE id = ?', [id]
    );
    if (projectRows.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });

    let documents = [];
    if (projectRows[0].documents) {
      try { documents = typeof projectRows[0].documents === 'string' ? JSON.parse(projectRows[0].documents) : projectRows[0].documents; } catch { documents = []; }
    }

    const [rows] = await pool.query(
      `SELECT tps.id, tps.document_index AS documentIndex, tps.file_name AS fileName,
              tps.file_size AS fileSize, tps.status, tps.feedback, tps.submitted_at AS submittedAt,
              tpc.first_name AS firstName, tpc.last_name AS lastName, tpc.email
       FROM team_project_submissions tps
       JOIN team_project_collaborators tpc ON tpc.id = tps.collaborator_id
       WHERE tps.project_id = ?
       ORDER BY tps.submitted_at DESC`,
      [id]
    );

    const submissions = rows.map(r => ({
      id: r.id,
      collaborator: { firstName: r.firstName, lastName: r.lastName, email: r.email },
      documentType: documents[r.documentIndex]?.name ?? 'Unknown Document',
      fileName: r.fileName,
      submittedDate: r.submittedAt,
      status: r.status === 'submitted' ? 'pending' : r.status,
      comments: r.feedback ?? null,
    }));

    res.json({ success: true, submissions });
  } catch (err) {
    console.error('Get team submissions error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /teams/projects/:id/submissions/:submissionId
exports.updateSubmission = async (req, res) => {
  try {
    const { id, submissionId } = req.params;
    const { status, feedback } = req.body;
    if (!await requireTeamProjectReviewer(req, res)) return;

    const ALLOWED = new Set(['approved', 'revision']);
    if (!ALLOWED.has(status)) {
      return res.status(400).json({ success: false, message: 'status must be approved or revision' });
    }

    const [result] = await pool.query(
      `UPDATE team_project_submissions SET status = ?, feedback = ? WHERE id = ? AND project_id = ?`,
      [status, feedback ?? null, submissionId, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    // Send review notification email — non-blocking
    try {
      const [rows] = await pool.query(
        `SELECT tps.document_index AS documentIndex, tps.file_name AS fileName,
                tpc.first_name AS firstName, tpc.last_name AS lastName, tpc.email,
                tp.name AS projectName, tp.documents
         FROM team_project_submissions tps
         JOIN team_project_collaborators tpc ON tpc.id = tps.collaborator_id
         JOIN team_projects tp ON tp.id = tps.project_id
         WHERE tps.id = ? AND tps.project_id = ?`,
        [submissionId, id]
      );

      if (rows.length > 0 && rows[0].email) {
        const row = rows[0];
        const isApproved = status === 'approved';
        const collaboratorName = [row.firstName, row.lastName].filter(Boolean).join(' ') || 'Collaborator';
        const documents = typeof row.documents === 'string' ? JSON.parse(row.documents) : row.documents ?? [];
        const documentName = documents[row.documentIndex]?.name ?? row.fileName;

        const feedbackBlock = feedback
          ? `<div class="feedback-box"><p class="feedback-label">Feedback from Reviewer</p><p class="feedback-text">${feedback}</p></div>`
          : '';

        const templatePath = path.join(__dirname, '../templates-email/submissionreview.html');
        const body = fs.readFileSync(templatePath, 'utf8')
          .replaceAll('{{BASE_URL}}', process.env.APP_BASE_URL ?? '')
          .replaceAll('{{COLLABORATOR_NAME}}', collaboratorName)
          .replaceAll('{{PROJECT_NAME}}', row.projectName)
          .replaceAll('{{STATUS_CLASS}}', isApproved ? 'status-approved' : 'status-revision')
          .replaceAll('{{STATUS_LABEL}}', isApproved ? 'Approved' : 'Revision Required')
          .replaceAll('{{DOCUMENT_NAME}}', documentName)
          .replaceAll('{{FEEDBACK_BLOCK}}', feedbackBlock)
          .replaceAll('{{STATUS_MESSAGE}}', isApproved
            ? 'Your document has been approved. No further action is required.'
            : 'Please review the feedback above and resubmit your document.');

        const subject = isApproved
          ? `DocsNDocs: Your submission for "${row.projectName}" has been approved`
          : `DocsNDocs: Revision requested for your submission in "${row.projectName}"`;

        await sendEmail(row.email, subject, body);
      }
    } catch (emailErr) {
      console.error('[email] Team review email failed (non-fatal):', emailErr);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Update team submission error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /teams/projects/:id/submissions
exports.createSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    const { collaboratorId, docIndex } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    if (!collaboratorId) return res.status(400).json({ success: false, message: 'collaboratorId is required' });
    if (docIndex === undefined) return res.status(400).json({ success: false, message: 'docIndex is required' });

    const [collabRows] = await pool.query(
      `SELECT id, email FROM team_project_collaborators WHERE id = ? AND project_id = ?`,
      [collaboratorId, id]
    );
    if (collabRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Collaborator not found' });
    }
    if (req.user?.email && String(collabRows[0].email).toLowerCase() !== String(req.user.email).toLowerCase()) {
      return res.status(403).json({ success: false, message: 'You cannot submit for another collaborator' });
    }
    const docIdx = Number(docIndex);
    const filePath = await uploadToBlob({
      folder: `submissions/team/${id}/${collaboratorId}`,
      prefix: `doc-${docIdx}`,
      file,
    });

    const [existing] = await pool.query(
      `SELECT id FROM team_project_submissions WHERE project_id = ? AND collaborator_id = ? AND document_index = ?`,
      [id, collaboratorId, docIdx]
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE team_project_submissions
         SET file_name = ?, file_size = ?, file_path = ?, status = 'submitted', feedback = NULL, submitted_at = NOW()
         WHERE project_id = ? AND collaborator_id = ? AND document_index = ?`,
        [file.originalname, file.size, filePath, id, collaboratorId, docIdx]
      );
    } else {
      await pool.query(
        `INSERT INTO team_project_submissions (id, project_id, collaborator_id, document_index, file_name, file_size, file_path, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted')`,
        [randomUUID(), id, collaboratorId, docIdx, file.originalname, file.size, filePath]
      );
    }

    const [rows] = await pool.query(
      `SELECT id, document_index AS documentIndex, file_name AS fileName, file_size AS fileSize,
              status, feedback, submitted_at AS submittedAt
       FROM team_project_submissions WHERE project_id = ? AND collaborator_id = ? AND document_index = ?`,
      [id, collaboratorId, docIdx]
    );

    // Notify project host — non-blocking
    try {
      const [hostRows] = await pool.query(
        `SELECT u.firstname, u.lastname, u.email,
                tp.name AS projectName, tp.documents,
                tpc.first_name AS collabFirstName, tpc.last_name AS collabLastName
         FROM team_project_roles tpr
         JOIN users u ON u.userid = tpr.user_id
         JOIN team_projects tp ON tp.id = tpr.project_id
         JOIN team_project_collaborators tpc ON tpc.id = ?
         WHERE tpr.project_id = ? AND tpr.role = 'host'
         LIMIT 1`,
        [collaboratorId, id]
      );

      if (hostRows.length > 0 && hostRows[0].email) {
        const host = hostRows[0];
        const documents = typeof host.documents === 'string' ? JSON.parse(host.documents) : host.documents ?? [];
        const documentName = documents[docIdx]?.name ?? rows[0].fileName;
        const collabName = [host.collabFirstName, host.collabLastName].filter(Boolean).join(' ') || 'A collaborator';
        const ownerName = [host.firstname, host.lastname].filter(Boolean).join(' ') || 'there';

        const templatePath = path.join(__dirname, '../templates-email/newsubmission.html');
        const body = fs.readFileSync(templatePath, 'utf8')
          .replace('{{BASE_URL}}', process.env.APP_BASE_URL ?? '')
          .replace('{{OWNER_NAME}}', ownerName)
          .replace('{{COLLABORATOR_NAME}}', collabName)
          .replace('{{PROJECT_NAME}}', host.projectName)
          .replace('{{DOCUMENT_NAME}}', documentName);

        await sendEmail(host.email, `DocsNDocs: New submission in "${host.projectName}"`, body);
      }
    } catch (emailErr) {
      console.error('[email] Team new submission email failed (non-fatal):', emailErr);
    }

    res.status(201).json({ success: true, submission: rows[0] });
  } catch (err) {
    console.error('Create team submission error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
