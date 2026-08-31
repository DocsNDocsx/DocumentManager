const crypto = require('crypto');

const PROJECT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function securePart(length) {
  return Array.from(
    { length },
    () => PROJECT_CODE_ALPHABET[crypto.randomInt(0, PROJECT_CODE_ALPHABET.length)],
  ).join('');
}

function generateProjectCode(prefix = '') {
  const code = `${securePart(4)}-${securePart(4)}`;
  return prefix ? `${prefix}-${code}` : code;
}

module.exports = { generateProjectCode };
