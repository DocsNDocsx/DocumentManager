const express = require('express');
const verifyJwt = require('../middleware/auth');
const subscriptionController = require('../controllers/subscriptioncontroller');
const router = express.Router();
router.use(verifyJwt);

router.get('/plans', subscriptionController.getPlans);
router.get('/subscription', subscriptionController.getSubscription);
router.put('/subscription/cancel', subscriptionController.cancelSubscription);
router.put('/subscription', subscriptionController.updateSubscription);

module.exports = router;
