const { put } = require('@vercel/blob');
const { randomUUID } = require('crypto');
const fs = require('fs/promises');
const path = require('path');

function safeFileName(fileName = 'file') {
  const ext = path.extname(fileName).toLowerCase();
  const base = path.basename(fileName, ext).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'file'}${ext}`;
}

async function uploadToBlob({ folder, file, prefix }) {
  if (!file?.buffer) {
    throw new Error('File buffer is required for Blob upload');
  }

  const pathname = [
    folder,
    `${prefix ? `${prefix}-` : ''}${Date.now()}-${randomUUID()}-${safeFileName(file.originalname)}`,
  ].filter(Boolean).join('/');

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || process.env.USE_LOCAL_FILE_STORAGE === 'true') {
    return uploadToLocalPublic(pathname, file.buffer);
  }

  const blob = await put(pathname, file.buffer, {
    access: 'public',
    contentType: file.mimetype,
    token,
  });

  return blob.url;
}

async function uploadToLocalPublic(pathname, buffer) {
  const normalizedPath = pathname.replace(/\\/g, '/').split('/').filter(Boolean);
  const localPath = path.join(__dirname, '..', 'public', 'uploads', 'local', ...normalizedPath);
  const publicPath = `/public/uploads/local/${normalizedPath.join('/')}`;

  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, buffer);

  return publicPath;
}

module.exports = {
  safeFileName,
  uploadToBlob,
  uploadToLocalPublic,
};
