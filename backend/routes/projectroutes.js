const express = require('express');
const verifyJwt = require('../middleware/auth');
const requireActiveSubscription = require('../middleware/subscription');
const projectController = require('../controllers/projectcontroller');
const projectAttachmentUpload = require('../utils/projectAttachmentUpload');
const router = express.Router();
router.use(verifyJwt);

router.post('/project-attachments', projectAttachmentUpload.single('file'), projectController.uploadProjectAttachment);
router.post('/projects', projectController.createProject);
router.get('/projects', projectController.getProjects);
router.get('/projects/:id', projectController.getProject);
router.patch('/projects/:id/activate', projectController.validateActivation, requireActiveSubscription, projectController.activateProject);
router.patch('/projects/:id/cancel', projectController.cancelProject);
router.patch('/projects/:id', (req, res, next) => {
  if (req.body?.status === 'active') return requireActiveSubscription(req, res, next);
  return next();
}, projectController.updateProject);
router.delete('/projects/:id', projectController.deleteProject);

module.exports = router;
