const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { insertUser } = require('../utils/createUser');
const { loginUser } = require('../utils/loginUser');
const { sendEmail } = require('../utils/emailservice');

const pool = require('../utils/sql');

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateOtp() {
  return crypto.randomInt(100000, 1000000);
}

async function storeOtp(email, otp) {
  await pool.query('DELETE FROM otp_store WHERE email = ?', [email]);
  await pool.query('INSERT INTO otp_store (email, otp, expires_at) VALUES (?, ?, ?)',
    [email, otp, new Date(Date.now() + OTP_TTL_MS)]);
}

async function getAndDeleteOtp(email) {
  const [rows] = await pool.query('SELECT otp, expires_at FROM otp_store WHERE email = ?', [email]);
  await pool.query('DELETE FROM otp_store WHERE email = ?', [email]);
  return rows[0] ?? null;
}

async function storeResetToken(tokenHash, email, expiresAt) {
  await pool.query('INSERT INTO reset_tokens (token_hash, email, expires_at) VALUES (?, ?, ?)',
    [tokenHash, email, new Date(expiresAt)]);
}

async function getResetToken(tokenHash) {
  const [rows] = await pool.query(
    'SELECT email, expires_at, used FROM reset_tokens WHERE token_hash = ?', [tokenHash]);
  return rows[0] ?? null;
}

async function markTokenUsed(tokenHash) {
  await pool.query('UPDATE reset_tokens SET used = ? WHERE token_hash = ?', [true, tokenHash]);
}

exports.login = async (req, res) => {
  const { email, password } = req.body;

  const result = await loginUser(email, password);

  if (!result.success) {
    return res.status(401).json(result);
  }

  const token = jwt.sign(
    { email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRATION || '1h' }
  );

  res.json({ token, userid: result.user.id, firstname: result.user.firstname, lastname: result.user.lastname, email: result.user.email, avatarPath: result.user.avatarUrl });
};

exports.register = async (req, res) => {
  const { email, password, firstname, lastname, designation, organization } = req.body;
  try {
    const userId = Math.floor(Date.now() / 1000);
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      userId,
      firstname,
      lastname,
      email,
      password: hashedPassword,
      designation,
      organization,
    };
    const result = await insertUser(user);

    if (!result.inserted) {
      return res.status(409).json({ success: false, message: result.message ?? 'Email already exists' });
    }

    const otp = generateOtp();
    await storeOtp(email, otp);

    // Send welcome email — non-blocking, don't fail registration if it errors
    try {
      const templatePath = path.join(__dirname, '../templates-email/registeruser.html');
      const body = fs.readFileSync(templatePath, 'utf8').replace('{{BASE_URL}}', process.env.APP_BASE_URL ?? '');
      await sendEmail(email, 'DocsNDocs: Account Creation', body);
    } catch (emailErr) {
      console.error('[email] Welcome email failed (non-fatal):', emailErr);
    }

    res.json({ success: true, message: 'User created', insertId: result.insertId });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.passForgot = async (req, res) => {
  try {
    const toEmail = req.body.email;
    const otp = generateOtp();
    await storeOtp(toEmail, otp);
    const subject = 'Your OTP Code for DocsNDocs';
    const templatePath = path.join(__dirname, '../templates-email/forgotpassword.html');
    const body = fs.readFileSync(templatePath, 'utf8').replace('{{BASE_URL}}', process.env.APP_BASE_URL ?? '').replace('{{OTP}}', otp);
    await sendEmail(toEmail, subject, body);
    res.status(200).json({ success: true, message: 'OTP Email Sent' });
  } catch (err) {
    console.error('[email] passForgot error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.verifyOtp = async (req, res) => {
  const to = req.headers['x-user-email'];
  const otp = req.headers['x-user-otp'];

  const record = await getAndDeleteOtp(to);
  if (!record || new Date(record.expires_at) < new Date()) {
    return res.status(400).json({ valid: false, message: 'OTP expired or not found' });
  }
  if (String(record.otp) !== String(otp)) {
    return res.status(400).json({ valid: false, message: 'Invalid OTP' });
  }

  const token = crypto.randomBytes(64).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = Date.now() + 15 * 60 * 1000;
  await storeResetToken(tokenHash, to, expiresAt);

  try {
    const [rows] = await pool.execute('SELECT userid, firstname, lastname, email FROM users WHERE email = ?', [to]);
    if (rows.length > 0) {
      const user = rows[0];
      const jwt_token = jwt.sign(
        { email: to },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRATION || '1h' }
      );
      return res.status(200).json({
        valid: true,
        message: 'User verified successfully!',
        token,
        jwt: jwt_token,
        userid: user.userid,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
      });
    }
  } catch (dbErr) {
    console.error('verifyOtp user lookup failed (non-fatal):', dbErr.message);
  }

  return res.status(200).json({ valid: true, message: 'User verified successfully!', token });
};

exports.uploadAvatar = async (req, res) => {
  try {
    const { email, userid } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const avatarPath = `/public/avatars/${userid}/${req.file.originalname}`;


    await pool.query('UPDATE users SET avatar_url = ? WHERE email = ?', [avatarPath, email]);

    res.json({ success: true, avatarPath });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { email, firstname, lastname, phone, timezone, notifPref, currentPw, newPw } = req.body;

    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });


    const [rows] = await pool.query('SELECT password FROM users WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    if (newPw) {
      if (!currentPw) return res.status(400).json({ success: false, message: 'Current password is required' });
      const isMatch = await bcrypt.compare(currentPw, rows[0].password);
      if (!isMatch) return res.status(400).json({ success: false, message: 'Current password is incorrect' });

      const hashedPassword = await bcrypt.hash(newPw, 10);
      await pool.query(
        'UPDATE users SET firstname = ?, lastname = ?, phone = ?, timezone = ?, notif_pref = ?, password = ? WHERE email = ?',
        [firstname, lastname, phone, timezone, notifPref, hashedPassword, email]
      );
    } else {
      await pool.query(
        'UPDATE users SET firstname = ?, lastname = ?, phone = ?, timezone = ?, notif_pref = ? WHERE email = ?',
        [firstname, lastname, phone, timezone, notifPref, email]
      );
    }

    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const { userid } = req.body;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });


    const [activeSubs] = await pool.query(
      "SELECT id FROM subscriptions WHERE userid = ? AND status = 'active'",
      [userid]
    );
    if (activeSubs.length > 0) {
      return res.status(400).json({ success: false, message: 'Cancel all active subscriptions before deleting account' });
    }

    await pool.query('DELETE FROM users WHERE userid = ?', [userid]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updatePass = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const record = await getResetToken(tokenHash);
    if (!record) return res.status(400).json({ valid: false, reason: 'Invalid token' });
    if (new Date(record.expires_at) < new Date()) return res.status(400).json({ valid: false, reason: 'Token expired' });
    if (record.used == true || record.used === 1) return res.status(400).json({ valid: false, reason: 'Token already used' });
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, record.email]);
    await markTokenUsed(tokenHash);

    // Send password changed confirmation — non-blocking
    try {
      const templatePath = path.join(__dirname, '../templates-email/passwordchanged.html');
      const body = fs.readFileSync(templatePath, 'utf8')
        .replace('{{BASE_URL}}', process.env.APP_BASE_URL ?? '');
      await sendEmail(record.email, 'DocsNDocs: Your password has been changed', body);
    } catch (emailErr) {
      console.error('[email] Password changed email failed (non-fatal):', emailErr);
    }

    res.json({ valid: true });
  } catch (err) {
    console.error('updatePass error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
