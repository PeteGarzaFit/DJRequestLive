// Talks to the Node/MySQL backend (server/app.js) on the same domain. Session lives in an HttpOnly cookie.
export class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

async function call(path, { method = 'GET', body, raw } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  if (raw) opts.body = raw;
  let res;
  try { res = await fetch(path, opts); } catch { throw new ApiError(0, 'network'); }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || 'server_error');
  return data;
}

export const api = {
  signup: (b) => call('/api/signup', { method: 'POST', body: b }),
  login: (b) => call('/api/login', { method: 'POST', body: b }),
  logout: () => call('/api/logout', { method: 'POST', body: {} }),
  me: () => call('/api/me'),
  saveMe: (b) => call('/api/me', { method: 'PUT', body: b }),
  slugFree: (s) => call('/api/slug?slug=' + encodeURIComponent(s)),
  dj: (slug) => call('/api/dj/' + encodeURIComponent(slug)),
  sendRequest: (slug, b) => call(`/api/dj/${encodeURIComponent(slug)}/requests`, { method: 'POST', body: b }),
  requests: () => call('/api/me/requests'),
  patchRequest: (id, b) => call('/api/me/requests/' + id, { method: 'PATCH', body: b }),
  deleteRequest: (id) => call('/api/me/requests/' + id, { method: 'DELETE' }),
  aiEventPlan: (event) => call('/api/ai/event-plan', { method: 'POST', body: { event } }),
  spotifyStatus: () => call('/api/spotify/status'),
  spotifyPlaylists: () => call('/api/spotify/playlists'),
  spotifyCreatePlaylist: (b) => call('/api/spotify/create-playlist', { method: 'POST', body: b }),
  spotifyConnectUrl: '/api/spotify/connect',
  upload: (kind, blob, index = 0) => call(`/api/me/media?kind=${kind}&index=${index}`, { method: 'POST', raw: blob }),
  removeMedia: (kind, index = 0) => call(`/api/me/media?kind=${kind}&index=${index}`, { method: 'DELETE' }),
};

const MESSAGES = {
  wrong_login: 'That email and password don’t match.',
  email_taken: 'That email already has an account. Try logging in.',
  slug_taken: 'That page name is taken. Try another.',
  slug_or_email_taken: 'That email or page name is already in use.',
  invalid_slug: 'Page names use 3–30 letters, numbers or dashes.',
  invalid_email: 'Enter a valid email address.',
  invalid_field: 'Please check the highlighted fields.',
  rate_limited: 'Too many tries. Please wait a few minutes.',
  below_minimum: 'That tip is below the DJ’s minimum.',
  paused: 'This DJ isn’t taking requests right now.',
  network: 'Can’t reach the server. Check your connection.',
  ai_not_configured: 'The AI planner is not configured yet.',
  ai_bad_response: 'The AI planner returned an invalid plan. Try again.',
};
export const errorText = (e) => MESSAGES[e && e.code] || 'Something went wrong. Try again.';

// Flatten the API profile into the shape the guest page and theme helpers use.
export function toProfile(u) {
  const d = u.design || {};
  return {
    n: u.name, t: u.tagline, g: u.genres, m: u.min_tip,
    ...(u.pay || {}),
    ...d,
    logo: u.logo || null, wall: u.wall || null, ph: u.photos || [],
  };
}

// Shrink a picked image in the browser before upload so guests' phones load it fast.
export function shrink(file, max, type, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), type, quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}
export const copyText = async (t) => {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ } a.remove(); return ok;
  }
};
export const ago = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  return `${Math.round(s / 86400)} d ago`;
};
