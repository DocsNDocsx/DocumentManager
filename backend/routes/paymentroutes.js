const express = require('express');
const verifyJwt = require('../middleware/auth');
const paymentController = require('../controllers/paymentcontroller');
const router = express.Router();
router.use(verifyJwt);

router.get('/payment/history', paymentController.getPaymentHistory);

module.exports = router;
