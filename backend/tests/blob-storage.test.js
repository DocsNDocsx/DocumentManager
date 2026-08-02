jest.mock('@vercel/blob', () => ({
  put: jest.fn(),
}));
jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));

const { put } = require('@vercel/blob');
const fs = require('fs/promises');
const { uploadToBlob } = require('../utils/blobStorage');

describe('blobStorage', () => {
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN;
  const originalLocalFlag = process.env.USE_LOCAL_FILE_STORAGE;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    jest.clearAllMocks();
    if (originalToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalToken;
    if (originalLocalFlag === undefined) delete process.env.USE_LOCAL_FILE_STORAGE;
    else process.env.USE_LOCAL_FILE_STORAGE = originalLocalFlag;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('fails instead of silently using ephemeral disk when production Blob configuration is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.USE_LOCAL_FILE_STORAGE;

    await expect(uploadToBlob({
      folder: 'submissions/solo/project-1',
      file: { originalname: 'file.pdf', mimetype: 'application/pdf', buffer: Buffer.from('pdf') },
    })).rejects.toThrow('BLOB_READ_WRITE_TOKEN is required in production');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('uses local public storage when Blob token is not configured', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const url = await uploadToBlob({
      folder: 'avatars',
      prefix: '123',
      file: {
        originalname: 'Profile Photo.png',
        mimetype: 'image/png',
        buffer: Buffer.from('avatar'),
      },
    });

    expect(url).toMatch(/^\/public\/uploads\/local\/avatars\/123-\d+-[a-f0-9-]+-Profile-Photo\.png$/);
    expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('public'), { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('Profile-Photo.png'), Buffer.from('avatar'));
    expect(put).not.toHaveBeenCalled();
  });

  it('can force local public storage even when Blob token exists', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test';
    process.env.USE_LOCAL_FILE_STORAGE = 'true';

    const url = await uploadToBlob({
      folder: 'project-attachments/solo',
      file: {
        originalname: 'plan.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('pdf'),
      },
    });

    expect(url).toMatch(/^\/public\/uploads\/local\/project-attachments\/solo\/\d+-[a-f0-9-]+-plan\.pdf$/);
    expect(put).not.toHaveBeenCalled();
  });

  it('uses Vercel Blob when token is configured and local storage is not forced', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test';
    delete process.env.USE_LOCAL_FILE_STORAGE;
    put.mockResolvedValueOnce({ url: 'https://blob.example.com/file.pdf' });

    const url = await uploadToBlob({
      folder: 'submissions/solo/project-1',
      file: {
        originalname: 'file.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('pdf'),
      },
    });

    expect(url).toBe('https://blob.example.com/file.pdf');
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^submissions\/solo\/project-1\/\d+-[a-f0-9-]+-file\.pdf$/),
      Buffer.from('pdf'),
      expect.objectContaining({
        access: 'public',
        contentType: 'application/pdf',
        token: 'vercel_blob_rw_test',
      }),
    );
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});
