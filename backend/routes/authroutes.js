const express = require('express');
const rateLimit = require('express-rate-limit');
const verifyJwt = require('../middleware/auth');
const authController = require('../controllers/authcontroller');
const upload = require('../utils/multer');
const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
});

// Define the login route
router.post('/auth/login', authLimiter, authController.login);
router.post('/auth/register', authLimiter, authController.register);
router.post('/auth/password/forgot', authLimiter, authController.passForgot);
router.post('/verify-otp', authLimiter, authController.verifyOtp);
router.post('/auth/password/reset', authController.updatePass);
router.put('/auth/profile', verifyJwt, authController.updateProfile);
router.get('/auth/profile/avatar/:userid', authController.getAvatar);
router.post('/auth/profile/avatar', verifyJwt, upload.single('avatar'), authController.uploadAvatar);
router.delete('/account', verifyJwt, authController.deleteAccount);
/*router.get('/get', authController.getCSV);
router.post('/update-Profile', authController.updateProfile);
router.post('/send-email', emailController.sendEmail);
router.post('/send-quote', emailController.quoteEmail);


router.post('/update-password', authController.passUpdate);
router.post('/verify-reset-token', emailController.validateResetToken);
router.get('/search-users', authController.searchUsers);*/

module.exports = router;
