const path = require('path');

const MIME_BY_EXTENSION = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
]);

function declaredAvatarType(file) {
  const extension = path.extname(String(file?.originalname ?? '')).toLowerCase();
  const expectedMime = MIME_BY_EXTENSION.get(extension);
  const suppliedMime = String(file?.mimetype ?? '').toLowerCase();
  return expectedMime && suppliedMime === expectedMime ? expectedMime : null;
}

function detectedAvatarType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 8
      && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  return null;
}

function safeAvatarFileName(value, mimeType) {
  const fallback = mimeType === 'image/png' ? 'avatar.png' : 'avatar.jpg';
  const base = path.basename(String(value ?? fallback)).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base || fallback;
}

module.exports = {
  ALLOWED_AVATAR_MIME_TYPES: new Set(['image/jpeg', 'image/png']),
  declaredAvatarType,
  detectedAvatarType,
  safeAvatarFileName,
};
