/**
 * TurfBook — minimal turf booking platform.
 * Express API + static single-page frontend, SQLite storage.
 *
 *   npm start          → http://localhost:3000
 */
const express = require('express');
const path = require('path');

const authRoutes = require('./src/routes/auth');
const turfRoutes = require('./src/routes/turfs');
const bookingRoutes = require('./src/routes/bookings');
const contactRoutes = require('./src/routes/contact');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/turfs', turfRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/contact', contactRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// SPA fallback — every non-API, non-file route serves the app shell.
app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Central error handler (multer errors, JSON parse errors, anything thrown).
app.use((err, _req, res, _next) => {
  const status = err.status || (err.name === 'MulterError' ? 400 : 500);
  const message = status === 500 ? 'Something went wrong' : err.message;
  if (status === 500) console.error(err);
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`TurfBook running → http://localhost:${PORT}`);
});
