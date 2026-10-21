// Image uploads (ARCHITECTURE.md §6.8, BR-18). Files go to UPLOAD_DIR/YYYY/MM/<random>.<ext> and
// are served at /uploads/YYYY/MM/<random>.<ext>.
//
//   router.post('/compose', uploads.images({ field: 'images', max: 6 }), handler)
//   req.files       [{ publicPath, mimetype, size }]   ([] when none were chosen)
//   req.uploadError set when a file is refused; then nothing is kept and req.files is []
//   uploads.remove(paths)   delete files again by their public paths
//
// A multipart body is parsed here, after the global CSRF check, so a multipart form sends its
// token in the action URL: <form method="post" enctype="multipart/form-data"
// action="<%= csrfUrl('/compose') %>">. Put the file input last in the form: when a file is
// refused, the fields before it have already been read, so the handler can show the draft again.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('./config');

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// The first bytes of each format, so a renamed file of another type is refused too.
const MAGIC = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) =>
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/gif': (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')),
  'image/webp': (b) =>
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
};

const message = (max) =>
  max === 1
    ? 'One image only: JPEG, PNG, WebP or GIF, at most 5 MB.'
    : `Up to ${max} images, JPEG, PNG, WebP or GIF, 5 MB each.`;

class Refused extends Error {}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const now = new Date();
    const sub = path.join(
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
    );
    const dir = path.join(config.uploadDir, sub);
    fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
  },
  filename(req, file, cb) {
    cb(null, `${crypto.randomBytes(8).toString('hex')}.${TYPES[file.mimetype]}`);
  },
});

function publicPathOf(file) {
  const rel = path.relative(config.uploadDir, file.path).split(path.sep).join('/');
  return `/uploads/${rel}`;
}

function startsLike(file) {
  const fd = fs.openSync(file.path, 'r');
  try {
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    return MAGIC[file.mimetype](head);
  } finally {
    fs.closeSync(fd);
  }
}

function images({ field = 'images', max = 6 } = {}) {
  const upload = multer({
    storage,
    limits: { fileSize: MAX_BYTES, files: max, fields: 50, fieldSize: 1024 * 1024 },
    fileFilter(req, file, cb) {
      cb(TYPES[file.mimetype] ? null : new Refused('type'), Boolean(TYPES[file.mimetype]));
    },
  }).array(field, max);

  return (req, res, next) => {
    let settled = false;
    upload(req, res, (err) => {
      // An upload has one outcome; a late stream callback must not advance the router again.
      if (settled) return;
      settled = true;
      const saved = Array.isArray(req.files) ? req.files : [];
      const refuse = () => {
        removeFiles(saved.map((f) => f.path));
        req.files = [];
        req.uploadError = message(max);
        next();
      };
      if (err) {
        // Too many files, too large, wrong field or a refused type: the user's mistake, not a crash.
        if (err instanceof Refused || err instanceof multer.MulterError) return refuse();
        removeFiles(saved.map((f) => f.path));
        return next(err);
      }
      try {
        if (!saved.every(startsLike)) return refuse();
      } catch (e) {
        return next(e);
      }
      req.files = saved.map((f) => ({
        publicPath: publicPathOf(f),
        mimetype: f.mimetype,
        size: f.size,
      }));
      next();
    });
  };
}

// Synchronous, so a test (or the next request) never sees a file that is about to go.
function removeFiles(paths) {
  for (const p of paths) {
    if (typeof p === 'string') fs.rmSync(p, { force: true });
  }
}

// Delete uploaded files by public path (/uploads/...); anything else is ignored.
function remove(paths) {
  const root = path.resolve(config.uploadDir);
  const files = [];
  for (const p of [].concat(paths || [])) {
    if (typeof p !== 'string' || !p.startsWith('/uploads/')) continue;
    const full = path.resolve(root, '.' + p.slice('/uploads'.length));
    if (full.startsWith(root + path.sep)) files.push(full);
  }
  removeFiles(files);
}

module.exports = { images, remove, message, MAX_BYTES, TYPES };
