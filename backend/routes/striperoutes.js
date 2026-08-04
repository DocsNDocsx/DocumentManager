const express = require('express');
const verifyJwt = require('../middleware/auth');
const stripeController = require('../controllers/stripecontroller');
const router = express.Router();
router.use(verifyJwt);

router.post('/stripe/setup-intent', stripeController.createSetupIntent);
router.get('/stripe/billing-profile', stripeController.getBillingProfile);
router.post('/stripe/tax-estimate', stripeController.estimateTax);
router.post('/stripe/subscription', stripeController.createSubscription);
router.post('/stripe/subscription/upgrade', stripeController.upgradeSubscription);

module.exports = router;
