const express = require('express');
const verifyJwt = require('../middleware/auth');
const projectController = require('../controllers/projectcontroller');
const router = express.Router();
router.use(verifyJwt);

router.post('/projects', projectController.createProject);
router.get('/projects', projectController.getProjects);
router.get('/projects/:id', projectController.getProject);
router.patch('/projects/:id/activate', projectController.activateProject);
router.patch('/projects/:id/cancel', projectController.cancelProject);
router.patch('/projects/:id', projectController.updateProject);
router.delete('/projects/:id', projectController.deleteProject);

module.exports = router;
