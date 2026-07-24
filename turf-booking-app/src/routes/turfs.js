const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ALLOWED_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES[file.mimetype]) return cb(null, true);
    cb(new Error('Only JPG, PNG or WebP images are allowed'));
  },
});

const RATING_SQL = `
  (SELECT ROUND(AVG(rating), 1) FROM reviews r WHERE r.turf_id = t.id) AS rating,
  (SELECT COUNT(*) FROM reviews r WHERE r.turf_id = t.id) AS review_count,
  (SELECT url FROM turf_photos p WHERE p.turf_id = t.id ORDER BY p.id LIMIT 1) AS cover_photo
`;

function serializeTurf(row) {
  return { ...row, amenities: JSON.parse(row.amenities || '[]') };
}

// GET /api/turfs?city=&sport=&q= — browse and search.
router.get('/', (req, res) => {
  const { city = '', sport = '', q = '' } = req.query;
  const conditions = [];
  const params = [];
  if (city) { conditions.push('LOWER(t.city) = LOWER(?)'); params.push(city); }
  if (sport) { conditions.push('LOWER(t.sport) = LOWER(?)'); params.push(sport); }
  if (q) {
    conditions.push('(t.name LIKE ? OR t.city LIKE ? OR t.address LIKE ? OR t.sport LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT t.*, ${RATING_SQL} FROM turfs t ${where} ORDER BY t.created_at DESC`)
    .all(...params);
  res.json({ turfs: rows.map(serializeTurf) });
});

// GET /api/turfs/meta — distinct cities & sports for search filters.
router.get('/meta', (_req, res) => {
  const cities = db.prepare('SELECT DISTINCT city FROM turfs ORDER BY city').all().map(r => r.city);
  const sports = db.prepare('SELECT DISTINCT sport FROM turfs ORDER BY sport').all().map(r => r.sport);
  res.json({ cities, sports });
});

// GET /api/turfs/mine — turfs registered by the logged-in user.
router.get('/mine', requireAuth, (req, res) => {
  const rows = db
    .prepare(`SELECT t.*, ${RATING_SQL} FROM turfs t WHERE t.owner_id = ? ORDER BY t.created_at DESC`)
    .all(req.user.id);
  res.json({ turfs: rows.map(serializeTurf) });
});

// GET /api/turfs/:id — full details: photos, owner, reviews.
router.get('/:id', (req, res) => {
  const row = db.prepare(`SELECT t.*, ${RATING_SQL} FROM turfs t WHERE t.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Turf not found' });

  const photos = db
    .prepare('SELECT url FROM turf_photos WHERE turf_id = ? ORDER BY id')
    .all(row.id)
    .map(p => p.url);
  const owner = db.prepare('SELECT id, name FROM users WHERE id = ?').get(row.owner_id);
  const reviews = db
    .prepare(`SELECT r.rating, r.comment, r.created_at, u.name AS user_name
              FROM reviews r JOIN users u ON u.id = r.user_id
              WHERE r.turf_id = ? ORDER BY r.created_at DESC LIMIT 20`)
    .all(row.id);

  res.json({ turf: { ...serializeTurf(row), photos, owner, reviews } });
});

// POST /api/turfs — register a turf (any logged-in user). multipart/form-data with photos.
router.post('/', requireAuth, upload.array('photos', 6), (req, res) => {
  const b = req.body || {};
  const required = ['name', 'sport', 'address', 'city', 'price_per_hour'];
  for (const field of required) {
    if (!b[field] || !String(b[field]).trim())
      return res.status(400).json({ error: `Field "${field.replace(/_/g, ' ')}" is required` });
  }

  const price = Number(b.price_per_hour);
  if (!Number.isFinite(price) || price <= 0)
    return res.status(400).json({ error: 'Price per hour must be a positive number' });

  const openHour = Math.min(23, Math.max(0, parseInt(b.open_hour, 10) || 6));
  const closeHour = Math.min(24, Math.max(1, parseInt(b.close_hour, 10) || 23));
  if (openHour >= closeHour)
    return res.status(400).json({ error: 'Opening hour must be before closing hour' });

  const lat = b.lat !== undefined && b.lat !== '' ? Number(b.lat) : null;
  const lng = b.lng !== undefined && b.lng !== '' ? Number(b.lng) : null;
  if ((lat !== null && (lat < -90 || lat > 90)) || (lng !== null && (lng < -180 || lng > 180)))
    return res.status(400).json({ error: 'Latitude/longitude out of range' });

  const amenities = String(b.amenities || '')
    .split(',')
    .map(a => a.trim())
    .filter(Boolean);

  const result = db
    .prepare(`INSERT INTO turfs (owner_id, name, description, sport, address, city, lat, lng,
                                 price_per_hour, open_hour, close_hour, amenities, contact_phone)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      req.user.id, b.name.trim(), String(b.description || '').trim(), b.sport.trim(),
      b.address.trim(), b.city.trim(), lat, lng, price, openHour, closeHour,
      JSON.stringify(amenities), String(b.contact_phone || '').trim()
    );

  const turfId = Number(result.lastInsertRowid);
  const insertPhoto = db.prepare('INSERT INTO turf_photos (turf_id, url) VALUES (?, ?)');
  for (const file of req.files || []) insertPhoto.run(turfId, `/uploads/${file.filename}`);
  if (!req.files || req.files.length === 0)
    insertPhoto.run(turfId, '/img/seed/placeholder.svg');

  res.status(201).json({ id: turfId, message: 'Turf registered successfully' });
});

// POST /api/turfs/:id/reviews — one review per user per turf (replaces previous).
router.post('/:id/reviews', requireAuth, (req, res) => {
  const turf = db.prepare('SELECT id FROM turfs WHERE id = ?').get(req.params.id);
  if (!turf) return res.status(404).json({ error: 'Turf not found' });

  const rating = parseInt(req.body?.rating, 10);
  if (!(rating >= 1 && rating <= 5))
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });

  db.prepare(`INSERT INTO reviews (turf_id, user_id, rating, comment) VALUES (?, ?, ?, ?)
              ON CONFLICT (turf_id, user_id)
              DO UPDATE SET rating = excluded.rating, comment = excluded.comment,
                            created_at = datetime('now')`)
    .run(turf.id, req.user.id, rating, String(req.body?.comment || '').trim());

  res.status(201).json({ message: 'Review saved' });
});

module.exports = router;
