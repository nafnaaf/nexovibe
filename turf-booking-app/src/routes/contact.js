const express = require('express');
const db = require('../db');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/contact — send a message (about a turf, or general enquiry).
router.post('/', optionalAuth, (req, res) => {
  const { name, email, subject = '', message, turf_id = null } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'A valid email is required' });
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

  let turfId = null;
  if (turf_id) {
    const turf = db.prepare('SELECT id FROM turfs WHERE id = ?').get(turf_id);
    if (turf) turfId = turf.id;
  }

  db.prepare('INSERT INTO messages (turf_id, name, email, subject, message) VALUES (?, ?, ?, ?, ?)')
    .run(turfId, name.trim(), email.trim(), String(subject).trim(), message.trim());

  res.status(201).json({ message: 'Message sent! We will get back to you soon.' });
});

module.exports = router;
