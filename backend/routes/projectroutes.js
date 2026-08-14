const express = require('express');
const verifyJwt = require('../middleware/auth');
const requireActiveSubscription = require('../middleware/subscription');
const projectController = require('../controllers/projectcontroller');
const projectAttachmentUpload = require('../utils/projectAttachmentUpload');
const { handleUpload } = require('@vercel/blob/client');
const path = require('path');
const router = express.Router();
router.use(verifyJwt);

const attachmentExtensions = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.jpg', '.jpeg', '.png', '.gif', '.zip', '.rar',
]);

router.post('/project-attachments/upload-token', async (req, res) => {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(503).json({ success: false, message: 'File uploads are temporarily unavailable. Please try again later.' });
    }
    const result = await handleUpload({
      request: req,
      body: req.body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { scope } = JSON.parse(clientPayload ?? '{}');
        if (scope !== 'solo' && scope !== 'team') throw new Error('Invalid upload scope');
        const expectedPrefix = `project-attachments/${scope}/`;
        const fileName = pathname.slice(expectedPrefix.length);
        if (!pathname.startsWith(expectedPrefix) || !fileName || fileName.includes('/')) {
          throw new Error('Invalid upload path');
        }
        if (!attachmentExtensions.has(path.extname(fileName).toLowerCase())) {
          throw new Error('File type not allowed');
        }
        return {
          maximumSizeInBytes: 50 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    res.json(result);
  } catch (err) {
    console.error('Create project attachment upload token error:', err);
    const message = String(err?.message ?? 'Could not start upload');
    if (message === 'Invalid upload scope' || message === 'Invalid upload path' || message === 'File type not allowed') {
      return res.status(400).json({ success: false, message });
    }
    return res.status(503).json({ success: false, message: 'File uploads are temporarily unavailable. Please try again later.' });
  }
});

router.post('/project-attachments', projectAttachmentUpload.single('file'), projectController.uploadProjectAttachment);
router.post('/projects', projectController.createProject);
router.get('/projects', projectController.getProjects);
router.get('/projects/:id', projectController.getProject);
router.patch('/projects/:id/activate', projectController.validateActivation, requireActiveSubscription, projectController.activateProject);
router.patch('/projects/:id/cancel', projectController.cancelProject);
router.post('/projects/:id/discard-pending-upgrade', projectController.discardPendingUpgrade);
router.patch('/projects/:id', (req, res, next) => {
  if (req.body?.status === 'active') return requireActiveSubscription(req, res, next);
  return next();
}, projectController.updateProject);
router.delete('/projects/:id', projectController.deleteProject);

module.exports = router;
