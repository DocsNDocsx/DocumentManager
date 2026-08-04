const express = require('express');
const verifyJwt = require('../middleware/auth');
const requireActiveSubscription = require('../middleware/subscription');
const teamController = require('../controllers/teamcontroller');
const teamSubmissionController = require('../controllers/teamsubmissioncontroller');
const teamSubmissionUpload = require('../utils/teamSubmissionUpload');
const router = express.Router();

// Public routes — external collaborators access without login
router.post('/teams/projects/join', verifyJwt, teamController.joinProject);
router.get('/teams/projects/:id/upload-info/:collaboratorId', verifyJwt, teamSubmissionController.getUploadInfo);
router.post('/teams/projects/:id/submissions', verifyJwt, teamSubmissionUpload.single('file'), teamSubmissionController.createSubmission);

router.use(verifyJwt);

router.get('/teams', teamController.getTeams);
// Project routes MUST come before /teams/:id so Express doesn't treat "projects" as a team id.
router.get('/teams/projects/stats', teamController.getTeamProjectStats);
router.get('/teams/projects', teamController.getTeamProjects);
router.get('/teams/projects/:id', teamController.getTeamProject);
router.post('/teams/projects', teamController.createTeamProject);
router.patch('/teams/projects/:id', (req, res, next) => {
  if (req.body?.status === 'active') {
    return teamController.validateActivation(req, res, () => requireActiveSubscription(req, res, next));
  }
  return next();
}, teamController.updateTeamProject);
router.post('/teams/projects/:id/discard-pending-upgrade', teamController.discardPendingUpgrade);
router.get('/teams/projects/:id/collaborators', teamController.getProjectCollaborators);
router.post('/teams/projects/:id/collaborators', teamController.saveProjectCollaborators);
router.post('/teams/projects/:id/documents', teamController.saveProjectDocuments);
router.get('/teams/projects/:id/submissions', teamSubmissionController.getSubmissions);
router.patch('/teams/projects/:id/submissions/:submissionId', teamSubmissionController.updateSubmission);
router.delete('/teams/projects/:id', teamController.deleteTeamProject);
router.get('/teams/:id', teamController.getTeam);
router.post('/teams', teamController.createTeam);
router.put('/teams/:id', teamController.updateTeam);
router.delete('/teams/:id', teamController.deleteTeam);

module.exports = router;
