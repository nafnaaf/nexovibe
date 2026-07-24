/* ===== TurfBook SPA — hash router + views ===== */
const $app = document.getElementById('app');

/* ---------- helpers ---------- */
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtHour = (h) => {
  const hr = h % 24;
  const suffix = hr < 12 ? 'AM' : 'PM';
  const display = hr % 12 === 0 ? 12 : hr % 12;
  return `${display} ${suffix}`;
};
const fmtRange = (a, b) => `${fmtHour(a)} – ${fmtHour(b)}`;
const fmtMoney = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const stars = (rating) =>
  rating
    ? `<span class="stars">★ ${esc(rating)}</span>`
    : '<span class="muted" style="font-size:.83rem">New</span>';

let toastTimer;
function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function requireLogin(redirectTo) {
  if (Auth.loggedIn) return true;
  toast('Please log in first', true);
  location.hash = `#/login?next=${encodeURIComponent(redirectTo || location.hash.slice(1))}`;
  return false;
}

/* ---------- navigation ---------- */
function renderNav() {
  const el = document.getElementById('nav-auth');
  if (Auth.loggedIn) {
    el.innerHTML = `
      <span class="nav-user">Hi, ${esc(Auth.user?.name?.split(' ')[0] || 'there')}</span>
      <a class="btn btn-ghost btn-sm" href="#/my-bookings">My bookings</a>
      <button class="btn btn-ghost btn-sm" id="logout-btn">Logout</button>`;
    document.getElementById('logout-btn').onclick = () => {
      Auth.clear();
      renderNav();
      toast('Logged out');
      location.hash = '#/';
    };
  } else {
    el.innerHTML = `
      <a class="btn btn-ghost btn-sm" href="#/login">Log in</a>
      <a class="btn btn-sm" href="#/register">Sign up</a>`;
  }
}

document.getElementById('nav-toggle').onclick = () =>
  document.getElementById('nav-links').classList.toggle('open');
document.getElementById('nav-links').addEventListener('click', () =>
  document.getElementById('nav-links').classList.remove('open'));
document.getElementById('year').textContent = new Date().getFullYear();

/* ---------- views ---------- */

/* -- Home: hero + search + turf grid -- */
async function viewHome(params) {
  const q = params.get('q') || '';
  const city = params.get('city') || '';
  const sport = params.get('sport') || '';

  $app.innerHTML = `
    <section class="hero">
      <h1>Find & book <span>sports turfs</span><br/>in seconds.</h1>
      <p>Browse turfs near you, check live slot availability and book by the hour.</p>
      <form class="search-bar" id="search-form">
        <input type="search" name="q" placeholder="Search turf, area, sport…" value="${esc(q)}" />
        <select name="city" id="f-city"><option value="">All cities</option></select>
        <select name="sport" id="f-sport"><option value="">All sports</option></select>
        <button class="btn" type="submit">Search</button>
      </form>
    </section>
    <div id="turf-list"><div class="spinner">Loading turfs…</div></div>`;

  document.getElementById('search-form').onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const qs = new URLSearchParams();
    for (const [k, v] of fd) if (v) qs.set(k, v);
    location.hash = `#/${qs.toString() ? '?' + qs.toString() : ''}`;
  };

  try {
    const [meta, list] = await Promise.all([
      api('/turfs/meta'),
      api(`/turfs?${new URLSearchParams({ q, city, sport })}`),
    ]);

    const fill = (id, values, selected) => {
      const sel = document.getElementById(id);
      for (const v of values) {
        const opt = new Option(v, v, false, v === selected);
        sel.add(opt);
      }
    };
    fill('f-city', meta.cities, city);
    fill('f-sport', meta.sports, sport);

    const listEl = document.getElementById('turf-list');
    if (!list.turfs.length) {
      listEl.innerHTML = `<div class="empty"><div class="big">🔍</div><p>No turfs match your search.</p></div>`;
      return;
    }
    listEl.innerHTML = `<div class="grid">${list.turfs.map((t) => `
      <a class="card" href="#/turf/${t.id}">
        <img class="card-img" src="${esc(t.cover_photo || '/img/seed/placeholder.svg')}" alt="${esc(t.name)}" loading="lazy"/>
        <div class="card-body">
          <h3>${esc(t.name)}</h3>
          <div class="card-meta">📍 ${esc(t.city)} · <span class="badge badge-gray">${esc(t.sport)}</span></div>
          <div class="card-foot">
            <span class="price">${fmtMoney(t.price_per_hour)}<small>/hr</small></span>
            ${stars(t.rating)}
          </div>
        </div>
      </a>`).join('')}</div>`;
  } catch (err) {
    document.getElementById('turf-list').innerHTML =
      `<div class="empty"><p>${esc(err.message)}</p></div>`;
  }
}

/* -- Turf detail: gallery, info, map, reviews, booking panel -- */
async function viewTurf(params, turfId) {
  $app.innerHTML = '<div class="spinner">Loading turf…</div>';
  let turf;
  try {
    ({ turf } = await api(`/turfs/${turfId}`));
  } catch (err) {
    $app.innerHTML = `<div class="empty"><div class="big">🌱</div><p>${esc(err.message)}</p></div>`;
    return;
  }

  const photos = turf.photos.length ? turf.photos : ['/img/seed/placeholder.svg'];
  const hasCoords = turf.lat != null && turf.lng != null;
  const gmapsUrl = hasCoords
    ? `https://www.google.com/maps?q=${turf.lat},${turf.lng}`
    : `https://www.google.com/maps?q=${encodeURIComponent(`${turf.address}, ${turf.city}`)}`;
  const osmBox = hasCoords
    ? [turf.lng - 0.01, turf.lat - 0.006, turf.lng + 0.01, turf.lat + 0.006].join(',')
    : null;

  $app.innerHTML = `
    <a class="back-link" href="#/">← Back to all turfs</a>
    <div class="detail-grid">
      <div>
        <img class="gallery-main" id="gallery-main" src="${esc(photos[0])}" alt="${esc(turf.name)}"/>
        ${photos.length > 1 ? `<div class="gallery-thumbs" id="gallery-thumbs">
          ${photos.map((p, i) => `<img src="${esc(p)}" data-i="${i}" class="${i === 0 ? 'active' : ''}" alt="Photo ${i + 1}"/>`).join('')}
        </div>` : ''}

        <div class="detail-title">
          <div>
            <h1>${esc(turf.name)}</h1>
            <p class="muted">📍 ${esc(turf.address)}, ${esc(turf.city)}</p>
          </div>
          <div style="text-align:right">
            ${stars(turf.rating)} <span class="muted" style="font-size:.83rem">(${turf.review_count} review${turf.review_count === 1 ? '' : 's'})</span>
            <div><span class="badge">${esc(turf.sport)}</span></div>
          </div>
        </div>

        <div class="section">
          <h2>About this turf</h2>
          <p class="muted">${esc(turf.description) || 'No description provided.'}</p>
          <p class="muted" style="margin-top:8px">
            🕒 Open ${fmtRange(turf.open_hour, turf.close_hour)} ·
            👤 Listed by ${esc(turf.owner?.name || 'owner')}
            ${turf.contact_phone ? ` · 📞 ${esc(turf.contact_phone)}` : ''}
          </p>
        </div>

        ${turf.amenities.length ? `<div class="section">
          <h2>Amenities</h2>
          <div class="amenities">${turf.amenities.map((a) => `<span class="badge badge-gray">✓ ${esc(a)}</span>`).join('')}</div>
        </div>` : ''}

        <div class="section">
          <h2>Location</h2>
          ${osmBox ? `<iframe class="map-frame" loading="lazy" title="Map of ${esc(turf.name)}"
            src="https://www.openstreetmap.org/export/embed.html?bbox=${osmBox}&layer=mapnik&marker=${turf.lat},${turf.lng}"></iframe>` : ''}
          <p style="margin-top:8px"><a class="btn btn-ghost btn-sm" href="${gmapsUrl}" target="_blank" rel="noopener">Open in Google Maps ↗</a></p>
        </div>

        <div class="section">
          <h2>Reviews</h2>
          <div id="reviews">
            ${turf.reviews.length ? turf.reviews.map((r) => `
              <div class="review">
                <div class="review-head"><strong>${esc(r.user_name)}</strong><span class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span></div>
                ${r.comment ? `<p>${esc(r.comment)}</p>` : ''}
              </div>`).join('') : '<p class="muted">No reviews yet — be the first!</p>'}
          </div>
          <form id="review-form" style="margin-top:14px">
            <div class="form-row">
              <div class="field"><label>Your rating</label>
                <select name="rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${'★'.repeat(n)} (${n})</option>`).join('')}</select>
              </div>
            </div>
            <div class="field"><label>Comment <span class="hint">(optional)</span></label>
              <textarea name="comment" rows="2" placeholder="How was your game here?"></textarea></div>
            <button class="btn btn-ghost btn-sm" type="submit">Post review</button>
          </form>
        </div>

        <div class="section">
          <h2>Contact the owner</h2>
          <p class="muted" style="margin-bottom:10px">Questions about this turf? Send a message.</p>
          <a class="btn btn-ghost btn-sm" href="#/contact?turf_id=${turf.id}&turf_name=${encodeURIComponent(turf.name)}">Message about ${esc(turf.name)}</a>
        </div>
      </div>

      <aside class="panel">
        <h2>Book a slot</h2>
        <p class="muted" style="font-size:.88rem">${fmtMoney(turf.price_per_hour)}/hour · pick consecutive slots</p>
        <div class="field" style="margin-top:12px">
          <label for="book-date">Date</label>
          <input type="date" id="book-date" min="${todayISO()}" value="${todayISO()}"/>
        </div>
        <div class="slots" id="slots"><span class="muted">Loading…</span></div>
        <div class="booking-summary" id="booking-summary" hidden>
          <div id="summary-lines"></div>
          <div class="total"><span>Total</span><span id="summary-total"></span></div>
          <button class="btn btn-block" id="book-btn">Confirm booking</button>
        </div>
        <p class="error-text" id="book-error"></p>
      </aside>
    </div>`;

  /* gallery */
  const mainImg = document.getElementById('gallery-main');
  document.getElementById('gallery-thumbs')?.addEventListener('click', (e) => {
    const img = e.target.closest('img[data-i]');
    if (!img) return;
    mainImg.src = photos[Number(img.dataset.i)];
    document.querySelectorAll('#gallery-thumbs img').forEach((el) => el.classList.remove('active'));
    img.classList.add('active');
  });

  /* review form */
  document.getElementById('review-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!requireLogin(`/turf/${turf.id}`)) return;
    const fd = new FormData(e.target);
    try {
      await api(`/turfs/${turf.id}/reviews`, {
        method: 'POST',
        body: { rating: fd.get('rating'), comment: fd.get('comment') },
      });
      toast('Review saved — thanks!');
      viewTurf(params, turfId);
    } catch (err) {
      toast(err.message, true);
    }
  };

  /* booking widget */
  const selected = new Set();
  const dateInput = document.getElementById('book-date');
  const slotsEl = document.getElementById('slots');
  const summaryEl = document.getElementById('booking-summary');
  const errEl = document.getElementById('book-error');

  async function loadSlots() {
    selected.clear();
    updateSummary();
    slotsEl.innerHTML = '<span class="muted">Loading…</span>';
    try {
      const { slots } = await api(`/bookings/availability?turf_id=${turf.id}&date=${dateInput.value}`);
      if (!slots.length) {
        slotsEl.innerHTML = '<span class="muted">Closed on this day.</span>';
        return;
      }
      slotsEl.innerHTML = slots.map((s) =>
        `<button type="button" class="slot" data-hour="${s.hour}" ${s.available ? '' : 'disabled'}>${fmtHour(s.hour)}</button>`
      ).join('');
    } catch (err) {
      slotsEl.innerHTML = `<span class="error-text">${esc(err.message)}</span>`;
    }
  }

  function isConsecutive(set) {
    const arr = [...set].sort((a, b) => a - b);
    return arr.every((h, i) => i === 0 || h === arr[i - 1] + 1);
  }

  function updateSummary() {
    errEl.textContent = '';
    if (!selected.size) { summaryEl.hidden = true; return; }
    const arr = [...selected].sort((a, b) => a - b);
    summaryEl.hidden = false;
    document.getElementById('summary-lines').innerHTML =
      `<div style="display:flex;justify-content:space-between">
        <span>${fmtDate(dateInput.value)}</span><span>${fmtRange(arr[0], arr[arr.length - 1] + 1)}</span>
      </div>
      <div class="muted" style="font-size:.85rem">${arr.length} hour${arr.length > 1 ? 's' : ''} × ${fmtMoney(turf.price_per_hour)}</div>`;
    document.getElementById('summary-total').textContent = fmtMoney(arr.length * turf.price_per_hour);
  }

  slotsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.slot:not(:disabled)');
    if (!btn) return;
    const hour = Number(btn.dataset.hour);
    const next = new Set(selected);
    next.has(hour) ? next.delete(hour) : next.add(hour);
    if (next.size && !isConsecutive(next)) {
      // Start a fresh selection when the clicked slot doesn't extend the block.
      selected.clear();
      selected.add(hour);
    } else {
      selected.clear();
      next.forEach((h) => selected.add(h));
    }
    document.querySelectorAll('.slot').forEach((el) =>
      el.classList.toggle('selected', selected.has(Number(el.dataset.hour))));
    updateSummary();
  });

  dateInput.onchange = loadSlots;

  const bookBtn = document.getElementById('book-btn');
  bookBtn.onclick = async () => {
    if (!requireLogin(`/turf/${turf.id}`)) return;
    bookBtn.disabled = true;
    try {
      const { booking } = await api('/bookings', {
        method: 'POST',
        body: { turf_id: turf.id, date: dateInput.value, hours: [...selected] },
      });
      toast(`Booked ${booking.turf_name} · ${fmtDate(booking.date)} · ${fmtRange(booking.start_hour, booking.end_hour)} ✔`);
      location.hash = '#/my-bookings';
    } catch (err) {
      errEl.textContent = err.message;
      bookBtn.disabled = false;
      loadSlots();
    }
  };

  loadSlots();
}

/* -- Login / Register -- */
function viewLogin(params) {
  const next = params.get('next') || '/';
  $app.innerHTML = `
    <div class="narrow card-panel">
      <h1>Welcome back</h1>
      <p class="sub">Log in to book turfs and manage your listings.</p>
      <div class="demo-box">Demo account — email: <b>player@turfbook.demo</b> · password: <b>demo1234</b></div>
      <form id="login-form">
        <div class="field"><label>Email</label><input type="email" name="email" required autocomplete="email"/></div>
        <div class="field"><label>Password</label><input type="password" name="password" required autocomplete="current-password"/></div>
        <button class="btn btn-block" type="submit">Log in</button>
        <p class="error-text" id="form-error"></p>
      </form>
      <p class="form-foot">New here? <a href="#/register?next=${encodeURIComponent(next)}">Create an account</a></p>
    </div>`;
  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const { token, user } = await api('/auth/login', {
        method: 'POST',
        body: { email: fd.get('email'), password: fd.get('password') },
      });
      Auth.save(token, user);
      renderNav();
      toast(`Welcome back, ${user.name.split(' ')[0]}!`);
      location.hash = `#${next}`;
    } catch (err) {
      document.getElementById('form-error').textContent = err.message;
    }
  };
}

function viewRegister(params) {
  const next = params.get('next') || '/';
  $app.innerHTML = `
    <div class="narrow card-panel">
      <h1>Create your account</h1>
      <p class="sub">One account to book turfs and list your own.</p>
      <form id="register-form">
        <div class="field"><label>Full name</label><input name="name" required autocomplete="name"/></div>
        <div class="field"><label>Email</label><input type="email" name="email" required autocomplete="email"/></div>
        <div class="field"><label>Phone <span class="hint">(optional)</span></label><input name="phone" autocomplete="tel"/></div>
        <div class="field"><label>Password <span class="hint">(min 6 characters)</span></label>
          <input type="password" name="password" minlength="6" required autocomplete="new-password"/></div>
        <button class="btn btn-block" type="submit">Sign up</button>
        <p class="error-text" id="form-error"></p>
      </form>
      <p class="form-foot">Already have an account? <a href="#/login?next=${encodeURIComponent(next)}">Log in</a></p>
    </div>`;
  document.getElementById('register-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const { token, user } = await api('/auth/register', {
        method: 'POST',
        body: {
          name: fd.get('name'), email: fd.get('email'),
          phone: fd.get('phone'), password: fd.get('password'),
        },
      });
      Auth.save(token, user);
      renderNav();
      toast(`Welcome to TurfBook, ${user.name.split(' ')[0]}! 🎉`);
      location.hash = `#${next}`;
    } catch (err) {
      document.getElementById('form-error').textContent = err.message;
    }
  };
}

/* -- Register a turf -- */
function viewAddTurf() {
  if (!requireLogin('/add-turf')) return;
  $app.innerHTML = `
    <div class="wide">
      <div class="page-head">
        <h1>List your turf</h1>
        <p>Add details, photos and location — players can book it instantly.</p>
      </div>
      <div class="card-panel" style="margin-top:18px">
      <form id="turf-form">
        <div class="field"><label>Turf name</label><input name="name" required placeholder="e.g. GreenKick Arena"/></div>
        <div class="field"><label>Description</label>
          <textarea name="description" placeholder="Surface type, size, lighting, what makes it great…"></textarea></div>
        <div class="form-row">
          <div class="field"><label>Sport</label>
            <select name="sport">
              ${['Football', 'Cricket', 'Badminton', 'Tennis', 'Basketball', 'Volleyball', 'Hockey', 'Multi-sport']
                .map((s) => `<option>${s}</option>`).join('')}
            </select></div>
          <div class="field"><label>Price per hour (₹)</label>
            <input type="number" name="price_per_hour" min="1" step="any" required placeholder="1200"/></div>
        </div>
        <div class="field"><label>Address</label><input name="address" required placeholder="Street, landmark"/></div>
        <div class="form-row">
          <div class="field"><label>City</label><input name="city" required placeholder="Kochi"/></div>
          <div class="field"><label>Contact phone <span class="hint">(shown to players)</span></label>
            <input name="contact_phone" placeholder="+91 …"/></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Latitude <span class="hint">(optional, for the map)</span></label>
            <input type="number" name="lat" step="any" min="-90" max="90" placeholder="9.9816"/></div>
          <div class="field"><label>Longitude <span class="hint">(optional)</span></label>
            <input type="number" name="lng" step="any" min="-180" max="180" placeholder="76.2999"/></div>
        </div>
        <p class="hint" style="margin:-6px 0 14px">Tip: right-click your turf on Google Maps → the first menu item shows “lat, lng”.</p>
        <div class="form-row">
          <div class="field"><label>Opens at</label>
            <select name="open_hour">${Array.from({ length: 24 }, (_, h) =>
              `<option value="${h}" ${h === 6 ? 'selected' : ''}>${fmtHour(h)}</option>`).join('')}</select></div>
          <div class="field"><label>Closes at</label>
            <select name="close_hour">${Array.from({ length: 24 }, (_, i) => i + 1).map((h) =>
              `<option value="${h}" ${h === 23 ? 'selected' : ''}>${fmtHour(h)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Amenities <span class="hint">(comma separated)</span></label>
          <input name="amenities" placeholder="Floodlights, Parking, Changing Room"/></div>
        <div class="field"><label>Photos <span class="hint">(up to 6 — JPG/PNG/WebP, max 5 MB each)</span></label>
          <input type="file" name="photos" id="photo-input" accept="image/jpeg,image/png,image/webp" multiple/>
          <div class="photo-preview" id="photo-preview"></div></div>
        <button class="btn btn-block" type="submit">Register turf</button>
        <p class="error-text" id="form-error"></p>
      </form>
      </div>
    </div>`;

  document.getElementById('photo-input').onchange = (e) => {
    const preview = document.getElementById('photo-preview');
    preview.innerHTML = '';
    for (const file of [...e.target.files].slice(0, 6)) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      preview.appendChild(img);
    }
  };

  document.getElementById('turf-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const formData = new FormData(e.target);
      const { id } = await api('/turfs', { method: 'POST', formData });
      toast('Turf registered! 🎉');
      location.hash = `#/turf/${id}`;
    } catch (err) {
      document.getElementById('form-error').textContent = err.message;
      btn.disabled = false;
    }
  };
}

/* -- My bookings (+ my turfs & received bookings) -- */
async function viewMyBookings() {
  if (!requireLogin('/my-bookings')) return;
  $app.innerHTML = '<div class="spinner">Loading your bookings…</div>';

  try {
    const [mine, myTurfs, received] = await Promise.all([
      api('/bookings/mine'),
      api('/turfs/mine'),
      api('/bookings/for-my-turfs'),
    ]);

    const bookingRow = (b) => `
      <div class="booking-row">
        <img src="${esc(b.cover_photo || '/img/seed/placeholder.svg')}" alt=""/>
        <div class="booking-info">
          <h3><a href="#/turf/${b.turf_id}">${esc(b.turf_name)}</a></h3>
          <p class="muted">📍 ${esc(b.address)}, ${esc(b.city)} · ${esc(b.sport)}</p>
          <p class="muted">📅 ${fmtDate(b.date)} · 🕒 ${fmtRange(b.start_hour, b.end_hour)}</p>
        </div>
        <div class="booking-side">
          <span class="badge ${b.status === 'cancelled' ? 'badge-red' : ''}">${esc(b.status)}</span>
          <span class="price">${fmtMoney(b.total_price)}</span>
          ${b.status === 'confirmed' && b.date >= todayISO()
            ? `<button class="btn btn-danger btn-sm" data-cancel="${b.id}">Cancel</button>` : ''}
        </div>
      </div>`;

    $app.innerHTML = `
      <div class="page-head"><h1>My bookings</h1><p>Everything you've booked, upcoming first.</p></div>
      <div id="my-bookings-list">
        ${mine.bookings.length
          ? mine.bookings.map(bookingRow).join('')
          : `<div class="empty"><div class="big">🏟️</div><p>No bookings yet. <a href="#/" style="color:var(--green);font-weight:600">Find a turf →</a></p></div>`}
      </div>

      ${myTurfs.turfs.length ? `
        <div class="section" style="margin-top:44px">
          <div class="page-head"><h1 style="font-size:1.3rem">My listed turfs</h1></div>
          <div class="grid">${myTurfs.turfs.map((t) => `
            <a class="card" href="#/turf/${t.id}">
              <img class="card-img" src="${esc(t.cover_photo || '/img/seed/placeholder.svg')}" alt="${esc(t.name)}"/>
              <div class="card-body">
                <h3>${esc(t.name)}</h3>
                <div class="card-meta">📍 ${esc(t.city)} · <span class="badge badge-gray">${esc(t.sport)}</span></div>
                <div class="card-foot"><span class="price">${fmtMoney(t.price_per_hour)}<small>/hr</small></span>${stars(t.rating)}</div>
              </div>
            </a>`).join('')}</div>
        </div>` : ''}

      ${received.bookings.length ? `
        <div class="section" style="margin-top:44px">
          <div class="page-head"><h1 style="font-size:1.3rem">Bookings received on my turfs</h1></div>
          ${received.bookings.map((b) => `
            <div class="booking-row">
              <div class="booking-info">
                <h3>${esc(b.turf_name)}</h3>
                <p class="muted">👤 ${esc(b.player_name)} · ${esc(b.player_email)}${b.player_phone ? ` · ${esc(b.player_phone)}` : ''}</p>
                <p class="muted">📅 ${fmtDate(b.date)} · 🕒 ${fmtRange(b.start_hour, b.end_hour)}</p>
              </div>
              <div class="booking-side">
                <span class="badge ${b.status === 'cancelled' ? 'badge-red' : ''}">${esc(b.status)}</span>
                <span class="price">${fmtMoney(b.total_price)}</span>
              </div>
            </div>`).join('')}
        </div>` : ''}`;

    document.getElementById('my-bookings-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-cancel]');
      if (!btn) return;
      if (!confirm('Cancel this booking?')) return;
      btn.disabled = true;
      try {
        await api(`/bookings/${btn.dataset.cancel}`, { method: 'DELETE' });
        toast('Booking cancelled');
        viewMyBookings();
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
      }
    });
  } catch (err) {
    $app.innerHTML = `<div class="empty"><p>${esc(err.message)}</p></div>`;
  }
}

/* -- Contact -- */
function viewContact(params) {
  const turfId = params.get('turf_id');
  const turfName = params.get('turf_name');
  const user = Auth.user;
  $app.innerHTML = `
    <div class="narrow card-panel" style="max-width:520px">
      <h1>Contact us</h1>
      <p class="sub">${turfName
        ? `Your message about <b>${esc(turfName)}</b> will reach its owner.`
        : 'Questions, feedback or partnership ideas — we read everything.'}</p>
      <form id="contact-form">
        <div class="form-row">
          <div class="field"><label>Name</label><input name="name" required value="${esc(user?.name || '')}"/></div>
          <div class="field"><label>Email</label><input type="email" name="email" required value="${esc(user?.email || '')}"/></div>
        </div>
        <div class="field"><label>Subject</label>
          <input name="subject" value="${turfName ? `Enquiry: ${esc(turfName)}` : ''}" placeholder="What's this about?"/></div>
        <div class="field"><label>Message</label><textarea name="message" required placeholder="Write your message…"></textarea></div>
        <button class="btn btn-block" type="submit">Send message</button>
        <p class="error-text" id="form-error"></p>
      </form>
    </div>`;
  document.getElementById('contact-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const { message } = await api('/contact', {
        method: 'POST',
        body: {
          name: fd.get('name'), email: fd.get('email'), subject: fd.get('subject'),
          message: fd.get('message'), turf_id: turfId ? Number(turfId) : null,
        },
      });
      toast(message);
      e.target.reset();
    } catch (err) {
      document.getElementById('form-error').textContent = err.message;
    }
  };
}

function viewNotFound() {
  $app.innerHTML = `<div class="empty"><div class="big">🤷</div><p>Page not found. <a href="#/" style="color:var(--green);font-weight:600">Go home →</a></p></div>`;
}

/* ---------- router ---------- */
const routes = [
  { pattern: /^\/?$/, view: viewHome },
  { pattern: /^\/turf\/(\d+)$/, view: viewTurf },
  { pattern: /^\/login$/, view: viewLogin },
  { pattern: /^\/register$/, view: viewRegister },
  { pattern: /^\/add-turf$/, view: viewAddTurf },
  { pattern: /^\/my-bookings$/, view: viewMyBookings },
  { pattern: /^\/contact$/, view: viewContact },
];

function router() {
  const hash = location.hash.slice(1) || '/';
  const [path, query = ''] = hash.split('?');
  const params = new URLSearchParams(query);

  for (const r of routes) {
    const match = path.match(r.pattern);
    if (match) {
      window.scrollTo(0, 0);
      r.view(params, ...match.slice(1));
      return;
    }
  }
  viewNotFound();
}

window.addEventListener('hashchange', router);
renderNav();
router();
