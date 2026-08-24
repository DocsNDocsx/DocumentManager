const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { get } = require('@vercel/blob');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');
const { insertUser } = require('../utils/createUser');
const { loginUser } = require('../utils/loginUser');
const { sendEmail } = require('../utils/emailservice');
const { uploadToBlob } = require('../utils/blobStorage');

const pool = require('../utils/sql');

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LOGIN_OTP_ATTEMPTS = 5;

function generateOtp() {
  return crypto.randomInt(100000, 1000000);
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hashLoginOtp(challengeId, otp) {
  return hashValue(`${challengeId}:${otp}:${process.env.JWT_SECRET}`);
}

function requestAudit(req) {
  return {
    ip: String(req.ip ?? req.socket?.remoteAddress ?? '').slice(0, 64),
    userAgent: String(req.get?.('user-agent') ?? '').slice(0, 500),
  };
}

function issueLoginToken(email) {
  return jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRATION || '1h' });
}

function loginPayload(user, extra = {}) {
  return {
    token: issueLoginToken(user.email),
    userid: user.id ?? user.userid,
    firstname: user.firstname,
    lastname: user.lastname,
    email: user.email,
    avatarPath: user.avatarUrl ?? (user.avatar_url ? `/api/auth/profile/avatar/${user.userid}` : ''),
    timezone: user.timezone ?? 'UTC-5',
    ...extra,
  };
}

async function sendLoginPasscode(email, otp) {
  const templatePath = path.join(__dirname, '../templates-email/loginpasscode.html');
  const baseUrl = (process.env.APP_BASE_URL || 'https://www.docsndocs.com').replace(/\/$/, '');
  const body = fs.readFileSync(templatePath, 'utf8')
    .replace('{{OTP}}', otp)
    .replaceAll('{{BASE_URL}}', baseUrl);
  await sendEmail(email, 'DocsNDocs: Confirm your new device sign-in', body);
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

// Pending registrations: a signup is held here (with its OTP) until the email is
// verified. Only then is the real users row created, so an unverified account
// never exists in the users table.
async function storePendingRegistration(user, otp) {
  await pool.query('DELETE FROM pending_registrations WHERE expires_at < ?', [new Date()]);
  await pool.query('DELETE FROM pending_registrations WHERE email = ?', [user.email]);
  await pool.query(
    `INSERT INTO pending_registrations
       (email, firstname, lastname, password, designation, organization, otp, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.email, user.firstname ?? null, user.lastname ?? null, user.password,
     user.designation ?? null, user.organization ?? null, otp, new Date(Date.now() + OTP_TTL_MS)]
  );
}

async function getPendingRegistration(email) {
  const [rows] = await pool.query('SELECT * FROM pending_registrations WHERE email = ?', [email]);
  return rows[0] ?? null;
}

async function deletePendingRegistration(email) {
  await pool.query('DELETE FROM pending_registrations WHERE email = ?', [email]);
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
  const { email, password, deviceToken } = req.body;

  const result = await loginUser(email, password);

  if (!result.success) {
    return res.status(401).json(result);
  }

  const audit = requestAudit(req);
  if (deviceToken) {
    const tokenHash = hashValue(deviceToken);
    const [devices] = await pool.query(
      'SELECT token_hash FROM trusted_devices WHERE token_hash = ? AND user_id = ? AND expires_at > ?',
      [tokenHash, result.user.id, new Date()]
    );
    if (devices.length > 0) {
      await pool.query('UPDATE trusted_devices SET last_used_at = ?, last_ip = ? WHERE token_hash = ?',
        [new Date(), audit.ip, tokenHash]);
      return res.json(loginPayload(result.user));
    }
  }

  const challengeId = crypto.randomUUID();
  const otp = generateOtp();
  await pool.query('DELETE FROM login_challenges WHERE email = ? OR expires_at < ?', [result.user.email, new Date()]);
  await pool.query(
    'INSERT INTO login_challenges (id, user_id, email, otp_hash, expires_at, attempts) VALUES (?, ?, ?, ?, ?, ?)',
    [challengeId, result.user.id, result.user.email, hashLoginOtp(challengeId, otp), new Date(Date.now() + OTP_TTL_MS), 0]
  );
  try {
    await sendLoginPasscode(result.user.email, otp);
  } catch (err) {
    await pool.query('DELETE FROM login_challenges WHERE id = ?', [challengeId]);
    console.error('[email] login passcode error:', err);
    return res.status(503).json({ success: false, message: 'We could not send a sign-in code. Please try again.' });
  }
  return res.status(202).json({ requiresPasscode: true, challengeId, email: result.user.email });
};

exports.verifyLoginPasscode = async (req, res) => {
  const { challengeId, passcode } = req.body ?? {};
  const [rows] = await pool.query('SELECT * FROM login_challenges WHERE id = ?', [challengeId]);
  const challenge = rows[0];
  if (!challenge || new Date(challenge.expires_at) < new Date() || challenge.attempts >= MAX_LOGIN_OTP_ATTEMPTS) {
    if (challenge) await pool.query('DELETE FROM login_challenges WHERE id = ?', [challengeId]);
    return res.status(400).json({ success: false, message: 'This sign-in code has expired. Please sign in again.' });
  }
  if (hashLoginOtp(challengeId, passcode) !== challenge.otp_hash) {
    await pool.query('UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ?', [challengeId]);
    return res.status(400).json({ success: false, message: 'Invalid passcode.' });
  }

  const [users] = await pool.query('SELECT * FROM users WHERE userid = ?', [challenge.user_id]);
  if (users.length === 0) return res.status(401).json({ success: false, message: 'Account not found.' });
  const rawDeviceToken = crypto.randomBytes(32).toString('base64url');
  const audit = requestAudit(req);
  await pool.query('DELETE FROM login_challenges WHERE id = ?', [challengeId]);
  await pool.query(
    'INSERT INTO trusted_devices (token_hash, user_id, expires_at, first_ip, last_ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
    [hashValue(rawDeviceToken), challenge.user_id, new Date(Date.now() + TRUSTED_DEVICE_TTL_MS), audit.ip, audit.ip, audit.userAgent]
  );
  return res.json(loginPayload(users[0], { deviceToken: rawDeviceToken }));
};

exports.resendLoginPasscode = async (req, res) => {
  const { challengeId } = req.body ?? {};
  const [rows] = await pool.query('SELECT id, email FROM login_challenges WHERE id = ?', [challengeId]);
  const challenge = rows[0];
  if (!challenge) return res.status(400).json({ success: false, message: 'Please sign in again.' });
  const otp = generateOtp();
  await pool.query('UPDATE login_challenges SET otp_hash = ?, expires_at = ?, attempts = 0 WHERE id = ?',
    [hashLoginOtp(challengeId, otp), new Date(Date.now() + OTP_TTL_MS), challengeId]);
  await sendLoginPasscode(challenge.email, otp);
  return res.json({ success: true, message: 'A new sign-in code was sent.' });
};

exports.register = async (req, res) => {
  const { email, password, firstname, lastname, designation, organization } = req.body;
  try {
    // A real (verified) account already exists — block. Unverified signups live in
    // pending_registrations, so re-registering before verifying simply overwrites them.
    const [existing] = await pool.execute('SELECT 1 FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOtp();
    await storePendingRegistration(
      { email, firstname, lastname, password: hashedPassword, designation, organization },
      otp
    );

    // The verification code is the only way the user can complete signup, so a send
    // failure is surfaced (500) rather than leaving them on a dead passcode screen.
    const templatePath = path.join(__dirname, '../templates-email/verifyemail.html');
    const body = fs.readFileSync(templatePath, 'utf8')
      .replace('{{BASE_URL}}', process.env.APP_BASE_URL ?? '')
      .replace('{{OTP}}', otp);
    await sendEmail(email, 'Verify your DocsNDocs email', body);

    res.json({ success: true, message: 'Verification code sent' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.passForgot = async (req, res) => {
  try {
    const toEmail = req.body.email;
    const [users] = await pool.execute('SELECT 1 FROM users WHERE email = ?', [toEmail]);
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No registered account found for this email',
      });
    }

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

  // ── Signup verification: the OTP lives in pending_registrations, and a successful
  //    check is what actually creates the users row. ──
  if (req.headers['x-verify-context'] === 'signup') {
    return verifySignup(to, otp, res);
  }

  // ── Password-reset verification: OTP lives in otp_store (user already exists). ──
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

// Verifies a signup OTP and, on success, creates the real users row from the
// pending registration. The account is only ever created here.
async function verifySignup(to, otp, res) {
  const pending = await getPendingRegistration(to);
  if (!pending || new Date(pending.expires_at) < new Date()) {
    return res.status(400).json({ valid: false, message: 'OTP expired or not found' });
  }
  if (String(pending.otp) !== String(otp)) {
    return res.status(400).json({ valid: false, message: 'Invalid OTP' });
  }

  // OTP is valid — create the account now (password was already hashed at register time).
  try {
    const result = await insertUser({
      userId: Math.floor(Date.now() / 1000),
      firstname: pending.firstname,
      lastname: pending.lastname,
      email: pending.email,
      password: pending.password,
      designation: pending.designation,
      organization: pending.organization,
    });
    if (!result.inserted) {
      await deletePendingRegistration(to);
      return res.status(409).json({ valid: false, message: 'Email already exists' });
    }
  } catch (err) {
    console.error('verifySignup: user creation failed:', err);
    return res.status(500).json({ valid: false, message: 'Could not complete signup' });
  }

  await deletePendingRegistration(to);

  // Welcome email now that the account is live — non-blocking.
  try {
    const templatePath = path.join(__dirname, '../templates-email/registeruser.html');
    const body = fs.readFileSync(templatePath, 'utf8').replace('{{BASE_URL}}', process.env.APP_BASE_URL ?? '');
    await sendEmail(to, 'DocsNDocs: Account Creation', body);
  } catch (emailErr) {
    console.error('[email] Welcome email failed (non-fatal):', emailErr);
  }

  const [rows] = await pool.execute('SELECT userid, firstname, lastname, email FROM users WHERE email = ?', [to]);
  const user = rows[0] ?? {};
  const jwt_token = jwt.sign(
    { email: to },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRATION || '1h' }
  );
  return res.status(200).json({
    valid: true,
    message: 'User verified successfully!',
    token: crypto.randomBytes(64).toString('hex'),
    jwt: jwt_token,
    userid: user.userid,
    firstname: user.firstname,
    lastname: user.lastname,
    email: user.email,
  });
}

exports.uploadAvatar = async (req, res) => {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const [users] = await pool.query('SELECT userid FROM users WHERE email = ?', [email]);
    const user = users[0];
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const avatarPath = await uploadToBlob({
      folder: 'avatars',
      prefix: String(user.userid),
      file: req.file,
      access: 'private',
    });

    await pool.query(
      'UPDATE users SET avatar_url = ?, avatar_data = NULL, avatar_mime_type = ?, avatar_filename = ? WHERE userid = ?',
      [avatarPath, req.file.mimetype, req.file.originalname, user.userid]
    );

    res.json({ success: true, avatarPath: `/api/auth/profile/avatar/${user.userid}?v=${Date.now()}` });
  } catch (err) {
    console.error('Avatar upload error:', err);
    if (/BLOB_READ_WRITE_TOKEN|blob|store/i.test(String(err?.message ?? ''))) {
      return res.status(503).json({ success: false, message: 'Profile photo storage is temporarily unavailable. Please contact support.' });
    }
    res.status(500).json({ success: false, message: 'Profile photo could not be uploaded' });
  }
};

exports.getAvatar = async (req, res) => {
  try {
    const { userid } = req.params;
    const [rows] = await pool.query(
      'SELECT avatar_url, avatar_data, avatar_mime_type, avatar_filename FROM users WHERE userid = ?',
      [userid]
    );
    const avatar = rows[0];
    if (!avatar) {
      return res.status(404).json({ success: false, message: 'Avatar not found' });
    }

    if (avatar.avatar_url) {
      const result = await get(avatar.avatar_url, {
        access: 'private',
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      if (!result) return res.status(404).json({ success: false, message: 'Avatar not found' });
      res.set('Content-Type', result.blob.contentType || avatar.avatar_mime_type || 'application/octet-stream');
      res.set('Cache-Control', 'private, max-age=300');
      const stream = typeof result.stream?.pipe === 'function' ? result.stream : Readable.fromWeb(result.stream);
      return stream.pipe(res);
    }

    if (!avatar.avatar_data || !avatar.avatar_mime_type) {
      return res.status(404).json({ success: false, message: 'Avatar not found' });
    }

    const image = Buffer.from(avatar.avatar_data, 'base64');
    res.set('Content-Type', avatar.avatar_mime_type);
    res.set('Cache-Control', 'private, max-age=300');
    if (avatar.avatar_filename) {
      res.set('Content-Disposition', `inline; filename="${avatar.avatar_filename}"`);
    }
    return res.send(image);
  } catch (err) {
    console.error('Get avatar error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { email, firstname, lastname, phone, organization, timezone, addressLine1, addressLine2, city, state, postalCode, country, currentPw, newPw } = req.body;

    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
    if (req.user?.email && String(req.user.email).toLowerCase() !== String(email).toLowerCase()) {
      return res.status(403).json({ success: false, message: 'You can only update your own profile' });
    }


    const [rows] = await pool.query('SELECT password FROM users WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

    if (newPw) {
      if (!currentPw) return res.status(400).json({ success: false, message: 'Current password is required' });
      const isMatch = await bcrypt.compare(currentPw, rows[0].password);
      if (!isMatch) return res.status(400).json({ success: false, message: 'Current password is incorrect' });

      const hashedPassword = await bcrypt.hash(newPw, 10);
      await pool.query(
        'UPDATE users SET firstname = ?, lastname = ?, phone = ?, organization = ?, timezone = ?, address_line1 = ?, address_line2 = ?, city = ?, state = ?, postal_code = ?, country = ?, password = ? WHERE email = ?',
        [firstname, lastname, phone, organization, timezone, addressLine1, addressLine2, city, state, postalCode, country, hashedPassword, email]
      );
    } else {
      await pool.query(
        'UPDATE users SET firstname = ?, lastname = ?, phone = ?, organization = ?, timezone = ?, address_line1 = ?, address_line2 = ?, city = ?, state = ?, postal_code = ?, country = ? WHERE email = ?',
        [firstname, lastname, phone, organization, timezone, addressLine1, addressLine2, city, state, postalCode, country, email]
      );
    }

    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const [rows] = await pool.query(
      'SELECT userid, firstname, lastname, email, phone, organization, timezone, notif_pref, address_line1, address_line2, city, state, postal_code, country FROM users WHERE email = ?',
      [email]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const user = rows[0];
    const [ownedRows] = await pool.query(
      "SELECT COUNT(*) AS owned_count, COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active_count FROM projects WHERE user_id = ?",
      [user.userid]
    );
    const [candidateCollaborations] = await pool.query(
      "SELECT id, collaborators FROM projects WHERE user_id != ? AND status = 'active'",
      [user.userid]
    );
    const normalizedEmail = String(user.email || '').trim().toLowerCase();
    const collaboratorCount = candidateCollaborations.filter(project => {
      let collaborators = project.collaborators;
      if (typeof collaborators === 'string') {
        try { collaborators = JSON.parse(collaborators); } catch { collaborators = []; }
      }
      return Array.isArray(collaborators) && collaborators.some(collaborator =>
        collaborator?.status !== 'inactive' && (
          String(collaborator?.userId ?? '') === String(user.userid) ||
          String(collaborator?.email ?? '').trim().toLowerCase() === normalizedEmail
        )
      );
    }).length;
    const ownedCount = Number(ownedRows[0]?.active_count ?? 0);
    const hasOwnedProjects = Number(ownedRows[0]?.owned_count ?? 0) > 0;
    const memberSinceTimestamp = Number(user.userid) * 1000;
    return res.json({
      success: true,
      profile: {
        firstname: user.firstname ?? '',
        lastname: user.lastname ?? '',
        email: user.email,
        phone: user.phone ?? '',
        organization: user.organization ?? '',
        timezone: user.timezone ?? 'UTC-5',
        notifPref: user.notif_pref ?? 'daily',
        addressLine1: user.address_line1 ?? '',
        addressLine2: user.address_line2 ?? '',
        city: user.city ?? '',
        state: user.state ?? '',
        postalCode: user.postal_code ?? '',
        country: user.country ?? 'US',
        memberSince: Number.isFinite(memberSinceTimestamp) ? new Date(memberSinceTimestamp).toISOString() : '',
        activeProjectCount: ownedCount + collaboratorCount,
        accountRole: hasOwnedProjects ? 'Project Owner' : collaboratorCount > 0 ? 'Collaborator' : 'User',
      },
    });
  } catch (err) {
    console.error('Get profile error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const { userid } = req.body;
    if (!userid) return res.status(400).json({ success: false, message: 'userid is required' });


    const [activeSubs] = await pool.query(
      "SELECT id FROM stripe_subscriptions WHERE userid = ? AND status IN ('active', 'trialing')",
      [userid]
    );
    if (activeSubs.length > 0) {
      return res.status(400).json({ success: false, message: 'Cancel all active Stripe subscriptions before deleting account' });
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
