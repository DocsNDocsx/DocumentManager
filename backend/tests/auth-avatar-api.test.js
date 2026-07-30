const request = require('supertest');
const jwt = require('jsonwebtoken');

function loadApp() {
  jest.resetModules();

  jest.doMock('../utils/sql', () => ({
    query: jest.fn(),
    execute: jest.fn(),
    end: jest.fn(),
  }));

  return {
    app: require('../app'),
    pool: require('../utils/sql'),
  };
}

describe('POST /api/auth/profile/avatar', () => {
  afterEach(() => {
    jest.dontMock('../utils/sql');
  });

  function authHeader() {
    return `Bearer ${jwt.sign({ email: 'user@example.com' }, process.env.JWT_SECRET || 'test-secret')}`;
  }

  it('rejects avatar upload without JWT auth', async () => {
    const { app } = loadApp();

    const res = await request(app)
      .post('/api/auth/profile/avatar')
      .field('email', 'user@example.com')
      .field('userid', '123')
      .attach('avatar', Buffer.from('avatar'), {
        filename: 'avatar.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('uploads profile photo through the real multipart API route', async () => {
    const { app, pool } = loadApp();
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const avatar = Buffer.from('avatar');

    const res = await request(app)
      .post('/api/auth/profile/avatar')
      .set('Authorization', authHeader())
      .field('email', 'user@example.com')
      .field('userid', '123')
      .attach('avatar', avatar, {
        filename: 'avatar.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      avatarPath: '/api/auth/profile/avatar/123',
    });
    expect(pool.query).toHaveBeenCalledWith(
      'UPDATE users SET avatar_url = ?, avatar_data = ?, avatar_mime_type = ?, avatar_filename = ? WHERE email = ?',
      ['/api/auth/profile/avatar/123', avatar.toString('base64'), 'image/png', 'avatar.png', 'user@example.com'],
    );
  });

  it('serves profile photo bytes through the real API route', async () => {
    const { app, pool } = loadApp();
    const avatar = Buffer.from('avatar');
    pool.query.mockResolvedValueOnce([[{
      avatar_data: avatar.toString('base64'),
      avatar_mime_type: 'image/png',
      avatar_filename: 'avatar.png',
    }]]);

    const res = await request(app).get('/api/auth/profile/avatar/123');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(Buffer.from(res.body)).toEqual(avatar);
    expect(pool.query).toHaveBeenCalledWith(
      'SELECT avatar_data, avatar_mime_type, avatar_filename FROM users WHERE userid = ?',
      ['123'],
    );
  });

  it('returns 404 when profile photo is not stored', async () => {
    const { app, pool } = loadApp();
    pool.query.mockResolvedValueOnce([[]]);

    const res = await request(app).get('/api/auth/profile/avatar/123');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Avatar not found' });
  });

  it('returns 400 when authenticated avatar request has no file', async () => {
    const { app, pool } = loadApp();

    const res = await request(app)
      .post('/api/auth/profile/avatar')
      .set('Authorization', authHeader())
      .field('email', 'user@example.com')
      .field('userid', '123');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'No file uploaded' });
    expect(pool.query).not.toHaveBeenCalled();
  });
});
