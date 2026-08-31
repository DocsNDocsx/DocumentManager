const multer = require('multer');
const { declaredAvatarType } = require('./avatarImage');

module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!declaredAvatarType(file)) {
      return cb(new Error('Only JPG and PNG profile photos are allowed'));
    }
    cb(null, true);
  },
});
