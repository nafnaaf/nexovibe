/**
 * Database layer — uses Node's built-in SQLite (node:sqlite, Node >= 22.5).
 * Creates the schema on first run and seeds demo data so the app
 * works out of the box.
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'turfbook.db'));

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone       TEXT DEFAULT '',
    password    TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS turfs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id       INTEGER NOT NULL REFERENCES users(id),
    name           TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    sport          TEXT NOT NULL,
    address        TEXT NOT NULL,
    city           TEXT NOT NULL,
    lat            REAL,
    lng            REAL,
    price_per_hour REAL NOT NULL,
    open_hour      INTEGER NOT NULL DEFAULT 6,
    close_hour     INTEGER NOT NULL DEFAULT 23,
    amenities      TEXT NOT NULL DEFAULT '[]',
    contact_phone  TEXT DEFAULT '',
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS turf_photos (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    turf_id  INTEGER NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
    url      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    turf_id     INTEGER NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    date        TEXT NOT NULL,              -- YYYY-MM-DD
    start_hour  INTEGER NOT NULL,           -- 0..23
    end_hour    INTEGER NOT NULL,           -- exclusive, start_hour < end_hour
    total_price REAL NOT NULL,
    status      TEXT NOT NULL DEFAULT 'confirmed',  -- confirmed | cancelled
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_bookings_slot ON bookings (turf_id, date, status);

  CREATE TABLE IF NOT EXISTS reviews (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    turf_id    INTEGER NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (turf_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    turf_id    INTEGER REFERENCES turfs(id) ON DELETE SET NULL,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    subject    TEXT NOT NULL DEFAULT '',
    message    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/** Seed demo data on an empty database so the app is instantly usable. */
function seedIfEmpty() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (n > 0) return;

  const hash = bcrypt.hashSync('demo1234', 10);
  const insertUser = db.prepare(
    'INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)'
  );
  const demoOwner = insertUser.run('Demo Owner', 'owner@turfbook.demo', '+91 90000 00001', hash);
  const demoUser = insertUser.run('Demo Player', 'player@turfbook.demo', '+91 90000 00002', hash);

  const insertTurf = db.prepare(`
    INSERT INTO turfs (owner_id, name, description, sport, address, city, lat, lng,
                       price_per_hour, open_hour, close_hour, amenities, contact_phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPhoto = db.prepare('INSERT INTO turf_photos (turf_id, url) VALUES (?, ?)');

  const turfs = [
    {
      name: 'GreenKick Arena',
      description:
        'FIFA-standard 5-a-side artificial turf with pro floodlights, netted enclosure and a seating gallery. Ideal for evening football with friends or corporate matches.',
      sport: 'Football',
      address: '12 MG Road, Near Metro Station',
      city: 'Kochi',
      lat: 9.9816, lng: 76.2999,
      price: 1200, open: 6, close: 23,
      amenities: ['Floodlights', 'Parking', 'Changing Room', 'Drinking Water', 'First Aid'],
      phone: '+91 98470 11111',
      photos: ['/img/seed/turf1a.svg', '/img/seed/turf1b.svg', '/img/seed/turf1c.svg'],
    },
    {
      name: 'SmashPoint Box Cricket',
      description:
        'Fully netted box-cricket cage with bounce-true matting wicket, digital scoreboard and night lighting. Bats and balls available on request.',
      sport: 'Cricket',
      address: 'Plot 7, Industrial Estate Road',
      city: 'Bengaluru',
      lat: 12.9716, lng: 77.5946,
      price: 1500, open: 5, close: 24,
      amenities: ['Floodlights', 'Scoreboard', 'Parking', 'Washroom', 'Equipment Rental'],
      phone: '+91 98860 22222',
      photos: ['/img/seed/turf2a.svg', '/img/seed/turf2b.svg'],
    },
    {
      name: 'CourtSide Badminton Hub',
      description:
        'Two indoor synthetic badminton courts with BWF-approved flooring, anti-glare LED lighting and air circulation. Rackets available at the front desk.',
      sport: 'Badminton',
      address: '45 Lake View Street, Anna Nagar',
      city: 'Chennai',
      lat: 13.0827, lng: 80.2707,
      price: 600, open: 6, close: 22,
      amenities: ['Indoor', 'AC Lounge', 'Equipment Rental', 'Drinking Water', 'Parking'],
      phone: '+91 98410 33333',
      photos: ['/img/seed/turf3a.svg', '/img/seed/turf3b.svg'],
    },
    {
      name: 'Urban Goals Rooftop Turf',
      description:
        'City-centre rooftop 7-a-side turf with skyline views, cushioned shock-pad grass and a cafe on the same floor. Perfect for weekend leagues.',
      sport: 'Football',
      address: 'Skyline Mall Rooftop, SV Road',
      city: 'Mumbai',
      lat: 19.076, lng: 72.8777,
      price: 1800, open: 6, close: 23,
      amenities: ['Rooftop', 'Cafe', 'Floodlights', 'Changing Room', 'Lift Access'],
      phone: '+91 98200 44444',
      photos: ['/img/seed/turf4a.svg', '/img/seed/turf4b.svg'],
    },
  ];

  for (const t of turfs) {
    const res = insertTurf.run(
      demoOwner.lastInsertRowid, t.name, t.description, t.sport, t.address, t.city,
      t.lat, t.lng, t.price, t.open, t.close, JSON.stringify(t.amenities), t.phone
    );
    for (const p of t.photos) insertPhoto.run(res.lastInsertRowid, p);
  }

  // A couple of seed reviews so ratings render.
  const insertReview = db.prepare(
    'INSERT INTO reviews (turf_id, user_id, rating, comment) VALUES (?, ?, ?, ?)'
  );
  insertReview.run(1, demoUser.lastInsertRowid, 5, 'Great grass quality and lighting. Booking was smooth.');
  insertReview.run(2, demoUser.lastInsertRowid, 4, 'Fun box cricket setup, wicket has true bounce.');
}

seedIfEmpty();

module.exports = db;
