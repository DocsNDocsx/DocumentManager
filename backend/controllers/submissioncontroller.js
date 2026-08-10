const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../utils/sql');
const logActivity = require('../utils/logActivity');
const { sendEmail } = require('../utils/emailservice');
const { uploadToBlob } = require('../utils/blobStorage');
const { get, head } = require('@vercel/blob');
const { Readable } = require('stream');

const SIZE_MULTIPLIERS = { KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
const configuredSubmittedWeight = Number(process.env.SUBMITTED_COMPLETION_WEIGHT ?? 0.25);
const SUBMITTED_COMPLETION_WEIGHT = Number.isFinite(configuredSubmittedWeight) && configuredSubmittedWeight >= 0 && configuredSubmittedWeight <= 1
  ? configuredSubmittedWeight
  : 0.25;
const FORMAT_MIMES = {
  PDF: ['application/pdf'], DOC: ['application/msword'],
  DOCX: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  XLS: ['application/vnd.ms-excel'], XLSX: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  PPT: ['application/vnd.ms-powerpoint'], PPTX: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  TXT: ['text/plain'], CSV: ['text/csv', 'application/vnd.ms-excel'],
  JPG: ['image/jpeg'], JPEG: ['image/jpeg'], PNG: ['image/png'],
};

function parseArray(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value ?? '[]'); } catch { return []; }
}

function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try { return JSON.parse(value ?? '{}'); } catch { return {}; }
}

function projectRequirementSlots(project) {
  const documents = parseArray(project.documents);
  const collaborators = parseArray(project.collaborators);
  const assignments = parseObject(project.assignments);
  const activeDocuments = new Set(documents.map((document, index) => ({ document, index }))
    .filter(entry => entry.document?.status !== 'inactive').map(entry => entry.index));
  const activeCollaborators = new Set(collaborators.map((collaborator, index) => ({ collaborator, index }))
    .filter(entry => entry.collaborator?.status !== 'inactive').map(entry => entry.index));

  if (project.type === 'public') return activeDocuments.size * activeCollaborators.size;
  return Object.entries(assignments).reduce((total, [collaboratorIndex, documentIndices]) => {
    if (!activeCollaborators.has(Number(collaboratorIndex)) || !Array.isArray(documentIndices)) return total;
    return total + documentIndices.filter(documentIndex => activeDocuments.has(Number(documentIndex))).length;
  }, 0);
}

function maxDocumentBytes(document) {
  const amount = Number(document?.maxSize);
  if (!Number.isFinite(amount) || amount <= 0) return 50 * 1024 * 1024;
  return amount * (SIZE_MULTIPLIERS[String(document?.sizeUnit ?? 'MB').toUpperCase()] ?? 1);
}

function isAllowedDocumentType(document, mimeType, fileName) {
  const formats = Array.isArray(document?.fileTypes) ? document.fileTypes : [];
  if (formats.length === 0) return true;
  const extension = String(fileName ?? '').split('.').pop()?.toUpperCase();
  return formats.some(format => {
    const normalized = String(format).toUpperCase();
    return normalized === extension || (FORMAT_MIMES[normalized] ?? []).includes(mimeType);
  });
}

async function ownerIdForEmail(email) {
  const [rows] = await pool.query('SELECT userid FROM users WHERE email = ?', [email]);
  return rows[0]?.userid == null ? null : String(rows[0].userid);
}

async function getBlobResult(filePath) {
  if (String(filePath).startsWith('/public/uploads/local/')) {
    const absolutePath = path.join(__dirname, '..', String(filePath).replace(/^\//, ''));
    if (!fs.existsSync(absolutePath)) return null;
    return {
      statusCode: 200,
      blob: { contentType: 'application/octet-stream' },
      stream: fs.createReadStream(absolutePath),
    };
  }
  try {
    return await get(filePath, { access: 'private' });
  } catch {
    return get(filePath, { access: 'public' });
  }
}

function toNodeStream(stream) {
  return typeof stream?.pipe === 'function' ? stream : Readable.fromWeb(stream);
}

exports.createSubmission = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { collabIndex, docIndex, blobUrl, fileName, fileSize, fileType } = req.body;
    const file = req.file;

    if (!file && !blobUrl) return res.status(400).json({ success: false, message: 'No file uploaded' });
    if (collabIndex === undefined || docIndex === undefined) {
      return res.status(400).json({ success: false, message: 'collabIndex and docIndex are required' });
    }

    const [projects] = await pool.query(
      'SELECT id, user_id, type, collaborators, documents, assignments, deadline, status FROM projects WHERE id = ?',
      [projectId]
    );
    if (projects.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });

    const collabIdx = Number(collabIndex);
    const docIdx = Number(docIndex);
    const project = projects[0];
    const collaborators = parseArray(project.collaborators);
    const documents = parseArray(project.documents);
    const document = documents[docIdx];
    if (!Number.isInteger(collabIdx) || !collaborators[collabIdx]) {
      return res.status(400).json({ success: false, message: 'Invalid collaborator' });
    }
    if (collaborators[collabIdx].status === 'inactive') {
      return res.status(403).json({ success: false, message: 'This collaborator has been removed from the project' });
    }
    if (req.user?.email) {
      const isCollaborator = String(collaborators[collabIdx].email ?? '').toLowerCase() === String(req.user.email).toLowerCase();
      if (!isCollaborator) {
        return res.status(403).json({ success: false, message: 'Unauthorized collaborator' });
      }
    }
    if (!Number.isInteger(docIdx) || !document) {
      return res.status(400).json({ success: false, message: 'Invalid document' });
    }
    if (document.status === 'inactive') {
      return res.status(403).json({ success: false, message: 'This document requirement has been removed from the project' });
    }
    if (project.status !== 'active') {
      return res.status(409).json({ success: false, message: 'Project is not accepting submissions' });
    }
    if (project.deadline && new Date(project.deadline) < new Date()) {
      return res.status(409).json({ success: false, message: 'Project deadline has passed' });
    }
    if (project.type !== 'public') {
      const assignments = project.assignments && typeof project.assignments === 'string'
        ? JSON.parse(project.assignments) : (project.assignments ?? {});
      if (!(assignments[String(collabIdx)] ?? []).includes(docIdx)) {
        return res.status(403).json({ success: false, message: 'Document is not assigned to this collaborator' });
      }
    }
    const effectiveName = file?.originalname ?? String(fileName ?? 'file');
    const effectiveSize = file?.size ?? Number(fileSize ?? 0);
    const effectiveType = file?.mimetype ?? String(fileType ?? '');
    if (effectiveSize <= 0 || effectiveSize > maxDocumentBytes(document)) {
      return res.status(400).json({ success: false, message: 'File exceeds the configured document size limit' });
    }
    if (!isAllowedDocumentType(document, effectiveType, effectiveName)) {
      return res.status(400).json({ success: false, message: 'File type is not allowed for this document' });
    }
    let filePath;
    if (file) {
      filePath = await uploadToBlob({
        folder: `submissions/solo/${projectId}/${collabIdx}`,
        prefix: `doc-${docIdx}`,
        file,
      });
    } else {
      const parsedUrl = new URL(blobUrl);
      if (!parsedUrl.hostname.endsWith('.private.blob.vercel-storage.com')) {
        return res.status(400).json({ success: false, message: 'Invalid uploaded file URL' });
      }
      const expectedFolder = `/submissions/solo/${projectId}/${collabIdx}/`;
      if (!decodeURIComponent(parsedUrl.pathname).includes(expectedFolder)) {
        return res.status(400).json({ success: false, message: 'Uploaded file URL does not belong to this submission' });
      }
      let blobMetadata;
      try {
        blobMetadata = await head(parsedUrl.toString(), { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch (error) {
        console.error('Verify uploaded Blob error:', error);
        return res.status(400).json({ success: false, message: 'Uploaded file could not be verified in secure storage' });
      }
      if (Number(blobMetadata.size) !== effectiveSize) {
        return res.status(400).json({ success: false, message: 'Uploaded file size does not match secure storage' });
      }
      if (effectiveType && blobMetadata.contentType && blobMetadata.contentType !== effectiveType) {
        return res.status(400).json({ success: false, message: 'Uploaded file type does not match secure storage' });
      }
      filePath = blobMetadata.url;
    }
    const storedFileName = effectiveName;
    const storedFileSize = effectiveSize;

    // Multer sends body fields as strings; cast to number so the unique index
    // (project_id, collaborator_index, document_index) matches correctly.
    const [existing] = await pool.query(
      'SELECT id, status FROM submissions WHERE project_id = ? AND collaborator_index = ? AND document_index = ?',
      [projectId, collabIdx, docIdx]
    );

    if (existing[0]?.status === 'rejected') {
      return res.status(409).json({ success: false, message: 'This document was permanently rejected and cannot be resubmitted' });
    }
    if (existing.length > 0) {
      // Re-submission: reset status to 'submitted' and clear feedback so the
      // owner must re-review. submitted_at is refreshed to reflect the new upload time.
      await pool.query(
        `UPDATE submissions
         SET file_name = ?, file_size = ?, file_path = ?, status = 'submitted', feedback = NULL, submitted_at = NOW()
         WHERE project_id = ? AND collaborator_index = ? AND document_index = ?`,
        [storedFileName, storedFileSize, filePath, projectId, collabIdx, docIdx]
      );
    } else {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO submissions (id, project_id, collaborator_index, document_index, file_name, file_size, file_path, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted')`,
        [id, projectId, collabIdx, docIdx, storedFileName, storedFileSize, filePath]
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

    const ALLOWED = new Set(['approved', 'revision', 'rejected']);
    if (!ALLOWED.has(status)) {
      return res.status(400).json({ success: false, message: 'status must be approved, revision, or rejected' });
    }
    if ((status === 'revision' || status === 'rejected') && !String(feedback ?? '').trim()) {
      return res.status(400).json({ success: false, message: 'Feedback is required for revision or rejection' });
    }
    if (req.user?.email) {
      const ownerId = await ownerIdForEmail(req.user.email);
      const [owned] = await pool.query('SELECT id FROM projects WHERE id = ? AND user_id = ?', [projectId, ownerId]);
      if (owned.length === 0) return res.status(403).json({ success: false, message: 'Only the project owner can review submissions' });
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
          const isRejected = status === 'rejected';
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
            .replaceAll('{{STATUS_CLASS}}', isApproved ? 'status-approved' : (isRejected ? 'status-rejected' : 'status-revision'))
            .replaceAll('{{STATUS_LABEL}}', isApproved ? 'Approved' : (isRejected ? 'Rejected' : 'Revision Required'))
            .replaceAll('{{DOCUMENT_NAME}}', documentName)
            .replaceAll('{{FEEDBACK_BLOCK}}', feedbackBlock)
            .replaceAll('{{STATUS_MESSAGE}}', isApproved
              ? 'Your document has been approved. No further action is required.'
              : (isRejected
                ? 'Your document was declined and cannot be resubmitted for this requirement.'
                : 'Please review the feedback above and resubmit your document.'));

          const subject = isApproved
            ? `DocsNDocs: Your submission for "${project.name}" has been approved`
            : (isRejected
              ? `DocsNDocs: Your submission for "${project.name}" was declined`
              : `DocsNDocs: Revision requested for your submission in "${project.name}"`);

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
    const [projects] = await pool.query(
      `SELECT id, type, documents, collaborators, assignments
       FROM projects WHERE id IN (${placeholders})`,
      ids
    );
    const counts = Object.fromEntries(rows.map(row => [row.project_id, {
      approved: Number(row.approved),
      submitted: Number(row.submitted),
    }]));
    const stats = {};
    for (const project of projects) {
      const approved = counts[project.id]?.approved ?? 0;
      const submitted = counts[project.id]?.submitted ?? 0;
      const totalSlots = projectRequirementSlots(project);
      const completionUnits = Math.min(totalSlots, approved + submitted * SUBMITTED_COMPLETION_WEIGHT);
      stats[project.id] = {
        approved,
        submitted,
        totalSlots,
        completionUnits,
        completionPercent: totalSlots > 0 ? Math.round(completionUnits / totalSlots * 100) : 0,
      };
    }
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

    if (req.user?.email) {
      const [projects] = await pool.query('SELECT user_id, collaborators FROM projects WHERE id = ?', [projectId]);
      if (projects.length === 0) return res.status(404).json({ success: false, message: 'Project not found' });
      const ownerId = await ownerIdForEmail(req.user.email);
      const isOwner = String(projects[0].user_id) === String(ownerId);
      const collaborators = parseArray(projects[0].collaborators);
      const isRequestedCollaborator = collabIndex !== undefined
        && collaborators[Number(collabIndex)]?.status !== 'inactive'
        && String(collaborators[Number(collabIndex)]?.email ?? '').toLowerCase() === String(req.user.email).toLowerCase();
      if (!isOwner && !isRequestedCollaborator) {
        return res.status(403).json({ success: false, message: 'You cannot view these submissions' });
      }
    }

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

exports.downloadSubmission = async (req, res) => {
  try {
    const ownerId = await ownerIdForEmail(req.user?.email);
    const [rows] = await pool.query(
      `SELECT s.file_name, s.file_path
       FROM submissions s
       JOIN projects p ON p.id = s.project_id
       WHERE s.id = ? AND s.project_id = ? AND p.user_id = ?`,
      [req.params.submissionId, req.params.projectId, ownerId]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Submission not found' });
    const result = await getBlobResult(rows[0].file_path);
    if (!result || result.statusCode !== 200) return res.status(404).json({ success: false, message: 'File not found' });
    res.set('Content-Type', result.blob.contentType || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${String(rows[0].file_name).replace(/["\r\n]/g, '_')}"`);
    toNodeStream(result.stream).pipe(res);
  } catch (err) {
    console.error('Download submission error:', err);
    res.status(500).json({ success: false, message: 'Could not download document' });
  }
};

exports.downloadApprovedSubmissions = async (req, res) => {
  try {
    const ownerId = await ownerIdForEmail(req.user?.email);
    const [rows] = await pool.query(
      `SELECT s.file_name, s.file_path, s.collaborator_index, s.document_index
       FROM submissions s
       JOIN projects p ON p.id = s.project_id
       WHERE s.project_id = ? AND s.status = 'approved' AND p.user_id = ?
       ORDER BY s.collaborator_index, s.document_index`,
      [req.params.projectId, ownerId]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'No approved documents found' });

    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', 'attachment; filename="approved-documents.zip"');
    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => { throw err; });
    archive.pipe(res);
    for (const row of rows) {
      const result = await getBlobResult(row.file_path);
      if (result?.statusCode === 200) {
        const safeName = String(row.file_name).replace(/[^a-zA-Z0-9._-]+/g, '-');
        archive.append(toNodeStream(result.stream), { name: `collaborator-${row.collaborator_index + 1}/${safeName}` });
      }
    }
    await archive.finalize();
  } catch (err) {
    console.error('Download approved submissions error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Could not download approved documents' });
    else res.end();
  }
};
