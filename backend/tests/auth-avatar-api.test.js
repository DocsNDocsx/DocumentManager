const request = require('supertest');
const jwt = require('jsonwebtoken');
const { Readable } = require('stream');

const pngBytes = (suffix = 'avatar') => Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from(suffix),
]);

function loadApp() {
  jest.resetModules();

  jest.doMock('../utils/sql', () => ({
    query: jest.fn(),
    execute: jest.fn(),
    end: jest.fn(),
  }));
  jest.doMock('../utils/blobStorage', () => ({
    uploadToBlob: jest.fn().mockResolvedValue('https://blob.example.com/avatars/avatar.png'),
  }));
  jest.doMock('@vercel/blob', () => ({
    get: jest.fn(),
  }));

  return {
    app: require('../app'),
    pool: require('../utils/sql'),
    blobStorage: require('../utils/blobStorage'),
    blobClient: require('@vercel/blob'),
  };
}

describe('POST /api/auth/profile/avatar', () => {
  afterEach(() => {
    jest.dontMock('../utils/sql');
    jest.dontMock('../utils/blobStorage');
    jest.dontMock('@vercel/blob');
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
    const { app, pool, blobStorage } = loadApp();
    pool.query
      .mockResolvedValueOnce([[{ userid: '123' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const avatar = pngBytes();

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
    expect(res.body.success).toBe(true);
    expect(res.body.avatarPath).toMatch(/^\/api\/auth\/profile\/avatar\/123\?v=\d+$/);
    expect(blobStorage.uploadToBlob).toHaveBeenCalledWith({
      folder: 'avatars',
      prefix: '123',
      access: 'private',
      file: expect.objectContaining({
        originalname: 'avatar.png',
        mimetype: 'image/png',
      }),
    });
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      'UPDATE users SET avatar_url = ?, avatar_data = NULL, avatar_mime_type = ?, avatar_filename = ? WHERE userid = ?',
      ['https://blob.example.com/avatars/avatar.png', 'image/png', 'avatar.png', '123'],
    );
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('rejects SVG profile photos before storage', async () => {
    const { app, pool, blobStorage } = loadApp();

    const res = await request(app)
      .post('/api/auth/profile/avatar')
      .set('Authorization', authHeader())
      .attach('avatar', Buffer.from('<svg><script>alert(1)</script></svg>'), {
        filename: 'avatar.svg',
        contentType: 'image/svg+xml',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Only JPG and PNG profile photos are allowed');
    expect(pool.query).not.toHaveBeenCalled();
    expect(blobStorage.uploadToBlob).not.toHaveBeenCalled();
  });

  it('rejects a file whose PNG declaration does not match its content', async () => {
    const { app, pool, blobStorage } = loadApp();
    pool.query.mockResolvedValueOnce([[{ userid: '123' }]]);

    const res = await request(app)
      .post('/api/auth/profile/avatar')
      .set('Authorization', authHeader())
      .attach('avatar', Buffer.from('<svg><script>alert(1)</script></svg>'), {
        filename: 'avatar.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Profile photo content must be a valid JPG or PNG image');
    expect(blobStorage.uploadToBlob).not.toHaveBeenCalled();
  });

  it('serves profile photo bytes through the real API route', async () => {
    const { app, pool } = loadApp();
    const avatar = pngBytes();
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
      'SELECT avatar_url, avatar_data, avatar_mime_type, avatar_filename FROM users WHERE userid = ?',
      ['123'],
    );
  });

  it('does not serve legacy avatar bytes that are mislabeled as PNG', async () => {
    const { app, pool } = loadApp();
    pool.query.mockResolvedValueOnce([[
      {
        avatar_data: Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64'),
        avatar_mime_type: 'image/png',
        avatar_filename: 'avatar.png',
      },
    ]]);

    const res = await request(app).get('/api/auth/profile/avatar/123');

    expect(res.status).toBe(415);
    expect(res.body.message).toBe('Unsupported profile photo format');
  });

  it('streams a private Blob profile photo through the API URL', async () => {
    const { app, pool, blobClient } = loadApp();
    const avatar = Buffer.from('private-avatar');
    pool.query.mockResolvedValueOnce([[
      { avatar_url: 'https://store.private.blob.vercel-storage.com/avatars/avatar.png' },
    ]]);
    blobClient.get.mockResolvedValueOnce({
      blob: { contentType: 'image/png' },
      stream: Readable.from([avatar]),
    });

    const res = await request(app).get('/api/auth/profile/avatar/123');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(Buffer.from(res.body)).toEqual(avatar);
    expect(blobClient.get).toHaveBeenCalledWith(
      'https://store.private.blob.vercel-storage.com/avatars/avatar.png',
      { access: 'private', token: process.env.BLOB_READ_WRITE_TOKEN },
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
