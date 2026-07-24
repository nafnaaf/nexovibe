/* API client + auth session store (localStorage). */
const Auth = {
  get token() { return localStorage.getItem('tb_token'); },
  get user() {
    try { return JSON.parse(localStorage.getItem('tb_user')); } catch { return null; }
  },
  save(token, user) {
    localStorage.setItem('tb_token', token);
    localStorage.setItem('tb_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('tb_token');
    localStorage.removeItem('tb_user');
  },
  get loggedIn() { return Boolean(this.token); },
};

/**
 * api('/turfs')                          → GET
 * api('/bookings', { method, body })     → JSON body
 * api('/turfs', { method, formData })    → multipart upload
 * Throws Error(message) on non-2xx responses.
 */
async function api(path, { method = 'GET', body, formData } = {}) {
  const headers = {};
  if (Auth.token) headers.Authorization = `Bearer ${Auth.token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: formData || (body ? JSON.stringify(body) : undefined),
  });

  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }

  if (res.status === 401 && Auth.loggedIn) {
    Auth.clear();
    renderNav();
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
