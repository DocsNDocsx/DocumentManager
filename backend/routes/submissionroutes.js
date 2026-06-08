const express = require('express');
const verifyJwt = require('../middleware/auth');
const submissionController = require('../controllers/submissioncontroller');
const submissionUpload = require('../utils/submissionUpload');
const router = express.Router();

router.get('/submissions/stats', verifyJwt, submissionController.getSubmissionStats);
router.post('/projects/:projectId/submissions', submissionUpload.single('file'), submissionController.createSubmission); // public — external collaborators
router.patch('/projects/:projectId/submissions/:submissionId', verifyJwt, submissionController.updateSubmission);
router.get('/projects/:projectId/submissions', verifyJwt, submissionController.getSubmissions);

module.exports = router;
