jest.mock('../utils/sql', () => ({
  query: jest.fn(),
  execute: jest.fn(),
}));
jest.mock('../utils/createUser', () => ({
  insertUser: jest.fn(),
}));
jest.mock('../utils/loginUser', () => ({
  loginUser: jest.fn(),
}));
jest.mock('../utils/emailservice', () => ({
  sendEmail: jest.fn(),
}));
jest.mock('../utils/blobStorage', () => ({
  uploadToBlob: jest.fn(),
}));
jest.mock('fs', () => ({
  readFileSync: jest.fn(() => '<html>{{BASE_URL}} {{OTP}}</html>'),
}));

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { insertUser } = require('../utils/createUser');
const { loginUser } = require('../utils/loginUser');
const { sendEmail } = require('../utils/emailservice');
const { uploadToBlob } = require('../utils/blobStorage');
const pool = require('../utils/sql');
const authController = require('../controllers/authcontroller');

function mockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
}

describe('authcontroller dropdown/account APIs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    uploadToBlob.mockResolvedValue('https://blob.example.com/avatars/avatar.png');
  });

  it('logs in a valid user and returns token plus user details', async () => {
    loginUser.mockResolvedValueOnce({
      success: true,
      user: {
        id: 123,
        firstname: 'Mridul',
        lastname: 'Mishra',
        email: 'user@example.com',
        avatarUrl: '/api/auth/profile/avatar/123',
      },
    });
    const res = mockResponse();

    await authController.login({ body: { email: 'user@example.com', password: 'correct' } }, res);

    expect(loginUser).toHaveBeenCalledWith('user@example.com', 'correct');
    expect(res.json).toHaveBeenCalledWith({
      token: expect.any(String),
      userid: 123,
      firstname: 'Mridul',
      lastname: 'Mishra',
      email: 'user@example.com',
      avatarPath: '/api/auth/profile/avatar/123',
    });
  });

  it('returns 401 when login fails', async () => {
    loginUser.mockResolvedValueOnce({ success: false, message: 'Incorrect password' });
    const res = mockResponse();

    await authController.login({ body: { email: 'user@example.com', password: 'wrong' } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Incorrect password' });
  });

  it('blocks registration when a verified user already exists', async () => {
    pool.execute.mockResolvedValueOnce([[{ 1: 1 }]]);
    const res = mockResponse();

    await authController.register({ body: { email: 'user@example.com', password: 'secret' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Email already exists' });
  });

  it('stores a pending registration and sends signup OTP email', async () => {
    jest.spyOn(bcrypt, 'hash').mockResolvedValueOnce('hashed-password');
    jest.spyOn(crypto, 'randomInt').mockReturnValueOnce(123456);
    pool.execute.mockResolvedValueOnce([[]]);
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    sendEmail.mockResolvedValueOnce(undefined);
    const res = mockResponse();

    await authController.register({
      body: {
        email: 'new@example.com',
        password: 'secret',
        firstname: 'New',
        lastname: 'User',
        designation: 'Researcher',
        organization: 'DocsNDocs',
      },
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO pending_registrations'),
      ['new@example.com', 'New', 'User', 'hashed-password', 'Researcher', 'DocsNDocs', 123456, expect.any(Date)],
    );
    expect(sendEmail).toHaveBeenCalledWith(
      'new@example.com',
      'Verify your DocsNDocs email',
      expect.stringContaining('123456'),
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Verification code sent' });

    bcrypt.hash.mockRestore();
    crypto.randomInt.mockRestore();
  });

  it('sends forgot-password OTP email', async () => {
    jest.spyOn(crypto, 'randomInt').mockReturnValueOnce(654321);
    pool.execute.mockResolvedValueOnce([[{ 1: 1 }]]);
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    sendEmail.mockResolvedValueOnce(undefined);
    const res = mockResponse();

    await authController.passForgot({ body: { email: 'reset@example.com' } }, res);

    expect(pool.query).toHaveBeenNthCalledWith(2, 'INSERT INTO otp_store (email, otp, expires_at) VALUES (?, ?, ?)', [
      'reset@example.com',
      654321,
      expect.any(Date),
    ]);
    expect(sendEmail).toHaveBeenCalledWith(
      'reset@example.com',
      'Your OTP Code for DocsNDocs',
      expect.stringContaining('654321'),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'OTP Email Sent' });

    crypto.randomInt.mockRestore();
  });

  it('rejects forgot-password requests for an unregistered email', async () => {
    pool.execute.mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await authController.passForgot({ body: { email: 'missing@example.com' } }, res);

    expect(pool.execute).toHaveBeenCalledWith(
      'SELECT 1 FROM users WHERE email = ?',
      ['missing@example.com'],
    );
    expect(pool.query).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'No registered account found for this email',
    });
  });

  it('verifies password-reset OTP and returns reset token plus user session data', async () => {
    pool.query
      .mockResolvedValueOnce([[{ otp: '111222', expires_at: new Date(Date.now() + 60000) }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    pool.execute.mockResolvedValueOnce([[{
      userid: 123,
      firstname: 'Reset',
      lastname: 'User',
      email: 'reset@example.com',
    }]]);
    const res = mockResponse();

    await authController.verifyOtp({
      headers: {
        'x-user-email': 'reset@example.com',
        'x-user-otp': '111222',
      },
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      3,
      'INSERT INTO reset_tokens (token_hash, email, expires_at) VALUES (?, ?, ?)',
      [expect.any(String), 'reset@example.com', expect.any(Date)],
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      valid: true,
      token: expect.any(String),
      jwt: expect.any(String),
      userid: 123,
      firstname: 'Reset',
      lastname: 'User',
      email: 'reset@example.com',
    }));
  });

  it('rejects invalid password-reset OTP', async () => {
    pool.query
      .mockResolvedValueOnce([[{ otp: '111222', expires_at: new Date(Date.now() + 60000) }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockResponse();

    await authController.verifyOtp({
      headers: {
        'x-user-email': 'reset@example.com',
        'x-user-otp': '999999',
      },
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ valid: false, message: 'Invalid OTP' });
  });

  it('verifies signup OTP, creates the user, deletes pending registration, and sends welcome email', async () => {
    const pending = {
      email: 'signup@example.com',
      firstname: 'Signup',
      lastname: 'User',
      password: 'hashed-password',
      designation: 'Student',
      organization: 'University',
      otp: '222333',
      expires_at: new Date(Date.now() + 60000),
    };
    pool.query
      .mockResolvedValueOnce([[pending]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    insertUser.mockResolvedValueOnce({ inserted: true, insertId: 10 });
    sendEmail.mockResolvedValueOnce(undefined);
    pool.execute.mockResolvedValueOnce([[{
      userid: 456,
      firstname: 'Signup',
      lastname: 'User',
      email: 'signup@example.com',
    }]]);
    const res = mockResponse();

    await authController.verifyOtp({
      headers: {
        'x-user-email': 'signup@example.com',
        'x-user-otp': '222333',
        'x-verify-context': 'signup',
      },
    }, res);

    expect(insertUser).toHaveBeenCalledWith(expect.objectContaining({
      firstname: 'Signup',
      lastname: 'User',
      email: 'signup@example.com',
      password: 'hashed-password',
    }));
    expect(pool.query).toHaveBeenNthCalledWith(2, 'DELETE FROM pending_registrations WHERE email = ?', ['signup@example.com']);
    expect(sendEmail).toHaveBeenCalledWith('signup@example.com', 'DocsNDocs: Account Creation', expect.any(String));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      valid: true,
      userid: 456,
      firstname: 'Signup',
      lastname: 'User',
      email: 'signup@example.com',
    }));
  });

  it('rejects expired or missing signup OTP', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await authController.verifyOtp({
      headers: {
        'x-user-email': 'signup@example.com',
        'x-user-otp': '222333',
        'x-verify-context': 'signup',
      },
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ valid: false, message: 'OTP expired or not found' });
  });

  it('updates profile fields without changing password', async () => {
    pool.query
      .mockResolvedValueOnce([[{ password: 'hashed-current' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockResponse();

    await authController.updateProfile({
      body: {
        email: 'user@example.com',
        firstname: 'Mridul',
        lastname: 'Mishra',
        phone: '555-0100',
        organization: 'DocsNDocs',
        timezone: 'America/New_York',
        notifPref: 'email',
      },
    }, res);

    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      'UPDATE users SET firstname = ?, lastname = ?, phone = ?, organization = ?, timezone = ?, address_line1 = ?, address_line2 = ?, city = ?, state = ?, postal_code = ?, country = ? WHERE email = ?',
      ['Mridul', 'Mishra', '555-0100', 'DocsNDocs', 'America/New_York', undefined, undefined, undefined, undefined, undefined, undefined, 'user@example.com'],
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Profile updated successfully',
    });
  });

  it('requires email when updating profile', async () => {
    const res = mockResponse();

    await authController.updateProfile({ body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Email is required' });
  });

  it('requires current password when setting a new password', async () => {
    pool.query.mockResolvedValueOnce([[{ password: 'hashed-current' }]]);
    const res = mockResponse();

    await authController.updateProfile({
      body: {
        email: 'user@example.com',
        newPw: 'new-password',
      },
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Current password is required' });
  });

  it('updates password when the current password matches', async () => {
    jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true);
    jest.spyOn(bcrypt, 'hash').mockResolvedValueOnce('hashed-new-password');
    pool.query
      .mockResolvedValueOnce([[{ password: 'hashed-current' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockResponse();

    await authController.updateProfile({
      body: {
        email: 'user@example.com',
        firstname: 'Mridul',
        lastname: 'Mishra',
        phone: '',
        organization: '',
        timezone: 'UTC',
        notifPref: 'none',
        currentPw: 'current-password',
        newPw: 'new-password',
      },
    }, res);

    expect(bcrypt.compare).toHaveBeenCalledWith('current-password', 'hashed-current');
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      'UPDATE users SET firstname = ?, lastname = ?, phone = ?, organization = ?, timezone = ?, address_line1 = ?, address_line2 = ?, city = ?, state = ?, postal_code = ?, country = ?, password = ? WHERE email = ?',
      ['Mridul', 'Mishra', '', '', 'UTC', undefined, undefined, undefined, undefined, undefined, undefined, 'hashed-new-password', 'user@example.com'],
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Profile updated successfully',
    });

    bcrypt.compare.mockRestore();
    bcrypt.hash.mockRestore();
  });

  it('loads the authenticated user profile including timezone', async () => {
    pool.query
      .mockResolvedValueOnce([[{
      userid: '1780952400',
      firstname: 'Mridul', lastname: 'Mishra', email: 'user@example.com',
      phone: '555-0100', organization: 'DocsNDocs', timezone: 'UTC+1', notif_pref: 'email',
      }]])
      .mockResolvedValueOnce([[{ owned_count: '4', active_count: '2' }]])
      .mockResolvedValueOnce([[{
        id: 'collab-project',
        collaborators: [{ email: 'user@example.com', status: 'active' }],
      }]]);
    const res = mockResponse();

    await authController.getProfile({ user: { email: 'user@example.com' } }, res);

    expect(pool.query).toHaveBeenCalledWith(
      'SELECT userid, firstname, lastname, email, phone, organization, timezone, notif_pref, address_line1, address_line2, city, state, postal_code, country FROM users WHERE email = ?',
      ['user@example.com'],
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      profile: expect.objectContaining({
        timezone: 'UTC+1',
        organization: 'DocsNDocs',
        activeProjectCount: 3,
        accountRole: 'Project Owner',
        memberSince: expect.any(String),
      }),
    });
  });

  it('uploads avatar metadata for the profile API', async () => {
    pool.query
      .mockResolvedValueOnce([[{ userid: '123' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockResponse();
    const buffer = Buffer.from('avatar-bytes');

    await authController.uploadAvatar({
      user: { email: 'user@example.com' },
      body: { email: 'other@example.com', userid: '999' },
      file: { originalname: 'avatar.png', mimetype: 'image/png', buffer },
    }, res);

    expect(uploadToBlob).toHaveBeenCalledWith({
      folder: 'avatars',
      prefix: '123',
      access: 'private',
      file: { originalname: 'avatar.png', mimetype: 'image/png', buffer },
    });
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      'UPDATE users SET avatar_url = ?, avatar_data = NULL, avatar_mime_type = ?, avatar_filename = ? WHERE userid = ?',
      ['https://blob.example.com/avatars/avatar.png', 'image/png', 'avatar.png', '123'],
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      avatarPath: expect.stringMatching(/^\/api\/auth\/profile\/avatar\/123\?v=\d+$/),
    });
  });

  it('serves avatar image bytes from the database', async () => {
    const buffer = Buffer.from('avatar-bytes');
    pool.query.mockResolvedValueOnce([[{
      avatar_data: buffer.toString('base64'),
      avatar_mime_type: 'image/png',
      avatar_filename: 'avatar.png',
    }]]);
    const res = mockResponse();

    await authController.getAvatar({ params: { userid: '123' } }, res);

    expect(pool.query).toHaveBeenCalledWith(
      'SELECT avatar_url, avatar_data, avatar_mime_type, avatar_filename FROM users WHERE userid = ?',
      ['123'],
    );
    expect(res.set).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, max-age=300');
    expect(res.set).toHaveBeenCalledWith('Content-Disposition', 'inline; filename="avatar.png"');
    expect(res.send).toHaveBeenCalledWith(buffer);
  });

  it('returns 404 when avatar image bytes are missing', async () => {
    pool.query.mockResolvedValueOnce([[{ avatar_data: null, avatar_mime_type: null }]]);
    const res = mockResponse();

    await authController.getAvatar({ params: { userid: '123' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Avatar not found' });
  });

  it('requires an uploaded file for avatar updates', async () => {
    const res = mockResponse();

    await authController.uploadAvatar({ user: { email: 'user@example.com' }, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'No file uploaded' });
  });

  it('blocks account deletion when active Stripe subscriptions exist', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 'sub-row' }]]);
    const res = mockResponse();

    await authController.deleteAccount({ body: { userid: '123' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Cancel all active Stripe subscriptions before deleting account',
    });
  });

  it('deletes an account when there are no active subscriptions', async () => {
    pool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = mockResponse();

    await authController.deleteAccount({ body: { userid: '123' } }, res);

    expect(pool.query).toHaveBeenNthCalledWith(2, 'DELETE FROM users WHERE userid = ?', ['123']);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('requires userid when deleting an account', async () => {
    const res = mockResponse();

    await authController.deleteAccount({ body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'userid is required' });
  });

  it('rejects password reset when token is missing', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const res = mockResponse();

    await authController.updatePass({ body: { resetToken: 'missing-token', newPassword: 'new-password' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ valid: false, reason: 'Invalid token' });
  });

  it('rejects password reset when token is expired', async () => {
    pool.query.mockResolvedValueOnce([[{
      email: 'user@example.com',
      expires_at: new Date(Date.now() - 60000),
      used: false,
    }]]);
    const res = mockResponse();

    await authController.updatePass({ body: { resetToken: 'expired-token', newPassword: 'new-password' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ valid: false, reason: 'Token expired' });
  });

  it('rejects password reset when token was already used', async () => {
    pool.query.mockResolvedValueOnce([[{
      email: 'user@example.com',
      expires_at: new Date(Date.now() + 60000),
      used: true,
    }]]);
    const res = mockResponse();

    await authController.updatePass({ body: { resetToken: 'used-token', newPassword: 'new-password' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ valid: false, reason: 'Token already used' });
  });

  it('updates password, marks reset token used, and sends confirmation email', async () => {
    jest.spyOn(bcrypt, 'hash').mockResolvedValueOnce('hashed-new-password');
    pool.query
      .mockResolvedValueOnce([[{
        email: 'user@example.com',
        expires_at: new Date(Date.now() + 60000),
        used: false,
      }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    sendEmail.mockResolvedValueOnce(undefined);
    const res = mockResponse();

    await authController.updatePass({ body: { resetToken: 'valid-token', newPassword: 'new-password' } }, res);

    expect(pool.query).toHaveBeenNthCalledWith(2, 'UPDATE users SET password = ? WHERE email = ?', [
      'hashed-new-password',
      'user@example.com',
    ]);
    expect(pool.query).toHaveBeenNthCalledWith(3, 'UPDATE reset_tokens SET used = ? WHERE token_hash = ?', [
      true,
      expect.any(String),
    ]);
    expect(sendEmail).toHaveBeenCalledWith(
      'user@example.com',
      'DocsNDocs: Your password has been changed',
      expect.any(String),
    );
    expect(res.json).toHaveBeenCalledWith({ valid: true });

    bcrypt.hash.mockRestore();
  });
});
