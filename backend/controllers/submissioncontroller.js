const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../utils/sql');
const logActivity = require('../utils/logActivity');
const { sendEmail } = require('../utils/emailservice');

exports.createSubmission = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { collabIndex, docIndex } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    if (collabIndex === undefined || docIndex === undefined) {
      return res.status(400).json({ success: false, message: 'collabIndex and docIndex are required' });
    }

    const [projects] = await pool.query('SELECT id FROM projects WHERE id = ?', [projectId]);
    if (projects.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });

    const filePath = `/public/uploads/submissions/${projectId}/${collabIndex}/${file.originalname}`;
    const collabIdx = Number(collabIndex);
    const docIdx = Number(docIndex);

    // Multer sends body fields as strings; cast to number so the unique index
    // (project_id, collaborator_index, document_index) matches correctly.
    const [existing] = await pool.query(
      'SELECT id FROM submissions WHERE project_id = ? AND collaborator_index = ? AND document_index = ?',
      [projectId, collabIdx, docIdx]
    );

    if (existing.length > 0) {
      // Re-submission: reset status to 'submitted' and clear feedback so the
      // owner must re-review. submitted_at is refreshed to reflect the new upload time.
      await pool.query(
        `UPDATE submissions
         SET file_name = ?, file_size = ?, file_path = ?, status = 'submitted', feedback = NULL, submitted_at = NOW()
         WHERE project_id = ? AND collaborator_index = ? AND document_index = ?`,
        [file.originalname, file.size, filePath, projectId, collabIdx, docIdx]
      );
    } else {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO submissions (id, project_id, collaborator_index, document_index, file_name, file_size, file_path, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted')`,
        [id, projectId, collabIdx, docIdx, file.originalname, file.size, filePath]
      );
    }

    // MySQL has no RETURNING clause, so we re-fetch to get the final row state
    // (auto-updated `updated_at` and the correct `id` whether inserted or updated).
    const [rows] = await pool.query(
      'SELECT * FROM submissions WHERE project_id = ? AND collaborator_index = ? AND document_index = ?',
      [projectId, collabIdx, docIdx]
    );

    // Log activity and notify project owner — non-blocking
    try {
      const [projectRows] = await pool.query(
        `SELECT p.user_id, p.name, p.collaborators, p.documents,
                u.firstname, u.lastname, u.email AS ownerEmail
         FROM projects p
         JOIN users u ON u.userid = p.user_id
         WHERE p.id = ?`,
        [projectId]
      );
      if (projectRows.length > 0) {
        const project = projectRows[0];

        await logActivity(
          project.user_id,
          'upload',
          `New document uploaded to "${project.name}"`,
          null,
          project.name
        );

        if (project.ownerEmail) {
          const collaborators = typeof project.collaborators === 'string' ? JSON.parse(project.collaborators) : project.collaborators ?? [];
          const documents = typeof project.documents === 'string' ? JSON.parse(project.documents) : project.documents ?? [];
          const collaborator = collaborators[collabIdx];
          const document = documents[docIdx];
          const collaboratorName = collaborator
            ? ([collaborator.firstName, collaborator.lastName].filter(Boolean).join(' ') || collaborator.name || 'A collaborator')
            : 'A collaborator';
          const documentName = document?.name ?? rows[0].file_name;
          const ownerName = [project.firstname, project.lastname].filter(Boolean).join(' ') || 'there';

          const templatePath = path.join(__dirname, '../templates-email/newsubmission.html');
          const body = fs.readFileSync(templatePath, 'utf8')
            .replace('{{BASE_URL}}', process.env.APP_BASE_URL ?? '')
            .replace('{{OWNER_NAME}}', ownerName)
            .replace('{{COLLABORATOR_NAME}}', collaboratorName)
            .replace('{{PROJECT_NAME}}', project.name)
            .replace('{{DOCUMENT_NAME}}', documentName);

          await sendEmail(project.ownerEmail, `DocsNDocs: New submission in "${project.name}"`, body);
        }
      }
    } catch (emailErr) {
      console.error('[email] New submission email failed (non-fatal):', emailErr);
    }

    res.status(201).json({ success: true, submission: rows[0] });
  } catch (err) {
    console.error('Create submission error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateSubmission = async (req, res) => {
  try {
    const { projectId, submissionId } = req.params;
    const { status, feedback } = req.body;

    const ALLOWED = new Set(['approved', 'revision']);
    if (!ALLOWED.has(status)) {
      return res.status(400).json({ success: false, message: 'status must be approved or revision' });
    }

    const [result] = await pool.query(
      `UPDATE submissions SET status = ?, feedback = ? WHERE id = ? AND project_id = ?`,
      [status, feedback ?? null, submissionId, projectId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const [rows] = await pool.query('SELECT * FROM submissions WHERE id = ?', [submissionId]);
    const submission = rows[0];

    // Send review notification email — non-blocking
    try {
      const [projectRows] = await pool.query('SELECT name, collaborators, documents FROM projects WHERE id = ?', [projectId]);
      if (projectRows.length > 0) {
        const project = projectRows[0];
        const collaborators = typeof project.collaborators === 'string' ? JSON.parse(project.collaborators) : project.collaborators ?? [];
        const documents = typeof project.documents === 'string' ? JSON.parse(project.documents) : project.documents ?? [];
        const collaborator = collaborators[submission.collaborator_index];
        const document = documents[submission.document_index];

        if (collaborator?.email) {
          const isApproved = status === 'approved';
          const collaboratorName = [collaborator.firstName, collaborator.lastName].filter(Boolean).join(' ') || collaborator.name || 'Collaborator';
          const documentName = document?.name ?? submission.file_name;

          const feedbackBlock = feedback
            ? `<div class="feedback-box"><p class="feedback-label">Feedback from Reviewer</p><p class="feedback-text">${feedback}</p></div>`
            : '';

          const templatePath = path.join(__dirname, '../templates-email/submissionreview.html');
          const body = fs.readFileSync(templatePath, 'utf8')
            .replaceAll('{{BASE_URL}}', process.env.APP_BASE_URL ?? '')
            .replaceAll('{{COLLABORATOR_NAME}}', collaboratorName)
            .replaceAll('{{PROJECT_NAME}}', project.name)
            .replaceAll('{{STATUS_CLASS}}', isApproved ? 'status-approved' : 'status-revision')
            .replaceAll('{{STATUS_LABEL}}', isApproved ? 'Approved' : 'Revision Required')
            .replaceAll('{{DOCUMENT_NAME}}', documentName)
            .replaceAll('{{FEEDBACK_BLOCK}}', feedbackBlock)
            .replaceAll('{{STATUS_MESSAGE}}', isApproved
              ? 'Your document has been approved. No further action is required.'
              : 'Please review the feedback above and resubmit your document.');

          const subject = isApproved
            ? `DocsNDocs: Your submission for "${project.name}" has been approved`
            : `DocsNDocs: Revision requested for your submission in "${project.name}"`;

          await sendEmail(collaborator.email, subject, body);
        }
      }
    } catch (emailErr) {
      console.error('[email] Review email failed (non-fatal):', emailErr);
    }

    res.json({ success: true, submission });
  } catch (err) {
    console.error('Update submission error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getSubmissionStats = async (req, res) => {
  try {
    const { projectIds } = req.query;
    if (!projectIds) return res.json({ success: true, stats: {} });
    const ids = String(projectIds).split(',').filter(Boolean);
    if (ids.length === 0) return res.json({ success: true, stats: {} });
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT project_id,
              SUM(CASE WHEN status = 'approved'  THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS submitted
       FROM submissions WHERE project_id IN (${placeholders}) GROUP BY project_id`,
      ids
    );
    const stats = {};
    for (const row of rows) stats[row.project_id] = { approved: Number(row.approved), submitted: Number(row.submitted) };
    res.json({ success: true, stats });
  } catch (err) {
    console.error('Submission stats error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getSubmissions = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { collabIndex } = req.query;

    let query = 'SELECT * FROM submissions WHERE project_id = ?';
    const params = [projectId];

    // collabIndex is optional: omitting it lets the owner fetch all submissions
    // for a project at once (e.g. for a review dashboard).
    if (collabIndex !== undefined) {
      query += ' AND collaborator_index = ?';
      params.push(Number(collabIndex));
    }

    const [rows] = await pool.query(query, params);
    res.json({ success: true, submissions: rows });
  } catch (err) {
    console.error('Get submissions error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
