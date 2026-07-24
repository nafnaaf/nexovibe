# 🏟️ TurfBook — Turf Booking Platform

A minimal, clean, fully working turf booking web app. **Anyone can register an account, list their own turf (with photos, location, pricing and amenities), and book any turf by the hour.**

Built with **Node.js + Express + SQLite** (zero external database setup) and a fast, dependency-free **vanilla JS single-page frontend**.

---

## ✨ Features

| Module | What it does |
|---|---|
| **User registration & login** | Anyone can sign up with name/email/phone/password. Passwords are bcrypt-hashed; sessions use JWT tokens (7-day expiry). |
| **Register a turf** | Any logged-in user can list a turf: name, description, sport, address, city, GPS coordinates, price/hour, opening hours, amenities, contact phone and up to 6 photos. |
| **Browse & search** | Home page shows all turfs with cover photo, city, sport, price and rating. Filter by city, sport or free-text search. |
| **Full turf details** | Photo gallery, description, amenities, opening hours, owner info, contact phone, reviews & ratings, embedded OpenStreetMap + "Open in Google Maps" link. |
| **Hourly slot booking** | Pick a date, see live availability, select consecutive hourly slots, confirm. Double-booking is blocked server-side inside a transaction. Past hours/dates can't be booked. |
| **My bookings** | Upcoming & past bookings with status; cancel upcoming bookings. Turf owners also see all bookings received on their turfs (with player contact details). |
| **Contact** | General contact form, plus per-turf enquiry messages stored in the database. |
| **Reviews** | 1–5 star rating + comment, one per user per turf (updating replaces the old one). |

## 🧰 Tech Stack

- **Backend:** Node.js (≥ 22.5), Express 5
- **Database:** SQLite via Node's built-in `node:sqlite` — no install, no server, file lives in `data/turfbook.db`
- **Auth:** `jsonwebtoken` (JWT) + `bcryptjs` (password hashing)
- **File uploads:** `multer` (JPG/PNG/WebP, 5 MB max, 6 photos per turf)
- **Frontend:** Vanilla HTML/CSS/JS single-page app with a hash router — no build step, no framework

## 🚀 Run it

```bash
cd turf-booking-app
npm install
npm start          # → http://localhost:3000
```

That's it. On first start the database is created and seeded with 4 demo turfs and 2 demo accounts:

| Account | Email | Password |
|---|---|---|
| Demo Player | `player@turfbook.demo` | `demo1234` |
| Demo Owner (owns the seed turfs) | `owner@turfbook.demo` | `demo1234` |

For development with auto-reload: `npm run dev`.

To reset all data, delete the `data/` folder and restart.

## 📁 Project Structure

```
turf-booking-app/
├── server.js                 # Express app: static files, API mounting, SPA fallback, error handler
├── src/
│   ├── db.js                 # SQLite connection, schema creation, demo seed data
│   ├── middleware/auth.js    # JWT sign / requireAuth / optionalAuth
│   └── routes/
│       ├── auth.js           # POST /register, POST /login, GET /me
│       ├── turfs.js          # list/search, meta, mine, details, create (+photo upload), reviews
│       ├── bookings.js       # availability, create, mine, for-my-turfs, cancel
│       └── contact.js        # POST /contact
├── public/                   # frontend (served statically)
│   ├── index.html            # app shell (nav, footer, toast)
│   ├── css/style.css         # minimal design system
│   ├── js/api.js             # fetch wrapper + auth token store
│   ├── js/app.js             # hash router + all page views
│   └── img/seed/             # self-contained SVG demo photos
├── uploads/                  # user-uploaded turf photos (created at runtime, gitignored)
└── data/                     # SQLite database (created at runtime, gitignored)
```

## 🔌 API Reference

All endpoints are under `/api`. Authenticated endpoints need `Authorization: Bearer <token>`.

### Auth
| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/auth/register` | `{name, email, phone?, password}` | Create account → `{token, user}` |
| POST | `/auth/login` | `{email, password}` | Log in → `{token, user}` |
| GET | `/auth/me` | — | Current profile 🔒 |

### Turfs
| Method | Endpoint | Description |
|---|---|---|
| GET | `/turfs?city=&sport=&q=` | Browse/search turfs (with rating & cover photo) |
| GET | `/turfs/meta` | Distinct cities & sports for filters |
| GET | `/turfs/mine` | Turfs I registered 🔒 |
| GET | `/turfs/:id` | Full details: photos, owner, amenities, reviews |
| POST | `/turfs` | Register a turf (multipart form, `photos` files) 🔒 |
| POST | `/turfs/:id/reviews` | `{rating: 1–5, comment?}` 🔒 |

### Bookings
| Method | Endpoint | Description |
|---|---|---|
| GET | `/bookings/availability?turf_id=&date=YYYY-MM-DD` | Hourly slot map for a day |
| POST | `/bookings` | `{turf_id, date, hours: [18,19]}` — consecutive hours 🔒 |
| GET | `/bookings/mine` | My bookings 🔒 |
| GET | `/bookings/for-my-turfs` | Bookings received on turfs I own 🔒 |
| DELETE | `/bookings/:id` | Cancel my upcoming booking 🔒 |

### Contact
| Method | Endpoint | Description |
|---|---|---|
| POST | `/contact` | `{name, email, subject?, message, turf_id?}` |

## 🏗️ How this app was built — step by step

If you want to rebuild or extend this yourself, this is the exact order of work:

1. **Plan the modules.** Users, turfs (with photos + location), hourly bookings, reviews, contact messages. Decide the rule that makes booking safe: *a turf's (date, hour) slot can only be confirmed once.*
2. **Design the database schema** (`src/db.js`): `users`, `turfs`, `turf_photos`, `bookings` (with `start_hour`/`end_hour`), `reviews`, `messages`. Add indexes for slot lookups and a seed function so the app demos itself.
3. **Build authentication** (`src/routes/auth.js` + `src/middleware/auth.js`): bcrypt-hash passwords on register, verify on login, issue a JWT, and write `requireAuth` middleware that guards protected routes.
4. **Build the turf module** (`src/routes/turfs.js`): list with filters (SQL `WHERE` built from query params), a details endpoint that joins photos/owner/reviews, and a create endpoint using `multer` for photo uploads with type/size limits.
5. **Build the booking engine** (`src/routes/bookings.js`): an availability endpoint that flattens existing bookings into an hourly slot map, and a create endpoint that validates (future date, consecutive hours, inside opening hours) then checks for overlaps **inside a `BEGIN IMMEDIATE` transaction** before inserting — this is what prevents double booking under concurrency.
6. **Add contact + reviews** — simple validated inserts.
7. **Wire up the server** (`server.js`): JSON parsing, static file serving, `/uploads` route, API mounting, SPA fallback route, and one central error handler.
8. **Build the frontend** (`public/`): a tiny hash router maps `#/`, `#/turf/:id`, `#/login`, `#/register`, `#/add-turf`, `#/my-bookings`, `#/contact` to view functions. A shared `api()` fetch wrapper attaches the JWT and surfaces server errors. Every piece of user content is HTML-escaped before rendering.
9. **Design minimally**: one accent color, system font, generous whitespace, cards with subtle shadows, a sticky booking panel, and responsive breakpoints for mobile.
10. **Test end-to-end**: register → search → open turf → pick slots → book → verify the double-booking rejection → cancel → contact form.

## 🔒 Production notes

- Set a strong secret: `JWT_SECRET=<random-string> npm start` (a dev fallback is used otherwise).
- Set `PORT` to change the port.
- Put the app behind HTTPS (e.g. nginx/Caddy reverse proxy) before real use.
- SQLite comfortably handles a single-venue or small-scale deployment; swap `src/db.js` for Postgres if you outgrow it.

## 🗺️ Ideas to extend

- Online payments (Razorpay/Stripe) at booking time
- Email/SMS booking confirmations
- Owner dashboard with earnings analytics
- Admin panel to approve turf listings
