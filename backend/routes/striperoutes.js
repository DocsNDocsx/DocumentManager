const express = require('express');
const verifyJwt = require('../middleware/auth');
const stripeController = require('../controllers/stripecontroller');
const router = express.Router();
router.use(verifyJwt);

router.post('/stripe/setup-intent', stripeController.createSetupIntent);
router.post('/stripe/tax-estimate', stripeController.estimateTax);
router.post('/stripe/subscription', stripeController.createSubscription);

module.exports = router;
