const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date as YYYY-MM-DD (server-local). */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// GET /api/bookings/availability?turf_id=&date= — hourly slot map for a day.
router.get('/availability', (req, res) => {
  const { turf_id, date } = req.query;
  if (!DATE_RE.test(date || '')) return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) required' });

  const turf = db.prepare('SELECT * FROM turfs WHERE id = ?').get(turf_id);
  if (!turf) return res.status(404).json({ error: 'Turf not found' });

  const rows = db
    .prepare(`SELECT start_hour, end_hour FROM bookings
              WHERE turf_id = ? AND date = ? AND status = 'confirmed'`)
    .all(turf.id, date);

  const booked = new Set();
  for (const r of rows) for (let h = r.start_hour; h < r.end_hour; h++) booked.add(h);

  const isToday = date === today();
  const currentHour = new Date().getHours();

  const slots = [];
  for (let h = turf.open_hour; h < turf.close_hour; h++) {
    slots.push({
      hour: h,
      available: !booked.has(h) && !(isToday && h <= currentHour),
    });
  }
  res.json({ date, price_per_hour: turf.price_per_hour, slots });
});

// POST /api/bookings — book a contiguous block of hourly slots.
router.post('/', requireAuth, (req, res) => {
  const { turf_id, date, hours } = req.body || {};
  if (!DATE_RE.test(date || '')) return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) required' });
  if (!Array.isArray(hours) || hours.length === 0)
    return res.status(400).json({ error: 'Select at least one time slot' });

  const turf = db.prepare('SELECT * FROM turfs WHERE id = ?').get(turf_id);
  if (!turf) return res.status(404).json({ error: 'Turf not found' });

  if (date < today()) return res.status(400).json({ error: 'Cannot book a past date' });

  const sorted = [...new Set(hours.map(Number))].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1)
      return res.status(400).json({ error: 'Selected slots must be consecutive hours' });
  }
  const startHour = sorted[0];
  const endHour = sorted[sorted.length - 1] + 1;
  if (startHour < turf.open_hour || endHour > turf.close_hour)
    return res.status(400).json({ error: 'Selected slots are outside opening hours' });
  if (date === today() && startHour <= new Date().getHours())
    return res.status(400).json({ error: 'That time has already passed today' });

  // Overlap check + insert inside a transaction to prevent double booking.
  db.exec('BEGIN IMMEDIATE');
  try {
    const clash = db
      .prepare(`SELECT id FROM bookings
                WHERE turf_id = ? AND date = ? AND status = 'confirmed'
                  AND start_hour < ? AND end_hour > ? LIMIT 1`)
      .get(turf.id, date, endHour, startHour);
    if (clash) {
      db.exec('ROLLBACK');
      return res.status(409).json({ error: 'One or more selected slots were just booked by someone else' });
    }

    const totalPrice = (endHour - startHour) * turf.price_per_hour;
    const result = db
      .prepare(`INSERT INTO bookings (turf_id, user_id, date, start_hour, end_hour, total_price)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run(turf.id, req.user.id, date, startHour, endHour, totalPrice);
    db.exec('COMMIT');

    res.status(201).json({
      booking: {
        id: Number(result.lastInsertRowid),
        turf_id: turf.id,
        turf_name: turf.name,
        date,
        start_hour: startHour,
        end_hour: endHour,
        total_price: totalPrice,
        status: 'confirmed',
      },
    });
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
});

// GET /api/bookings/mine — the logged-in user's bookings.
router.get('/mine', requireAuth, (req, res) => {
  const rows = db
    .prepare(`SELECT b.*, t.name AS turf_name, t.city, t.address, t.sport,
                     (SELECT url FROM turf_photos p WHERE p.turf_id = t.id ORDER BY p.id LIMIT 1) AS cover_photo
              FROM bookings b JOIN turfs t ON t.id = b.turf_id
              WHERE b.user_id = ?
              ORDER BY b.date DESC, b.start_hour DESC`)
    .all(req.user.id);
  res.json({ bookings: rows });
});

// GET /api/bookings/for-my-turfs — bookings received on turfs the user owns.
router.get('/for-my-turfs', requireAuth, (req, res) => {
  const rows = db
    .prepare(`SELECT b.*, t.name AS turf_name, u.name AS player_name, u.email AS player_email, u.phone AS player_phone
              FROM bookings b
              JOIN turfs t ON t.id = b.turf_id
              JOIN users u ON u.id = b.user_id
              WHERE t.owner_id = ?
              ORDER BY b.date DESC, b.start_hour DESC`)
    .all(req.user.id);
  res.json({ bookings: rows });
});

// DELETE /api/bookings/:id — cancel own upcoming booking.
router.delete('/:id', requireAuth, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking || booking.user_id !== req.user.id)
    return res.status(404).json({ error: 'Booking not found' });
  if (booking.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled' });
  if (booking.date < today())
    return res.status(400).json({ error: 'Past bookings cannot be cancelled' });

  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(booking.id);
  res.json({ message: 'Booking cancelled' });
});

module.exports = router;
