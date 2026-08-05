const express = require('express');
const verifyJwt = require('../middleware/auth');
const submissionController = require('../controllers/submissioncontroller');
const submissionUpload = require('../utils/submissionUpload');
const pool = require('../utils/sql');
const { handleUpload } = require('@vercel/blob/client');
const router = express.Router();

const ALLOWED_UPLOAD_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'image/jpeg', 'image/png',
];

const SIZE_MULTIPLIERS = { KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
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

function uploadPolicy(document) {
  const amount = Number(document?.maxSize);
  const configuredMaximum = Number.isFinite(amount) && amount > 0
    ? amount * (SIZE_MULTIPLIERS[String(document?.sizeUnit ?? 'MB').toUpperCase()] ?? 1)
    : 50 * 1024 * 1024;
  const formats = Array.isArray(document?.fileTypes) ? document.fileTypes : [];
  const allowedContentTypes = [...new Set(formats.flatMap(format => FORMAT_MIMES[String(format).toUpperCase()] ?? []))];
  return {
    maximumSizeInBytes: Math.min(configuredMaximum, 50 * 1024 * 1024),
    allowedContentTypes: allowedContentTypes.length ? allowedContentTypes : ALLOWED_UPLOAD_TYPES,
  };
}

router.get('/submissions/stats', verifyJwt, submissionController.getSubmissionStats);
router.get('/projects/:projectId/submissions/approved/download', verifyJwt, submissionController.downloadApprovedSubmissions);
router.get('/projects/:projectId/submissions/:submissionId/download', verifyJwt, submissionController.downloadSubmission);
router.post('/projects/:projectId/submissions/upload-token', verifyJwt, async (req, res) => {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('Create submission upload token error: BLOB_READ_WRITE_TOKEN is not configured');
      return res.status(503).json({
        success: false,
        message: 'Secure file storage is temporarily unavailable. Please contact support.',
      });
    }
    const { projectId } = req.params;
    const result = await handleUpload({
      request: req,
      body: req.body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const [projects] = await pool.query('SELECT id, user_id, status, deadline, collaborators, documents FROM projects WHERE id = ?', [projectId]);
        if (projects.length === 0) throw new Error('Project not found');
        if (projects[0].status !== 'active' || (projects[0].deadline && new Date(projects[0].deadline) < new Date())) {
          throw new Error('Project is not accepting submissions');
        }
        const payload = JSON.parse(clientPayload ?? '{}');
        const collabIndex = Number(payload.collabIndex);
        const docIndex = Number(payload.docIndex);
        const collaborators = parseArray(projects[0].collaborators);
        const documents = parseArray(projects[0].documents);
        if (!Number.isInteger(collabIndex) || !collaborators[collabIndex]) throw new Error('Invalid collaborator');
        if (!Number.isInteger(docIndex) || !documents[docIndex]) throw new Error('Invalid document');
        const isCollaborator = String(collaborators[collabIndex]?.email ?? '').toLowerCase() === String(req.user?.email ?? '').toLowerCase();
        const [users] = isCollaborator ? [[]] : await pool.query('SELECT userid FROM users WHERE email = ?', [req.user?.email]);
        const isOwner = users[0]?.userid != null && String(users[0].userid) === String(projects[0].user_id);
        if (!isOwner && !isCollaborator) {
          throw new Error('Unauthorized collaborator');
        }
        const expectedPrefix = `submissions/solo/${projectId}/${collabIndex}/doc-${docIndex}-`;
        if (!pathname.startsWith(expectedPrefix) || pathname.slice(expectedPrefix.length).includes('/')) {
          throw new Error('Invalid upload path');
        }
        const policy = uploadPolicy(documents[docIndex]);
        return {
          ...policy,
          addRandomSuffix: true,
        };
      },
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    res.json(result);
  } catch (err) {
    console.error('Create submission upload token error:', err);
    const message = String(err?.message ?? 'Could not start upload');
    if (message === 'Unauthorized collaborator') {
      return res.status(403).json({ success: false, message: 'You are not authorized to upload for this collaborator.' });
    }
    if (message === 'Project not found') {
      return res.status(404).json({ success: false, message });
    }
    if (message === 'Project is not accepting submissions') {
      return res.status(409).json({ success: false, message });
    }
    if (message === 'Invalid collaborator' || message === 'Invalid document' || message === 'Invalid upload path') {
      return res.status(400).json({ success: false, message });
    }
    if (/token|blob|store/i.test(message)) {
      return res.status(503).json({ success: false, message: 'Secure file storage is temporarily unavailable. Please contact support.' });
    }
    res.status(400).json({ success: false, message });
  }
});
router.post('/projects/:projectId/submissions', verifyJwt, submissionUpload.single('file'), submissionController.createSubmission);
router.patch('/projects/:projectId/submissions/:submissionId', verifyJwt, submissionController.updateSubmission);
router.get('/projects/:projectId/submissions', verifyJwt, submissionController.getSubmissions);

module.exports = router;
