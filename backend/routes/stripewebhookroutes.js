const express = require('express');
const stripeWebhookController = require('../controllers/stripewebhookcontroller');
const router = express.Router();

// Stripe signs the raw request body, so this route must NOT use the global JSON
// parser. It is mounted in app.js before express.json() for that reason.
// The webhook authenticates via the Stripe signature, so no JWT is applied here.
router.post(
  '/stripe/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhookController.handleWebhook
);

module.exports = router;
