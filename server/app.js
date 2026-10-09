import crypto from 'node:crypto';
import { hashPassword, verifyPassword, fakeVerify, newToken, tokenHash, parseCookies, limited } from './security.js';
import OpenAI from 'openai';
import { AI_PLAN_SYSTEM } from '../lib/aiPlanner.js';
import { songRows } from '../lib/songLibrary.js';
import { fetchMusicIntelligence, MUSIC_LANES, MUSIC_SUBGENRES } from '../lib/musicIntelligence.js';

const RESERVED = ['studio', 'login', 'signup', 'dashboard', 'api', 'admin', 'assets', 'media', 'privacy', 'terms', 'help', 'index', 'app', 'www'];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAY_KEYS = ['cash', 'venmo', 'paypal', 'zelle', 'apple'];
const BGS = ['midnight', 'navy', 'plum', 'black'];
const FONTS = ['bold', 'classic', 'street', 'clean'];
const METHODS = ['', 'cash', 'venmo', 'paypal', 'zelle', 'apple'];
const STATUSES = ['new', 'approved', 'declined', 'played'];
const SESSION_DAYS = 30;
const MAX_JSON = 100 * 1024;
const MAX_IMAGE = 2.5 * 1024 * 1024;
const HEX = /^#[0-9a-f]{6}$/i;

const SPOTIFY_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
].join(' ');

function spotifyRedirectUri(req) {
  if (process.env.SPOTIFY_REDIRECT_URI) return process.env.SPOTIFY_REDIRECT_URI;
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return proto + '://' + host + '/api/spotify/callback';
}

function spotifyState() {
  return Buffer.from(crypto.randomBytes(24)).toString('base64url');
}

function libraryKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function weddingPlanJson(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad('invalid_wedding_plan');
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > 90000) throw bad('wedding_plan_too_large', 413);
  return serialized;
}

async function spotifyToken(db, u) {
  if (!u?.spotify_access_token) throw bad('spotify_not_connected', 400);
  let access = u.spotify_access_token;
  if (Number(u.spotify_expires_at || 0) <= Date.now() + 60000) {
    if (!u.spotify_refresh_token) throw bad('spotify_reconnect_required', 401);
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: u.spotify_refresh_token, client_id: process.env.SPOTIFY_CLIENT_ID || '' });
    const auth = Buffer.from((process.env.SPOTIFY_CLIENT_ID || '') + ':' + (process.env.SPOTIFY_CLIENT_SECRET || '')).toString('base64');
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.access_token) { console.error('Spotify refresh error', data); throw bad('spotify_reconnect_required', 401); }
    access = data.access_token;
    await db.run('UPDATE users SET spotify_access_token = ?, spotify_expires_at = ? WHERE id = ?', [access, Date.now() + Number(data.expires_in || 3600) * 1000, u.id]);
  }
  return access;
}


class HttpError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
const bad = (code, status = 400) => new HttpError(status, code);

function send(res, status, body, headers = {}) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': buf.length, ...headers });
  res.end(buf);
}
async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw bad('too_large', 413);
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
async function readJson(req, limit = MAX_JSON) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw bad('json_required', 415);
  const raw = await readBody(req, limit);
  try { const v = JSON.parse(raw.toString('utf8') || '{}'); if (v && typeof v === 'object') return v; } catch {}
  throw bad('bad_json');
}
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const isHttps = (req) => req.socket.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
const str = (v, max, { min = 0, trim = true } = {}) => {
  let s = typeof v === 'string' ? v : '';
  if (trim) s = s.trim();
  if (s.length < min || s.length > max) throw bad('invalid_field');
  return s;
};
const json = (s, fallback) => { try { const v = JSON.parse(s); return v ?? fallback; } catch { return fallback; } };
const num = (v) => Number(v) || 0;

export function createApp(db) {
  const mediaUrl = (id) => (id ? `/media/${id}` : null);

  const privateProfile = (u) => ({
    id: u.id, email: u.email, slug: u.slug, name: u.dj_name, tagline: u.tagline, genres: u.genres, min_tip: num(u.min_tip),
    pay: json(u.pay_json, {}), design: json(u.design_json, {}), logo: mediaUrl(u.logo_media), wall: mediaUrl(u.wall_media),
    photos: json(u.photos_json, []).map(mediaUrl), is_live: !!u.is_live,
  });
  const publicProfile = (u) => { const p = privateProfile(u); delete p.email; delete p.id; return p; };

  async function userFromRequest(req) {
    const t = parseCookies(req.headers.cookie).rl_session;
    if (!t) return null;
    return db.get(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
      [tokenHash(t), Date.now()],
    );
  }
  const requireUser = async (req) => { const u = await userFromRequest(req); if (!u) throw bad('not_signed_in', 401); return u; };

  async function startSession(req, res, userId, status, body) {
    const token = newToken();
    const exp = Date.now() + SESSION_DAYS * 86400000;
    await db.run('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?,?,?)', [userId, tokenHash(token), exp]);
    await db.run('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
    const cookie = `rl_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${isHttps(req) ? '; Secure' : ''}`;
    send(res, status, body, { 'Set-Cookie': cookie });
  }

  const dupe = (e) => /ER_DUP_ENTRY|UNIQUE constraint failed/i.test(String(e && (e.code || e.message)));

  async function removeMedia(userId, id) {
    if (id) await db.run('DELETE FROM media WHERE id = ? AND user_id = ?', [id, userId]);
  }
  function sniff(buf) {
    if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
    return null;
  }
  const sameOrigin = (req) => {
    const o = req.headers.origin;
    if (!o) return true;
    try { return new URL(o).host === (req.headers['x-forwarded-host'] || req.headers.host); } catch { return false; }
  };

  // Returns true when it handled the request.
  return async function handle(req, res, url) {
    const path = url.pathname;
    const method = req.method;

    if (path.startsWith('/media/') && method === 'GET') {
      const id = Number(path.slice(7));
      const m = Number.isInteger(id) ? await db.get('SELECT mime, data FROM media WHERE id = ?', [id]) : null;
      if (!m) { res.writeHead(404); res.end(); return true; }
      const data = Buffer.from(m.data);
      res.writeHead(200, { 'Content-Type': m.mime, 'Content-Length': data.length, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
      return true;
    }
    if (!path.startsWith('/api/')) return false;

    try {
      if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(req)) throw bad('bad_origin', 403);
      const ip = clientIp(req);
      let m;

      if (path === '/api/wedding-plans' && method === 'GET') {
        const u = await requireUser(req);
        const rows = await db.all('SELECT id, share_token, plan_json, created_at, updated_at FROM wedding_plans WHERE owner_id = ? ORDER BY updated_at DESC', [u.id]);
        return send(res, 200, { plans: rows.map(row => ({ id: row.id, share_token: row.share_token, plan: json(row.plan_json, {}), created_at: Number(row.created_at), updated_at: Number(row.updated_at) })) }), true;
      }

      if (path === '/api/wedding-plans' && method === 'POST') {
        const u = await requireUser(req);
        const b = await readJson(req);
        const serialized = weddingPlanJson(b.plan);
        const token = crypto.randomBytes(32).toString('base64url');
        const now = Date.now();
        const row = await db.run('INSERT INTO wedding_plans (owner_id, share_token, plan_json, created_at, updated_at) VALUES (?,?,?,?,?)', [u.id, token, serialized, now, now]);
        return send(res, 201, { id: row.insertId, share_token: token, plan: JSON.parse(serialized), updated_at: now }), true;
      }

      m = path.match(/^\/api\/wedding-plans\/(\d+)$/);
      if (m && (method === 'GET' || method === 'PUT')) {
        const u = await requireUser(req);
        const row = await db.get('SELECT id, share_token, plan_json, created_at, updated_at FROM wedding_plans WHERE id = ? AND owner_id = ?', [Number(m[1]), u.id]);
        if (!row) throw bad('wedding_plan_not_found', 404);
        if (method === 'GET') return send(res, 200, { id: row.id, share_token: row.share_token, plan: json(row.plan_json, {}), updated_at: Number(row.updated_at) }), true;
        const b = await readJson(req);
        const serialized = weddingPlanJson(b.plan);
        const now = Date.now();
        await db.run('UPDATE wedding_plans SET plan_json = ?, updated_at = ? WHERE id = ? AND owner_id = ?', [serialized, now, row.id, u.id]);
        return send(res, 200, { id: row.id, share_token: row.share_token, plan: JSON.parse(serialized), updated_at: now }), true;
      }

      m = path.match(/^\/api\/wedding-share\/([A-Za-z0-9_-]{43})$/);
      if (m && (method === 'GET' || method === 'PUT')) {
        const row = await db.get('SELECT id, plan_json, updated_at FROM wedding_plans WHERE share_token = ?', [m[1]]);
        if (!row) throw bad('wedding_plan_not_found', 404);
        if (method === 'GET') return send(res, 200, { plan: json(row.plan_json, {}), updated_at: Number(row.updated_at) }), true;
        if (limited(`wedding-share:${m[1]}:${ip}`, 60, 3600000)) throw bad('rate_limited', 429);
        const b = await readJson(req);
        const serialized = weddingPlanJson(b.plan);
        const now = Date.now();
        await db.run('UPDATE wedding_plans SET plan_json = ?, updated_at = ? WHERE id = ?', [serialized, now, row.id]);
        return send(res, 200, { plan: JSON.parse(serialized), updated_at: now }), true;
      }

      if (path === '/api/ai/music-intelligence' && method === 'GET') {
        const u = await requireUser(req);
        const day = new Date().toISOString().slice(0, 10);
        if (!globalThis.__sidjMusicIntel) globalThis.__sidjMusicIntel = { day: null, data: null, promise: null };
        const cache = globalThis.__sidjMusicIntel;

        if (cache.day === day && cache.data) {
          return send(res, 200, { available: true, cached: true, ...cache.data, subgenres: MUSIC_SUBGENRES }), true;
        }
        if (limited(`music-intel:${u.id}`, 3, 86400000)) {
          return send(res, 200, { available: false, cached: true, lanes: MUSIC_LANES.map(({ key, label }) => ({ key, label, status: 'cached-limit', items: [] })), subgenres: MUSIC_SUBGENRES }), true;
        }
        if (!process.env.OPENAI_API_KEY) {
          return send(res, 200, { available: false, reason: 'ai_not_configured', lanes: MUSIC_LANES.map(({ key, label }) => ({ key, label, status: 'unavailable', items: [] })), subgenres: MUSIC_SUBGENRES }), true;
        }
        if (!cache.promise) {
          cache.promise = (async () => {
            const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const data = await fetchMusicIntelligence(client);
            cache.day = day;
            cache.data = data;
            return data;
          })().finally(() => { cache.promise = null; });
        }
        try {
          const data = await cache.promise;
          return send(res, 200, { available: true, cached: false, ...data, subgenres: MUSIC_SUBGENRES }), true;
        } catch (e) {
          console.error('SI DJ music intelligence refresh failed:', { message: e?.message, code: e?.code });
          return send(res, 200, {
            available: false,
            reason: 'music_intelligence_unavailable',
            lanes: MUSIC_LANES.map(({ key, label }) => ({ key, label, status: 'unavailable', items: [] })),
            subgenres: MUSIC_SUBGENRES
          }), true;
        }
      }

      if (path === '/api/ai/event-plan' && method === 'POST') {
        const u = await requireUser(req);
        if (limited(`ai-plan:${u.id}`, 20, 3600000)) throw bad('rate_limited', 429);
        const b = await readJson(req);
        const event = str(b.event, 2500, { min: 2 });

        let library;
        try {
          library = normalizePlannerLibrary(await db.all(
            'SELECT title, artist, genre, era, bpm, energy, dancefloor_score, singalong_score, crossgen_score, content, tags FROM songs WHERE active = 1 ORDER BY (dancefloor_score + singalong_score + crossgen_score) DESC, id ASC LIMIT 300'
          ));
        } catch (e) {
          console.error('AI planner library DB error:', { code: e?.code, message: e?.message });
          library = normalizePlannerLibrary(songRows().map((s) => ({
            title: s.title, artist: s.artist, genre: s.genre, era: s.era, bpm: s.bpm,
            energy: s.energy, dancefloor_score: s.dancefloor, singalong_score: s.singalong,
            crossgen_score: s.crossgen, content: s.content, tags: s.tags,
          })));
        }

        try {
          // Never let an empty/old songs table take the planner down. Rehydrate from the
          // bundled source library before deciding that the planner cannot run.
          if (library.length < 72) {
            console.warn('AI planner library below minimum; using bundled song library.', { count: library.length });
            library = normalizePlannerLibrary(songRows().map((s) => ({
              title: s.title, artist: s.artist, genre: s.genre, era: s.era, bpm: s.bpm,
              energy: s.energy, dancefloor_score: s.dancefloor, singalong_score: s.singalong,
              crossgen_score: s.crossgen, content: s.content, tags: s.tags,
            })));
          }
          if (library.length < 72) throw new Error('planner_library_too_small');
          if (!process.env.OPENAI_API_KEY) throw new Error('ai_not_configured');

          const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const model = process.env.OPENAI_MODEL || 'gpt-6-luna';
          const plannerInput = `EVENT:
${event}

CURATED DJREQUESTLIVE SONG LIBRARY (recommend only exact title/artist pairs from this data):
${JSON.stringify(library)}`;

          let lastFailure = null;
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              const response = await client.responses.create({
                model,
                instructions: AI_PLAN_SYSTEM + (attempt === 2
                  ? '\\nIMPORTANT RETRY: Return compact valid JSON only. Exactly 4 recommendation groups with exactly 10, 10, 42, 10 songs. Do not add commentary or markdown.'
                  : ''),
                input: plannerInput,
                max_output_tokens: 10000,
              });
              const raw = String(response.output_text || '').trim().replace(/^\`\`\`json\s*/i, '').replace(/\s*\`\`\`$/i, '');
              let plan;
              try { plan = JSON.parse(raw); } catch { throw new Error('invalid_json'); }
              validatePlannerPlan(plan, library);
              return send(res, 200, { plan, planner_source: 'ai' }), true;
            } catch (e) {
              lastFailure = e;
              console.error('AI planner attempt failed:', { attempt, message: e?.message, status: e?.status, code: e?.code });
            }
          }
          throw lastFailure || new Error('ai_planner_failed');
        } catch (e) {
          console.error('AI planner falling back to curated library:', { message: e?.message, code: e?.code });
          try {
            const fallback = buildFallbackPlanner(event, library);
            return send(res, 200, { plan: fallback, planner_source: 'curated_fallback', warning: 'ai_unavailable' }), true;
          } catch (fallbackError) {
            console.error('AI planner fallback failed:', fallbackError);
            return send(res, 503, { error: 'planner_unavailable', message: 'The planner could not generate a safe result from the curated library.' }), true;
          }
        }
      }

      if (path === '/api/spotify/connect' && method === 'GET') {
        const u = await requireUser(req);
        if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) throw bad('spotify_not_configured', 503);
        const state = spotifyState();
        const cookie = 'rl_spotify_state=' + state + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=600' + (isHttps(req) ? '; Secure' : '');
        const p = new URLSearchParams({ client_id: process.env.SPOTIFY_CLIENT_ID, response_type: 'code', redirect_uri: spotifyRedirectUri(req), scope: SPOTIFY_SCOPES, state, show_dialog: 'true' });
        res.writeHead(302, { Location: 'https://accounts.spotify.com/authorize?' + p.toString(), 'Set-Cookie': cookie, 'Cache-Control': 'no-store' });
        res.end();
        return true;
      }

      if (path === '/api/spotify/callback' && method === 'GET') {
        const state = String(url.searchParams.get('state') || '');
        const cookies = parseCookies(req.headers.cookie);
        if (!state || !cookies.rl_spotify_state || state !== cookies.rl_spotify_state) {
          res.writeHead(302, { Location: '/studio?spotify=error&reason=state', 'Set-Cookie': 'rl_spotify_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' }); res.end(); return true;
        }
        const u = await userFromRequest(req);
        if (!u) { res.writeHead(302, { Location: '/login?spotify=required' }); res.end(); return true; }
        const code = String(url.searchParams.get('code') || '');
        if (!code) { res.writeHead(302, { Location: '/studio?spotify=error&reason=denied' }); res.end(); return true; }
        const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: spotifyRedirectUri(req), client_id: process.env.SPOTIFY_CLIENT_ID || '' });
        const auth = Buffer.from((process.env.SPOTIFY_CLIENT_ID || '') + ':' + (process.env.SPOTIFY_CLIENT_SECRET || '')).toString('base64');
        const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.access_token) { console.error('Spotify token error', data); res.writeHead(302, { Location: '/studio?spotify=error&reason=token' }); res.end(); return true; }
        const meR = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: 'Bearer ' + data.access_token } });
        const me = await meR.json().catch(() => ({}));
        await db.run('UPDATE users SET spotify_access_token = ?, spotify_refresh_token = ?, spotify_expires_at = ?, spotify_account_id = ?, spotify_display_name = ? WHERE id = ?',
          [data.access_token, data.refresh_token || u.spotify_refresh_token || '', Date.now() + Number(data.expires_in || 3600) * 1000, me.account_id || '', me.display_name || '', u.id]);
        res.writeHead(302, { Location: '/studio?spotify=connected', 'Set-Cookie': 'rl_spotify_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' }); res.end();
        return true;
      }

      if (path === '/api/spotify/status' && method === 'GET') {
        const u = await requireUser(req);
        return send(res, 200, { connected: !!u.spotify_refresh_token || !!u.spotify_access_token, display_name: u.spotify_display_name || null }), true;
      }

      if (path === '/api/spotify/search' && method === 'GET') {
        const u = await requireUser(req);
        if (limited(`spotify-search:${u.id}`, 30, 60000)) throw bad('rate_limited', 429);
        const query = str(url.searchParams.get('q') || '', 120, { min: 2 });
        const access = await spotifyToken(db, u);
        const spotifyUrl = new URL('https://api.spotify.com/v1/search');
        spotifyUrl.searchParams.set('type', 'track');
        spotifyUrl.searchParams.set('limit', '20');
        spotifyUrl.searchParams.set('q', query);
        const r = await fetch(spotifyUrl, { headers: { Authorization: 'Bearer ' + access } });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw bad('spotify_api_error', 502);
        const tracks = [];
        for (const t of data.tracks?.items || []) {
          const title = String(t.name || '').slice(0, 255);
          const artist = String(t.artists?.map(a => a.name).join(', ') || '').slice(0, 255);
          const titleKey = libraryKey(title);
          const artistKeys = [...new Set([libraryKey(t.artists?.[0]?.name || artist), libraryKey(artist)])].filter(Boolean);
          const versions = titleKey && artistKeys.length ? await db.all(
            `SELECT title, artist, album, genre, bpm, year, file_type, duration_seconds, metadata_source FROM library_tracks WHERE user_id = ? AND title_key = ? AND artist_key IN (${artistKeys.map(() => '?').join(',')}) ORDER BY CASE WHEN file_type IN ('mp3','m4a','wav','flac','aiff','aac','ogg','wma','mp4','mov','m4v') THEN 0 ELSE 1 END, id DESC LIMIT 12`,
            [u.id, titleKey, ...artistKeys],
          ) : [];
          tracks.push({
            id: t.id, title, artist, album: t.album?.name || '', release_date: t.album?.release_date || '',
            duration_ms: Number(t.duration_ms) || 0, popularity: Number(t.popularity) || 0,
            uri: t.uri || null, url: t.external_urls?.spotify || null,
            owned: versions.length > 0, versions,
          });
        }
        return send(res, 200, { tracks, source: 'spotify_live' }), true;
      }

      if (path === '/api/library/import' && method === 'POST') {
        const u = await requireUser(req);
        const b = await readJson(req, 2 * 1024 * 1024);
        const tracks = Array.isArray(b.tracks) ? b.tracks : [];
        if (!tracks.length || tracks.length > 500) throw bad('invalid_library_batch');
        const clean = tracks.map((item) => {
          const title = str(item?.title, 255, { min: 1 });
          const artist = str(item?.artist ?? '', 255);
          const filePath = str(item?.file_path, 1500, { min: 1 });
          const titleKey = libraryKey(title);
          const artistKey = libraryKey(artist);
          const pathHash = crypto.createHash('sha256').update(filePath).digest('hex');
          return {
            title, artist, filePath, titleKey, artistKey, pathHash,
            album: str(item?.album ?? '', 255), genre: str(item?.genre ?? '', 120),
            bpm: Number.isFinite(Number(item?.bpm)) && item?.bpm !== '' ? Number(item.bpm) : null,
            year: str(String(item?.year ?? ''), 12), fileType: str(item?.file_type ?? '', 30).toLowerCase(),
            duration: Number.isInteger(Number(item?.duration_seconds)) && Number(item.duration_seconds) >= 0 ? Number(item.duration_seconds) : null,
            metadataSource: str(item?.metadata_source ?? '', 40),
          };
        });
        const scan = await db.run('INSERT INTO library_scans (user_id, track_count, created_at) VALUES (?,?,?)', [u.id, clean.length, Date.now()]);
        let imported = 0;
        for (const t of clean) {
          const sql = db.driver === 'sqlite'
            ? 'INSERT OR IGNORE INTO library_tracks (user_id, scan_id, artist, title, album, genre, bpm, year, file_type, duration_seconds, file_path, metadata_source, artist_key, title_key, path_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
            : 'INSERT IGNORE INTO library_tracks (user_id, scan_id, artist, title, album, genre, bpm, year, file_type, duration_seconds, file_path, metadata_source, artist_key, title_key, path_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
          const r = await db.run(sql, [u.id, scan.insertId, t.artist, t.title, t.album, t.genre, t.bpm, t.year, t.fileType, t.duration, t.filePath, t.metadataSource, t.artistKey, t.titleKey, t.pathHash]);
          imported += r.changes;
        }
        return send(res, 201, { scan_id: scan.insertId, imported, received: clean.length }), true;
      }

      if (path === '/api/library/summary' && method === 'GET') {
        const u = await requireUser(req);
        const row = await db.get('SELECT COUNT(*) AS tracks FROM library_tracks WHERE user_id = ?', [u.id]);
        const scan = await db.get('SELECT MAX(created_at) AS last_scan_at FROM library_scans WHERE user_id = ?', [u.id]);
        return send(res, 200, { tracks: Number(row?.tracks || 0), last_scan_at: scan?.last_scan_at || null }), true;
      }

      if (path === '/api/library/search' && method === 'GET') {
        const u = await requireUser(req);
        const q = libraryKey(str(url.searchParams.get('q') || '', 120, { min: 2 }));
        const like = `%${q}%`;
        const tracks = await db.all('SELECT title, artist, album, genre, bpm, year, file_type, duration_seconds, metadata_source FROM library_tracks WHERE user_id = ? AND (title_key LIKE ? OR artist_key LIKE ?) ORDER BY title, artist LIMIT 100', [u.id, like, like]);
        return send(res, 200, { tracks }), true;
      }

      if (path === '/api/spotify/playlists' && method === 'GET') {
        const u = await requireUser(req);
        const access = await spotifyToken(db, u);
        const items = [];
        let next = 'https://api.spotify.com/v1/me/playlists?limit=50';
        while (next && items.length < 500) {
          const r = await fetch(next, { headers: { Authorization: 'Bearer ' + access } });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw bad('spotify_api_error', 502);
          items.push(...(data.items || []));
          next = data.next;
        }
        return send(res, 200, { playlists: items.map(p => ({ id: p.id, name: p.name, public: p.public, collaborative: p.collaborative, tracks: p.items?.total ?? p.tracks?.total ?? 0, url: p.external_urls?.spotify || null })) }), true;
      }

      if (path === '/api/spotify/add-to-playlist' && method === 'POST') {
        const u = await requireUser(req);
        const access = await spotifyToken(db, u);
        const b = await readJson(req);
        const playlistId = str(b.playlist_id ?? '', 200, { min: 1 });
        const songs = Array.isArray(b.songs) ? b.songs.slice(0, 100) : [];
        if (!songs.length) throw bad('playlist_empty');
        const uris = [], missing = [];
        for (const song of songs) {
          const title = str(song?.title ?? '', 180, { min: 1 });
          const artist = str(song?.artist ?? '', 180, { min: 1 });
          const q = encodeURIComponent('track:' + title + ' artist:' + artist);
          const sr = await fetch('https://api.spotify.com/v1/search?type=track&limit=1&q=' + q, { headers: { Authorization: 'Bearer ' + access } });
          const data = await sr.json().catch(() => ({}));
          if (!sr.ok) throw bad('spotify_api_error', 502);
          const track = data.tracks?.items?.[0];
          if (track?.uri) uris.push(track.uri); else missing.push({ title, artist });
        }
        for (let i = 0; i < uris.length; i += 100) {
          const ar = await fetch('https://api.spotify.com/v1/playlists/' + encodeURIComponent(playlistId) + '/items', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' },
            body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
          });
          if (!ar.ok) { console.error('Spotify add existing playlist error', await ar.text().catch(() => '')); throw bad('spotify_api_error', 502); }
        }
        const pr = await fetch('https://api.spotify.com/v1/playlists/' + encodeURIComponent(playlistId), { headers: { Authorization: 'Bearer ' + access } });
        const playlist = await pr.json().catch(() => ({}));
        return send(res, 200, { playlist: { id: playlistId, name: playlist.name || 'Spotify playlist', url: playlist.external_urls?.spotify || null, added: uris.length, missing } }), true;
      }

      if (path === '/api/spotify/create-playlist' && method === 'POST') {
        const u = await requireUser(req);
        const access = await spotifyToken(db, u);
        const b = await readJson(req);
        const name = str(b.name, 100, { min: 1 });
        const description = str(b.description ?? 'Created with DJ Request Live', 300);
        const visibility = b.visibility === 'private' ? 'private' : b.visibility === 'collaborative' ? 'collaborative' : 'public';
        const songs = Array.isArray(b.songs) ? b.songs.slice(0, 100) : [];
        if (!songs.length) throw bad('playlist_empty');
        const uris = [], missing = [];
        for (const song of songs) {
          const title = str(song?.title ?? '', 180, { min: 1 });
          const artist = str(song?.artist ?? '', 180, { min: 1 });
          const q = encodeURIComponent('track:' + title + ' artist:' + artist);
          const r = await fetch('https://api.spotify.com/v1/search?type=track&limit=1&q=' + q, { headers: { Authorization: 'Bearer ' + access } });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw bad('spotify_api_error', 502);
          const track = data.tracks?.items?.[0];
          if (track?.uri) uris.push(track.uri); else missing.push({ title, artist });
        }
        const cr = await fetch('https://api.spotify.com/v1/me/playlists', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, public: visibility === 'public', collaborative: visibility === 'collaborative' }),
        });
        const playlist = await cr.json().catch(() => ({}));
        if (!cr.ok || !playlist.id) throw bad('spotify_api_error', 502);
        for (let i = 0; i < uris.length; i += 100) {
          const ar = await fetch('https://api.spotify.com/v1/playlists/' + encodeURIComponent(playlist.id) + '/items', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' },
            body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
          });
          if (!ar.ok) { console.error('Spotify add items error', await ar.text().catch(() => '')); throw bad('spotify_api_error', 502); }
        }
        return send(res, 200, { playlist: { id: playlist.id, name: playlist.name, url: playlist.external_urls?.spotify || null, added: uris.length, missing } }), true;
      }

      if (path === '/api/health' && method === 'GET') {
        await db.get('SELECT 1 AS ok');
        return send(res, 200, {
          ok: true,
          service: 'DJ Request Live API',
          database: db.driver,
          planner_version: 'failsafe-2026-10-07'
        }), true;
      }

      if (path === '/api/signup' && method === 'POST') {
        if (limited(`signup:${ip}`, 10, 3600000)) throw bad('rate_limited', 429);
        const b = await readJson(req);
        const name = str(b.name, 60, { min: 1 });
        const email = str(b.email, 255, { min: 3 }).toLowerCase();
        const password = str(b.password, 200, { min: 8, trim: false });
        const slug = str(b.slug, 30).toLowerCase();
        if (!EMAIL_RE.test(email)) throw bad('invalid_email');
        if (!SLUG_RE.test(slug) || RESERVED.includes(slug)) throw bad('invalid_slug');
        if (await db.get('SELECT id FROM users WHERE email = ?', [email])) throw bad('email_taken', 409);
        if (await db.get('SELECT id FROM users WHERE slug = ?', [slug])) throw bad('slug_taken', 409);
        let r;
        try {
          r = await db.run(
            'INSERT INTO users (email, password_hash, dj_name, slug, pay_json, design_json, photos_json, is_live, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
            [email, await hashPassword(password), name, slug, '{}', '{}', '[]', 1, Date.now()],
          );
        } catch (e) { if (dupe(e)) throw bad('slug_or_email_taken', 409); throw e; }
        const u = await db.get('SELECT * FROM users WHERE id = ?', [r.insertId]);
        return await startSession(req, res, u.id, 201, { user: privateProfile(u) }), true;
      }

      if (path === '/api/login' && method === 'POST') {
        if (limited(`login:${ip}`, 15, 900000)) throw bad('rate_limited', 429);
        const b = await readJson(req);
        const email = str(b.email, 255).toLowerCase();
        const u = await db.get('SELECT * FROM users WHERE email = ?', [email]);
        const ok = u ? await verifyPassword(String(b.password || ''), u.password_hash) : (await fakeVerify(), false);
        if (!ok) throw bad('wrong_login', 401);
        return await startSession(req, res, u.id, 200, { user: privateProfile(u) }), true;
      }

      if (path === '/api/logout' && method === 'POST') {
        const t = parseCookies(req.headers.cookie).rl_session;
        if (t) await db.run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash(t)]);
        return send(res, 200, { ok: true }, { 'Set-Cookie': 'rl_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' }), true;
      }

      if (path === '/api/me' && method === 'GET') {
        const u = await userFromRequest(req);
        return send(res, u ? 200 : 401, u ? { user: privateProfile(u) } : { error: 'not_signed_in' }), true;
      }

      if (path === '/api/me' && method === 'PUT') {
        const u = await requireUser(req);
        const b = await readJson(req);
        const pay = {};
        for (const k of PAY_KEYS) { const v = b.pay && b.pay[k]; if (typeof v === 'string' && v.trim()) pay[k] = str(v, 80); }
        const d = b.design && typeof b.design === 'object' ? b.design : {};
        const design = {};
        if (HEX.test(d.a || '')) design.a = d.a;
        if (HEX.test(d.gl || '')) design.gl = d.gl;
        if (BGS.includes(d.bg)) design.bg = d.bg;
        if (FONTS.includes(d.f)) design.f = d.f;
        design.v = d.v === 0 || d.v === false ? 0 : 1;
        if (typeof d.lb === 'string' && d.lb.trim()) design.lb = str(d.lb, 3);
        if (typeof d.live === 'string' && d.live.trim()) design.live = str(d.live, 40);
        if (typeof d.ig === 'string' && d.ig.trim()) { design.ig = str(d.ig, 40).replace(/^@/, ''); if (!/^[A-Za-z0-9._]+$/.test(design.ig)) throw bad('invalid_field'); }
        if (typeof d.tt === 'string' && d.tt.trim()) { design.tt = str(d.tt, 40).replace(/^@/, ''); if (!/^[A-Za-z0-9._]+$/.test(design.tt)) throw bad('invalid_field'); }
        if (typeof d.fb === 'string' && d.fb.trim()) { design.fb = str(d.fb, 200); if (!/^https?:\/\//i.test(design.fb) && !/^[A-Za-z0-9._-]+$/.test(design.fb.replace(/^@/, ''))) throw bad('invalid_field'); }
        if (typeof d.tips === 'string' && d.tips.trim()) { design.tips = str(d.tips, 30); if (!/^[\d.,\s]+$/.test(design.tips)) throw bad('invalid_field'); }
        if (d.ls !== undefined) { const logoSize = Number(d.ls); if (!Number.isFinite(logoSize) || logoSize < 140 || logoSize > 420) throw bad('invalid_field'); design.ls = Math.round(logoSize); }
        if (d.pls !== undefined) { const posterLogoSize = Number(d.pls); if (!Number.isFinite(posterLogoSize) || posterLogoSize < 400 || posterLogoSize > 900) throw bad('invalid_field'); design.pls = Math.round(posterLogoSize); }
        if (d.showName !== undefined) design.showName = d.showName !== false;
        const minTip = Math.round(num(b.min_tip) * 100) / 100;
        if (minTip < 0 || minTip > 10000) throw bad('invalid_field');
        await db.run(
          'UPDATE users SET dj_name = ?, tagline = ?, genres = ?, min_tip = ?, pay_json = ?, design_json = ?, is_live = ? WHERE id = ?',
          [str(b.name, 60, { min: 1 }), str(b.tagline ?? '', 200), str(b.genres ?? '', 160), minTip, JSON.stringify(pay), JSON.stringify(design), b.is_live === false || b.is_live === 0 ? 0 : 1, u.id],
        );
        return send(res, 200, { user: privateProfile(await db.get('SELECT * FROM users WHERE id = ?', [u.id])) }), true;
      }

      if (path === '/api/me/media' && (method === 'POST' || method === 'DELETE')) {
        const u = await requireUser(req);
        const kind = url.searchParams.get('kind');
        const idx = Number(url.searchParams.get('index') || 0);
        if (!['logo', 'wall', 'photo'].includes(kind) || !Number.isInteger(idx) || idx < 0 || idx > 2) throw bad('invalid_field');
        let newId = null;
        if (method === 'POST') {
          const buf = await readBody(req, MAX_IMAGE);
          const mime = sniff(buf);
          if (!mime) throw bad('unsupported_image', 415);
          if ((await db.get('SELECT COUNT(*) AS n FROM media WHERE user_id = ?', [u.id])).n >= 30) throw bad('too_many_images', 429);
          newId = (await db.run('INSERT INTO media (user_id, mime, data, created_at) VALUES (?,?,?,?)', [u.id, mime, buf, Date.now()])).insertId;
        }
        if (kind === 'photo') {
          const photos = json(u.photos_json, []);
          let old = null;
          if (method === 'POST') { old = photos[idx] || null; if (idx < photos.length) photos[idx] = newId; else photos.push(newId); }
          else { [old] = photos.splice(idx, 1); }
          await db.run('UPDATE users SET photos_json = ? WHERE id = ?', [JSON.stringify(photos.slice(0, 3)), u.id]);
          await removeMedia(u.id, old);
        } else {
          const col = kind === 'logo' ? 'logo_media' : 'wall_media';
          const old = u[col];
          await db.run(`UPDATE users SET ${col} = ? WHERE id = ?`, [newId, u.id]);
          await removeMedia(u.id, old);
        }
        return send(res, 200, { user: privateProfile(await db.get('SELECT * FROM users WHERE id = ?', [u.id])) }), true;
      }

      if (path === '/api/slug' && method === 'GET') {
        const s = String(url.searchParams.get('slug') || '').toLowerCase();
        const ok = SLUG_RE.test(s) && !RESERVED.includes(s) && !(await db.get('SELECT id FROM users WHERE slug = ?', [s]));
        return send(res, 200, { available: ok }), true;
      }

      if ((m = path.match(/^\/api\/dj\/([a-z0-9-]{3,30})$/)) && method === 'GET') {
        const u = await db.get('SELECT * FROM users WHERE slug = ?', [m[1]]);
        if (!u) throw bad('not_found', 404);
        return send(res, 200, { dj: publicProfile(u) }, { 'Cache-Control': 'no-cache' }), true;
      }

      if ((m = path.match(/^\/api\/dj\/([a-z0-9-]{3,30})\/requests$/)) && method === 'POST') {
        if (limited(`req:${ip}`, 20, 600000)) throw bad('rate_limited', 429);
        const u = await db.get('SELECT * FROM users WHERE slug = ?', [m[1]]);
        if (!u) throw bad('not_found', 404);
        const b = await readJson(req);
        if (typeof b.website === 'string' && b.website) return send(res, 201, { ok: true }), true; // spam trap
        if (!u.is_live) throw bad('paused', 403);
        const song = str(b.song, 120, { min: 1 });
        const artist = str(b.artist ?? '', 120);
        const guest = str(b.from ?? '', 60);
        const note = str(b.note ?? '', 200);
        const tip = Math.round(num(b.tip) * 100) / 100;
        const method = METHODS.includes(b.method) ? b.method : '';
        if (!(tip > 0 && tip <= 10000)) throw bad('invalid_tip');
        if (tip < num(u.min_tip)) throw bad('below_minimum');
        await db.run(
          'INSERT INTO requests (user_id, guest_name, song_title, artist, message, amount, method, created_at) VALUES (?,?,?,?,?,?,?,?)',
          [u.id, guest, song, artist, note, tip, method, Date.now()],
        );
        return send(res, 201, { ok: true }), true;
      }

      if (path === '/api/me/requests' && method === 'GET') {
        const u = await requireUser(req);
        const rows = await db.all('SELECT * FROM requests WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 300', [u.id]);
        return send(res, 200, { requests: rows.map(requestOut) }), true;
      }

      if ((m = path.match(/^\/api\/me\/requests\/(\d+)$/)) && (method === 'PATCH' || method === 'DELETE')) {
        const u = await requireUser(req);
        const id = Number(m[1]);
        const row = await db.get('SELECT * FROM requests WHERE id = ? AND user_id = ?', [id, u.id]);
        if (!row) throw bad('not_found', 404);
        if (method === 'DELETE') {
          await db.run('DELETE FROM requests WHERE id = ? AND user_id = ?', [id, u.id]);
          return send(res, 200, { ok: true }), true;
        }
        const b = await readJson(req);
        const status = b.status === undefined ? row.status : b.status;
        if (!STATUSES.includes(status)) throw bad('invalid_field');
        const paid = b.paid === undefined ? !!row.paid : !!b.paid;
        await db.run('UPDATE requests SET status = ?, paid = ?, played_at = ? WHERE id = ? AND user_id = ?',
          [status, paid ? 1 : 0, status === 'played' ? (row.played_at || Date.now()) : null, id, u.id]);
        return send(res, 200, { request: requestOut(await db.get('SELECT * FROM requests WHERE id = ?', [id])) }), true;
      }

      throw bad('not_found', 404);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.code }), true;
      console.error('API error:', { path, method, message: e?.message, stack: e?.stack });
      // The planner is explicitly fail-safe: never turn an unexpected planner exception
      // into the generic 500 page. The frontend can distinguish this from other API failures.
      if (path === '/api/ai/event-plan') {
        return send(res, 503, {
          error: 'planner_unavailable',
          message: 'The planner hit an unexpected server condition. Please retry.'
        }), true;
      }
      return send(res, 500, { error: 'server_error' }), true;
    }
  };
}


function normalizePlannerLibrary(rows) {
  return (Array.isArray(rows) ? rows : []).filter((s) =>
    s && typeof s.title === 'string' && typeof s.artist === 'string'
  ).map((s) => ({
    title: s.title, artist: s.artist, genre: s.genre, era: s.era, bpm: Number(s.bpm) || 0,
    energy: Number(s.energy) || 0, dancefloor_score: Number(s.dancefloor_score) || 0,
    singalong_score: Number(s.singalong_score) || 0, crossgen_score: Number(s.crossgen_score) || 0,
    content: s.content || 'Clean', tags: String(s.tags || ''),
  }));
}

function plannerKey(song) {
  return String(song?.title || '') + '\\u0000' + String(song?.artist || '');
}

function validatePlannerPlan(plan, library) {
  if (!plan || typeof plan !== 'object') throw new Error('plan_not_object');
  if (!Array.isArray(plan.music_mix) || !Array.isArray(plan.timeline) || !Array.isArray(plan.recommendations)) throw new Error('plan_missing_arrays');
  if (plan.recommendations.length !== 4) throw new Error('plan_wrong_phase_count');
  const allowed = new Set(library.map(plannerKey));
  const expected = [10, 10, 42, 10];
  let total = 0;
  for (let i = 0; i < plan.recommendations.length; i++) {
    const group = plan.recommendations[i];
    if (!group || typeof group !== 'object' || !Array.isArray(group.songs)) throw new Error('plan_bad_group');
    if (group.songs.length !== expected[i]) throw new Error('plan_wrong_song_count');
    total += group.songs.length;
    for (const song of group.songs) {
      if (!song || typeof song !== 'object' || typeof song.title !== 'string' || typeof song.artist !== 'string') throw new Error('plan_bad_song');
      if (!allowed.has(plannerKey(song))) throw new Error('plan_song_outside_library');
    }
  }
  if (total !== 72) throw new Error('plan_wrong_total');
  return plan;
}

function fallbackSongScore(song, event, phase) {
  const text = String(event || '').toLowerCase();
  const tags = String(song.tags || '').toLowerCase();
  let score = Number(song.dancefloor_score || 0) * 2 + Number(song.singalong_score || 0) + Number(song.crossgen_score || 0);
  if (/wedding|marriage|bride|groom|reception/.test(text) && /wedding|first-dance/.test(tags)) score += 24;
  if (/country|texas/.test(text) && /country|texas/.test(tags)) score += 18;
  if (/tejano|cumbia|regional mexican|mexican-american|latin/.test(text) && /tejano|cumbia|regional_mexican|latin|bridge/.test(tags)) score += 24;
  if (/mixed|cross.?generational|all ages|30.?60|family/.test(text) && Number(song.crossgen_score || 0) >= 9) score += 12;
  if (/current|new|2026/.test(text) && /current/.test(tags)) score += 8;
  if (phase === 'opening' && Number(song.energy || 0) <= 8) score += 8;
  if (phase === 'dinner' && Number(song.energy || 0) >= 5 && Number(song.energy || 0) <= 9) score += 6;
  if (phase === 'peak') score += Number(song.energy || 0) * 2;
  if (phase === 'closing' && /singalong|anthem|wedding|party/.test(tags)) score += 12;
  if (/family|wedding|corporate|school|mixed-age/.test(text) && String(song.content).toLowerCase() !== 'clean') score -= 40;
  if (/bridge/.test(tags) && /country|texas|tejano|cumbia|latin|mexican/.test(text)) score += 30;
  return score;
}

function buildFallbackPlanner(event, library) {
  const phases = [
    { phase: 'Reception Opening', role: 'opening', count: 10, reason: 'Warm the room with familiar, accessible records and establish the event identity without spending the peak-floor ammunition.' },
    { phase: 'Dinner / Early Dance', role: 'dinner', count: 10, reason: 'Open the dance floor gradually with recognizable records, wedding-safe favorites and culturally useful crossover.' },
    { phase: 'Peak Dance Floor', role: 'peak', count: 42, reason: 'Use the signature SI DJ 42 crate: proven hits, participation records, cross-generational favorites and bridge records for the specific room.' },
    { phase: 'Final Hour / Closing', role: 'closing', count: 10, reason: 'Finish with high-recognition singalongs, anthems and records that leave the room together.' },
  ];
  const used = new Set();
  const pick = (role, count) => {
    const ranked = [...library].sort((a, b) => fallbackSongScore(b, event, role) - fallbackSongScore(a, event, role));
    const out = [];
    for (const song of ranked) {
      const key = plannerKey(song);
      if (used.has(key)) continue;
      used.add(key);
      out.push({
        title: song.title,
        artist: song.artist,
        reason: /bridge_/.test(String(song.tags)) && /country|texas|tejano|cumbia|latin|mexican/i.test(event)
          ? 'Use this as a bridge between musical pockets rather than as a hard genre switch.'
          : 'Strong fit for this phase based on the curated DJ library scores and event context.',
      });
      if (out.length === count) break;
    }
    return out;
  };
  const recommendations = phases.map((p) => ({ phase: p.phase, reason: p.reason, songs: pick(p.role, p.count) }));
  if (recommendations.some((g) => g.songs.length !== g.count)) throw new Error('fallback_library_too_small');
  const mix = /country|texas/i.test(event) && /tejano|cumbia|latin|mexican/i.test(event)
    ? [
        { label: 'Country / Texas Country', percent: 30 },
        { label: 'Tejano / Cumbia / Regional Mexican', percent: 20 },
        { label: 'Latin Crossover', percent: 15 },
        { label: 'Pop, R&B & Dance', percent: 20 },
        { label: 'Rock, Disco & Singalongs', percent: 15 },
      ]
    : [
        { label: 'Core Event Favorites', percent: 35 },
        { label: 'Current & Crossover', percent: 20 },
        { label: 'Dance Floor', percent: 25 },
        { label: 'Cross-Generational', percent: 20 },
      ];
  return {
    title: 'Curated SI DJ Event Plan',
    summary: 'The AI planner was unavailable for this request, so SI DJ generated a production-safe plan directly from the curated music intelligence library. The plan preserves the requested 10 / 10 / 42 / 10 crate structure.',
    crowd_profile: 'Generated from the event brief and the curated DJ library; use the bridge records and crowd response to make final live decisions.',
    music_mix: mix,
    timeline: phases.map((p) => ({ phase: p.phase, direction: p.reason })),
    special_moments: [
      { moment: 'First Dance', music_direction: 'Confirm the couple-selected song and version in advance.' },
      { moment: 'Family / Cultural Moments', music_direction: 'Confirm family must-plays and preferred versions rather than guessing.' },
    ],
    recommendations,
    planner_source: 'curated_fallback',
  };
}

function requestOut(r) {
  return {
    id: r.id, song: r.song_title, artist: r.artist, from: r.guest_name, note: r.message, tip: Number(r.amount),
    method: r.method, status: r.status, paid: !!r.paid, created_at: Number(r.created_at),
  };
}
