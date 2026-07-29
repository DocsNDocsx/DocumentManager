const express = require('express');
const verifyJwt = require('../middleware/auth');
const dashboardController = require('../controllers/dashboardcontroller');
const router = express.Router();
router.use(verifyJwt);

router.get('/dashboard/stats', dashboardController.getDashboardStats);
router.get('/dashboard/storage', dashboardController.getStorageSummary);
router.get('/dashboard/recent-projects', dashboardController.getRecentProjects);
router.get('/dashboard/activity', dashboardController.getDashboardActivity);
router.get('/dashboard/activity/all', dashboardController.getDashboardAllActivity);

module.exports = router;
