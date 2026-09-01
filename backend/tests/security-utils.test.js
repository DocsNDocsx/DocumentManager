const crypto = require('crypto');
const { declaredAvatarType, detectedAvatarType, safeAvatarFileName } = require('../utils/avatarImage');
const { escapeHtml } = require('../utils/html');
const { generateProjectCode } = require('../utils/projectCode');

describe('security utilities', () => {
  it('accepts only matching JPG and PNG declarations', () => {
    expect(declaredAvatarType({ originalname: 'photo.jpg', mimetype: 'image/jpeg' })).toBe('image/jpeg');
    expect(declaredAvatarType({ originalname: 'photo.jpeg', mimetype: 'image/jpeg' })).toBe('image/jpeg');
    expect(declaredAvatarType({ originalname: 'photo.png', mimetype: 'image/png' })).toBe('image/png');
    expect(declaredAvatarType({ originalname: 'photo.svg', mimetype: 'image/svg+xml' })).toBeNull();
    expect(declaredAvatarType({ originalname: 'photo.png', mimetype: 'image/svg+xml' })).toBeNull();
  });

  it('detects JPG and PNG magic bytes instead of trusting metadata', () => {
    expect(detectedAvatarType(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg');
    expect(detectedAvatarType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(detectedAvatarType(Buffer.from('<svg></svg>'))).toBeNull();
  });

  it('sanitizes avatar filenames', () => {
    expect(safeAvatarFileName('../../bad\r\nname.png', 'image/png')).toBe('bad__name.png');
  });

  it('escapes HTML metacharacters in email values', () => {
    expect(escapeHtml(`<script title="x">'&'</script>`))
      .toBe('&lt;script title=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/script&gt;');
  });

  it('generates project codes with the cryptographic RNG', () => {
    const randomInt = jest.spyOn(crypto, 'randomInt');
    const random = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not be used');
    });

    const code = generateProjectCode('PRJ');

    expect(code).toMatch(/^PRJ-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(randomInt).toHaveBeenCalledTimes(8);
    randomInt.mockRestore();
    random.mockRestore();
  });
});
