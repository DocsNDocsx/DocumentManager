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
        const [projects] = await pool.query('SELECT id, status, deadline, collaborators FROM projects WHERE id = ?', [projectId]);
        if (projects.length === 0) throw new Error('Project not found');
        if (projects[0].status !== 'active' || (projects[0].deadline && new Date(projects[0].deadline) < new Date())) {
          throw new Error('Project is not accepting submissions');
        }
        const payload = JSON.parse(clientPayload ?? '{}');
        const collaborators = typeof projects[0].collaborators === 'string'
          ? JSON.parse(projects[0].collaborators) : (projects[0].collaborators ?? []);
        if (String(collaborators[payload.collabIndex]?.email ?? '').toLowerCase() !== String(req.user?.email ?? '').toLowerCase()) {
          throw new Error('Unauthorized collaborator');
        }
        if (!pathname.startsWith(`submissions/solo/${projectId}/${payload.collabIndex}/`)) throw new Error('Invalid upload path');
        return {
          allowedContentTypes: ALLOWED_UPLOAD_TYPES,
          maximumSizeInBytes: 50 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
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
