import crypto from 'node:crypto';
import { hashPassword, verifyPassword, fakeVerify, newToken, tokenHash, parseCookies, limited } from './security.js';
import OpenAI from 'openai';
import { AI_PLAN_SYSTEM } from '../lib/aiPlanner.js';
import { songRows } from '../lib/songLibrary.js';
import { fetchMusicIntelligence, MUSIC_LANES, MUSIC_SUBGENRES } from '../lib/musicIntelligence.js';
import { searchSiDjKnowledge, siDjKnowledgeSummary, ensureSiDjKnowledge } from '../lib/siDjKnowledge.js';

const RESERVED = ['studio', 'login', 'signup', 'dashboard', 'api', 'admin', 'assets', 'media', 'privacy', 'terms', 'help', 'index', 'app', 'www', 'event-planner', 'event-plan'];
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

function eventPlanJson(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad('invalid_event_plan');
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > 90000) throw bad('event_plan_too_large', 413);
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
const normalizeLibraryQuery = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');


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
  async function recordSiDjBridgePlay(u, b) {
    const artist = str(b.artist || '', 255);
    const title = str(b.title || '', 500);
    if (!artist || !title) throw bad('invalid_field');
    const eventKey = str(b.event_key || '', 64, { min: 32 });
    const playedAt = Math.max(0, Number(b.played_at) || Date.now());
    const source = str(b.source || 'bridge', 60);
    const raw = str(b.raw || '', 1000);
    const eventType = str(b.event_type || '', 80);
    const eventMoment = str(b.event_moment || '', 160);
    const eventKeyContext = str(b.event_key_context || '', 160);

    try {
      await db.run(
        'INSERT INTO si_dj_play_history (user_id,event_key,played_at,artist,title,source,raw_line,event_type,event_moment,event_key_context,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [u.id,eventKey,playedAt,artist,title,source,raw,eventType,eventMoment,eventKeyContext,Date.now()]
      );
    } catch (e) {
      if (/duplicate|unique/i.test(String(e?.message || e?.code || ''))) {
        return { recorded: false, duplicate: true };
      }
      throw e;
    }

    const artistKey = normalizeLibraryQuery(artist);
    const titleKey = normalizeLibraryQuery(title);
    let track = await db.get(
      'SELECT * FROM si_dj_learning_tracks WHERE artist_key = ? AND title_key = ?',
      [artistKey, titleKey]
    );

    if (!track) {
      const made = await db.run(
        'INSERT INTO si_dj_learning_tracks (artist_key,title_key,artist,title,play_count,dj_count,last_played,first_played,created_at,updated_at) VALUES (?,?,?,?,1,0,?,?,?,?)',
        [artistKey,titleKey,artist,title,playedAt,playedAt,Date.now(),Date.now()]
      );
      track = await db.get('SELECT * FROM si_dj_learning_tracks WHERE id = ?', [made.insertId]);
    } else {
      await db.run(
        'UPDATE si_dj_learning_tracks SET play_count = play_count + 1, last_played = ?, updated_at = ? WHERE id = ?',
        [playedAt,Date.now(),track.id]
      );
    }

    const knownDj = await db.get(
      'SELECT track_id FROM si_dj_learning_track_djs WHERE track_id = ? AND user_id = ?',
      [track.id,u.id]
    );
    if (knownDj) {
      await db.run(
        'UPDATE si_dj_learning_track_djs SET play_count = play_count + 1, last_played = ? WHERE track_id = ? AND user_id = ?',
        [playedAt,track.id,u.id]
      );
    } else {
      await db.run(
        'INSERT INTO si_dj_learning_track_djs (track_id,user_id,first_played,last_played,play_count) VALUES (?,?,?,?,1)',
        [track.id,u.id,playedAt,playedAt]
      );
      await db.run('UPDATE si_dj_learning_tracks SET dj_count = dj_count + 1 WHERE id = ?', [track.id]);
    }


    if (eventType) {
      const context = await db.get(
        'SELECT * FROM si_dj_learning_context WHERE track_id = ? AND event_type = ? AND event_moment = ?',
        [track.id,eventType,eventMoment]
      );
      if (context) {
        await db.run(
          'UPDATE si_dj_learning_context SET play_count = play_count + 1,last_played = ? WHERE track_id = ? AND event_type = ? AND event_moment = ?',
          [playedAt,track.id,eventType,eventMoment]
        );
      } else {
        await db.run(
          'INSERT INTO si_dj_learning_context (track_id,event_type,event_moment,play_count,dj_count,last_played) VALUES (?,?,?,?,?,?)',
          [track.id,eventType,eventMoment,1,1,playedAt]
        );
      }
    }

    const previous = await db.get(
      'SELECT artist,title,played_at FROM si_dj_play_history WHERE user_id = ? ORDER BY played_at DESC,id DESC LIMIT 1 OFFSET 1',
      [u.id]
    );
    let transition = null;
    if (previous) {
      const from = await db.get(
        'SELECT id FROM si_dj_learning_tracks WHERE artist_key = ? AND title_key = ?',
        [normalizeLibraryQuery(previous.artist),normalizeLibraryQuery(previous.title)]
      );
      if (from && Number(from.id) !== Number(track.id)) {
        const existing = await db.get(
          'SELECT * FROM si_dj_learning_transitions WHERE from_track_id = ? AND to_track_id = ?',
          [from.id,track.id]
        );
        if (existing) {
          await db.run(
            'UPDATE si_dj_learning_transitions SET transition_count = transition_count + 1, last_played = ? WHERE from_track_id = ? AND to_track_id = ?',
            [playedAt,from.id,track.id]
          );
        } else {
          await db.run(
            'INSERT INTO si_dj_learning_transitions (from_track_id,to_track_id,transition_count,dj_count,last_played) VALUES (?,?,1,0,?)',
            [from.id,track.id,playedAt]
          );
        }
        const tdj = await db.get(
          'SELECT * FROM si_dj_learning_transition_djs WHERE from_track_id = ? AND to_track_id = ? AND user_id = ?',
          [from.id,track.id,u.id]
        );
        if (tdj) {
          await db.run(
            'UPDATE si_dj_learning_transition_djs SET play_count = play_count + 1,last_seen = ? WHERE from_track_id = ? AND to_track_id = ? AND user_id = ?',
            [playedAt,from.id,track.id,u.id]
          );
        } else {
          await db.run(
            'INSERT INTO si_dj_learning_transition_djs (from_track_id,to_track_id,user_id,first_seen,last_seen,play_count) VALUES (?,?,?,?,?,1)',
            [from.id,track.id,u.id,playedAt,playedAt]
          );
          await db.run(
            'UPDATE si_dj_learning_transitions SET dj_count = dj_count + 1 WHERE from_track_id = ? AND to_track_id = ?',
            [from.id,track.id]
          );
        }
        transition = { from_artist: previous.artist, from_title: previous.title, to_artist: artist, to_title: title };
      }
    }

    return {
      recorded: true,
      duplicate: false,
      track: { artist, title, play_count: Number(track.play_count || 0) + 1, dj_count: Number(track.dj_count || 0) + (knownDj ? 0 : 1) },
      transition
    };
  }


  async function buildSiDjEventMemory(u, b) {
    const eventType = str(b.event_type || '', 80, { min: 1 });
    const eventName = str(b.event_name || '', 180, { min: 1 });
    const venue = str(b.venue || '', 180);
    const eventDate = str(b.event_date || '', 10, { min: 1 });
    const eventKey = str(b.event_key || '', 64, { min: 32 });
    const closedAt = Math.max(0, Number(b.closed_at) || Date.now());
    const selections = b.selections && typeof b.selections === 'object' ? b.selections : {};
    const done = b.done && typeof b.done === 'object' ? b.done : {};

    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(eventDate)) throw bad('invalid_field');

    const start = new Date(eventDate + 'T00:00:00').getTime();
    const end = start + 86400000;
    if (!Number.isFinite(start)) throw bad('invalid_field');

    const normalizeSong = (artist, title) => ({
      artist: String(artist || '').trim(),
      title: String(title || '').trim(),
      artist_key: normalizeLibraryQuery(artist),
      title_key: normalizeLibraryQuery(title)
    });
    const planned = new Map();
    for (const [moment, songs] of Object.entries(selections)) {
      if (!Array.isArray(songs)) continue;
      for (const song of songs.slice(0, 500)) {
        const x = normalizeSong(song?.artist, song?.title);
        if (!x.artist_key || !x.title_key) continue;
        const key = x.artist_key + '\\u0000' + x.title_key;
        const row = planned.get(key) || { ...x, planned_count: 0, moments: new Set() };
        row.planned_count += 1;
        if (moment) row.moments.add(String(moment).slice(0,160));
        planned.set(key, row);
      }
    }

    const plays = await db.all(
      `SELECT artist,title,played_at,event_moment
       FROM si_dj_play_history
       WHERE user_id = ? AND event_key_context = ? AND played_at >= ? AND played_at < ?
       ORDER BY played_at ASC,id ASC`,
      [u.id,eventName,start,end]
    );
    const played = new Map();
    for (const p of plays) {
      const x = normalizeSong(p.artist,p.title);
      if (!x.artist_key || !x.title_key) continue;
      const key = x.artist_key + '\\u0000' + x.title_key;
      const row = played.get(key) || { ...x, played_count: 0, first_played: Number(p.played_at) || null, last_played: Number(p.played_at) || null, moments: new Set() };
      row.played_count += 1;
      row.first_played = row.first_played || Number(p.played_at) || null;
      row.last_played = Number(p.played_at) || row.last_played;
      if (p.event_moment) row.moments.add(String(p.event_moment).slice(0,160));
      played.set(key,row);
    }

    const requests = await db.all(
      `SELECT song_title,artist,COUNT(*) AS request_count
       FROM requests
       WHERE user_id = ? AND created_at >= ? AND created_at < ?
       GROUP BY song_title,artist
       ORDER BY request_count DESC`,
      [u.id,start,end]
    );
    const requestMap = new Map();
    let repeatRequestCount = 0;
    for (const r of requests) {
      const x = normalizeSong(r.artist,r.song_title);
      if (!x.title_key) continue;
      const count = Number(r.request_count || 0);
      const key = x.artist_key + '\\u0000' + x.title_key;
      requestMap.set(key,count);
      if (count > 1) repeatRequestCount += count - 1;
    }

    const allKeys = new Set([...planned.keys(), ...played.keys(), ...requestMap.keys()]);
    const tracks = [];
    for (const key of allKeys) {
      const p = planned.get(key);
      const q = played.get(key);
      const requestCount = Number(requestMap.get(key) || 0);
      tracks.push({
        artist: p?.artist || q?.artist || '',
        title: p?.title || q?.title || '',
        artist_key: p?.artist_key || q?.artist_key || '',
        title_key: p?.title_key || q?.title_key || '',
        moments: [...new Set([...(p?.moments || []), ...(q?.moments || [])])],
        planned_count: Number(p?.planned_count || 0),
        played_count: Number(q?.played_count || 0),
        request_count: requestCount,
        first_played: q?.first_played || null,
        last_played: q?.last_played || null
      });
    }
    tracks.sort((a,b) => b.played_count - a.played_count || b.request_count - a.request_count || b.planned_count - a.planned_count);

    const plannedTrackCount = [...planned.values()].reduce((n,x) => n + x.planned_count, 0);
    const playedTrackCount = plays.length;
    const uniquePlayedCount = played.size;
    const plannedPlayedCount = tracks.filter(x => x.planned_count > 0 && x.played_count > 0).reduce((n,x) => n + x.played_count, 0);
    const unplannedPlayedCount = tracks.filter(x => x.planned_count === 0 && x.played_count > 0).reduce((n,x) => n + x.played_count, 0);
    const completionPct = plannedTrackCount ? Math.min(100, Math.round((plannedPlayedCount / plannedTrackCount) * 10000) / 100) : 0;
    const repeatedTracks = tracks.filter(x => x.played_count > 1).slice(0,20);
    const repeatedRequests = tracks.filter(x => x.request_count > 1).slice(0,20);
    const worked = tracks.filter(x => x.played_count > 0 || x.request_count > 0).slice(0,50);
    const skipped = tracks.filter(x => x.planned_count > 0 && x.played_count === 0).slice(0,50);

    const summary = {
      version: 1,
      evidence: ['played_history','event_plan','guest_requests'],
      event: { type:eventType, name:eventName, venue, date:eventDate },
      totals: { planned_tracks:plannedTrackCount, played_tracks:playedTrackCount, unique_played:uniquePlayedCount, planned_played:plannedPlayedCount, unplanned_played:unplannedPlayedCount, completion_pct:completionPct, repeat_request_count:repeatRequestCount },
      worked,
      skipped,
      repeated_tracks: repeatedTracks,
      repeated_requests: repeatedRequests
    };

    let memory = await db.get('SELECT id FROM si_dj_event_memory WHERE user_id = ? AND event_key = ?', [u.id,eventKey]);
    if (memory) {
      await db.run(
        `UPDATE si_dj_event_memory
         SET event_type=?,event_name=?,venue=?,event_date=?,closed_at=?,planned_track_count=?,played_track_count=?,unique_played_count=?,planned_played_count=?,unplanned_played_count=?,completion_pct=?,repeat_request_count=?,summary_json=?,updated_at=?
         WHERE id=? AND user_id=?`,
        [eventType,eventName,venue,eventDate,closedAt,plannedTrackCount,playedTrackCount,uniquePlayedCount,plannedPlayedCount,unplannedPlayedCount,completionPct,repeatRequestCount,JSON.stringify(summary),Date.now(),memory.id,u.id]
      );
      await db.run('DELETE FROM si_dj_event_memory_tracks WHERE memory_id = ?', [memory.id]);
    } else {
      const made = await db.run(
        `INSERT INTO si_dj_event_memory
         (user_id,event_key,event_type,event_name,venue,event_date,closed_at,planned_track_count,played_track_count,unique_played_count,planned_played_count,unplanned_played_count,completion_pct,repeat_request_count,summary_json,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [u.id,eventKey,eventType,eventName,venue,eventDate,closedAt,plannedTrackCount,playedTrackCount,uniquePlayedCount,plannedPlayedCount,unplannedPlayedCount,completionPct,repeatRequestCount,JSON.stringify(summary),Date.now(),Date.now()]
      );
      memory = { id: made.insertId };
    }

    for (const t of tracks) {
      if (!t.artist_key || !t.title_key) continue;
      await db.run(
        `INSERT INTO si_dj_event_memory_tracks
         (memory_id,artist_key,title_key,artist,title,moments_json,planned_count,played_count,request_count,first_played,last_played)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [memory.id,t.artist_key,t.title_key,t.artist,t.title,JSON.stringify(t.moments),t.planned_count,t.played_count,t.request_count,t.first_played,t.last_played]
      );
    }

    // Consolidate the temporary event buffer into durable SI DJ learning context.
    // Played counts are already written by the Bridge; this pass adds the durable
    // event-plan and guest-request signals before the temporary event rows are purged.
    for (const t of tracks) {
      if (!t.artist_key || !t.title_key) continue;
      let masterTrack = await db.get(
        'SELECT * FROM si_dj_learning_tracks WHERE artist_key = ? AND title_key = ?',
        [t.artist_key, t.title_key]
      );
      if (!masterTrack) {
        const made = await db.run(
          'INSERT INTO si_dj_learning_tracks (artist_key,title_key,artist,title,play_count,dj_count,last_played,first_played,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [t.artist_key,t.title_key,t.artist,t.title,Number(t.played_count || 0),0,t.last_played || null,t.first_played || null,Date.now(),Date.now()]
        );
        masterTrack = await db.get('SELECT * FROM si_dj_learning_tracks WHERE id = ?', [made.insertId]);
      }

      const moments = t.moments.length ? t.moments : [''];
      for (const moment of moments) {
        const existing = await db.get(
          'SELECT * FROM si_dj_learning_context WHERE track_id = ? AND event_type = ? AND event_moment = ?',
          [masterTrack.id,eventType,String(moment).slice(0,160)]
        );
        if (existing) {
          await db.run(
            'UPDATE si_dj_learning_context SET planned_count = planned_count + ?, request_count = request_count + ?, event_count = event_count + 1, last_played = CASE WHEN ? > COALESCE(last_played,0) THEN ? ELSE last_played END WHERE track_id = ? AND event_type = ? AND event_moment = ?',
            [Number(t.planned_count || 0),Number(t.request_count || 0),Number(t.last_played || 0),Number(t.last_played || 0),masterTrack.id,eventType,String(moment).slice(0,160)]
          );
        } else {
          await db.run(
            'INSERT INTO si_dj_learning_context (track_id,event_type,event_moment,play_count,dj_count,last_played,planned_count,request_count,event_count) VALUES (?,?,?,?,?,?,?,?,?)',
            [masterTrack.id,eventType,String(moment).slice(0,160),Number(t.played_count || 0),0,t.last_played || null,Number(t.planned_count || 0),Number(t.request_count || 0),1]
          );
        }
      }
    }

    // The event has now been distilled into SI DJ's durable learning tables.
    // Do not retain the raw event-memory payload after successful consolidation.
    await db.run('DELETE FROM si_dj_event_memory_tracks WHERE memory_id = ?', [memory.id]);
    await db.run('DELETE FROM si_dj_event_memory WHERE id = ? AND user_id = ?', [memory.id,u.id]);

    return { memory: null, consolidated: true, purged: true, event: { event_key:eventKey, event_type:eventType, event_name:eventName, venue, event_date:eventDate, totals:summary.totals }, worked, skipped, repeated_tracks:repeatedTracks, repeated_requests:repeatedRequests };
  }


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

      if (path === '/api/event-plans' && method === 'GET') {
        const u = await requireUser(req);
        const rows = await db.all('SELECT id, share_token, plan_json, created_at, updated_at FROM event_plans WHERE owner_id = ? ORDER BY updated_at DESC', [u.id]);
        return send(res, 200, { plans: rows.map(row => ({ id: row.id, share_token: row.share_token, plan: json(row.plan_json, {}), created_at: Number(row.created_at), updated_at: Number(row.updated_at) })) }), true;
      }

      if (path === '/api/event-plans' && method === 'POST') {
        const u = await requireUser(req);
        const b = await readJson(req);
        const serialized = eventPlanJson(b.plan);
        const token = crypto.randomBytes(32).toString('base64url');
        const now = Date.now();
        const row = await db.run('INSERT INTO event_plans (owner_id, share_token, plan_json, created_at, updated_at) VALUES (?,?,?,?,?)', [u.id, token, serialized, now, now]);
        return send(res, 201, { id: row.insertId, share_token: token, plan: JSON.parse(serialized), updated_at: now }), true;
      }

      m = path.match(/^\/api\/event-plans\/(\d+)$/);
      if (m && (method === 'GET' || method === 'PUT')) {
        const u = await requireUser(req);
        const row = await db.get('SELECT id, share_token, plan_json, created_at, updated_at FROM event_plans WHERE id = ? AND owner_id = ?', [Number(m[1]), u.id]);
        if (!row) throw bad('event_plan_not_found', 404);
        if (method === 'GET') return send(res, 200, { id: row.id, share_token: row.share_token, plan: json(row.plan_json, {}), updated_at: Number(row.updated_at) }), true;
        const b = await readJson(req);
        const serialized = eventPlanJson(b.plan);
        const now = Date.now();
        await db.run('UPDATE event_plans SET plan_json = ?, updated_at = ? WHERE id = ? AND owner_id = ?', [serialized, now, row.id, u.id]);
        return send(res, 200, { id: row.id, share_token: row.share_token, plan: JSON.parse(serialized), updated_at: now }), true;
      }

      m = path.match(/^\/api\/event-share\/([A-Za-z0-9_-]{43})$/);
      if (m && (method === 'GET' || method === 'PUT')) {
        const row = await db.get('SELECT id, plan_json, updated_at FROM event_plans WHERE share_token = ?', [m[1]]);
        if (!row) throw bad('event_plan_not_found', 404);
        if (method === 'GET') return send(res, 200, { plan: json(row.plan_json, {}), updated_at: Number(row.updated_at) }), true;
        if (limited(`event-share:${m[1]}:${ip}`, 60, 3600000)) throw bad('rate_limited', 429);
        const b = await readJson(req);
        const serialized = eventPlanJson(b.plan);
        const now = Date.now();
        await db.run('UPDATE event_plans SET plan_json = ?, updated_at = ? WHERE id = ?', [serialized, now, row.id]);
        return send(res, 200, { plan: JSON.parse(serialized), updated_at: now }), true;
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


      if (path === '/api/si-dj/event-memory' && method === 'POST') {
        const u = await requireUser(req);
        const b = await readJson(req);
        const result = await buildSiDjEventMemory(u, b);
        return send(res, 200, result), true;
      }

      if (path === '/api/si-dj/event-memory' && method === 'GET') {
        const u = await requireUser(req);
        const eventKey = String(url.searchParams.get('event_key') || '').trim();
        const eventType = String(url.searchParams.get('event_type') || '').trim();
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20),1),100);
        const where = ['user_id = ?'];
        const params = [u.id];
        if (eventKey) { where.push('event_key = ?'); params.push(eventKey); }
        if (eventType) { where.push('event_type = ?'); params.push(eventType); }
        params.push(limit);
        const rows = await db.all(
          `SELECT id,event_key,event_type,event_name,venue,event_date,closed_at,planned_track_count,played_track_count,unique_played_count,planned_played_count,unplanned_played_count,completion_pct,repeat_request_count,summary_json,updated_at
           FROM si_dj_event_memory
           WHERE ${where.join(' AND ')}
           ORDER BY event_date DESC,updated_at DESC
           LIMIT ?`,
          params
        );
        return send(res,200,{memories:rows.map(r=>({...r,summary:json(r.summary_json,{})}))}),true;
      }

      if (path === '/api/si-dj/event-memory/tracks' && method === 'GET') {
        const u = await requireUser(req);
        const eventType = String(url.searchParams.get('event_type') || '').trim();
        const eventMoment = String(url.searchParams.get('event_moment') || '').trim();
        const q = normalizeLibraryQuery(url.searchParams.get('q') || '');
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100),1),300);
        const rows = await db.all(
          `SELECT t.artist,t.title,t.planned_count,t.played_count,t.request_count,t.moments_json,m.event_type,m.event_name,m.event_date
           FROM si_dj_event_memory_tracks t
           JOIN si_dj_event_memory m ON m.id=t.memory_id
           WHERE m.user_id = ?
             AND (? = '' OR m.event_type = ?)
             AND (? = '' OR t.moments_json LIKE ?)
             AND (? = '' OR t.artist_key LIKE ? OR t.title_key LIKE ?)
           ORDER BY t.played_count DESC,t.request_count DESC,m.event_date DESC
           LIMIT ?`,
          [u.id,eventType,eventType,eventMoment,'%' + eventMoment + '%',q,'%' + q + '%','%' + q + '%',limit]
        );
        return send(res,200,{tracks:rows.map(r=>({...r,moments:json(r.moments_json,[])}))}),true;
      }


      if (path === '/api/si-dj/plays' && method === 'POST') {
        const u = await requireUser(req);
        const b = await readJson(req);
        const result = await recordSiDjBridgePlay(u, b);
        return send(res, 200, result), true;
      }

      if (path === '/api/si-dj/learning' && method === 'GET') {
        const u = await requireUser(req);
        const q = normalizeLibraryQuery(url.searchParams.get('q') || '');
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 200);
        const rows = await db.all(
          `SELECT t.artist,t.title,d.play_count,1 AS dj_count,d.last_played
           FROM si_dj_learning_track_djs d
           JOIN si_dj_learning_tracks t ON t.id = d.track_id
           WHERE d.user_id = ? AND (? = '' OR t.artist_key LIKE ? OR t.title_key LIKE ?)
           ORDER BY d.play_count DESC,d.last_played DESC
           LIMIT ?`,
          [u.id,q,'%' + q + '%','%' + q + '%',limit]
        );
        return send(res, 200, { learning: rows }), true;
      }

      if (path === '/api/si-dj/knowledge' && method === 'GET') {
        const u = await requireUser(req);
        await ensureSiDjKnowledge();
        const q = String(url.searchParams.get('q') || '').trim();
        const artist = String(url.searchParams.get('artist') || '').trim();
        const genre = String(url.searchParams.get('genre') || '').trim();
        const era = String(url.searchParams.get('era') || '').trim();
        const fromArtist = String(url.searchParams.get('from_artist') || '').trim();
        const fromMoment = String(url.searchParams.get('event_moment') || '').trim();
        const eventType = String(url.searchParams.get('event_type') || '').trim();

        const fromTitle = String(url.searchParams.get('from_title') || '').trim();
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500);
        const tracks = searchSiDjKnowledge({ q, artist, genre, era, limit });
        const learned = await db.all(
          `SELECT t.artist,t.title,d.play_count,d.last_played
           FROM si_dj_learning_track_djs d
           JOIN si_dj_learning_tracks t ON t.id = d.track_id
           WHERE d.user_id = ?
           ORDER BY d.play_count DESC,d.last_played DESC
           LIMIT 1000`,
          [u.id]
        );
        const learnedMap = new Map(learned.map((x) => [normalizeLibraryQuery(x.artist) + '\\u0000' + normalizeLibraryQuery(x.title), x]));
        let transitionMap = new Map();
        if (fromArtist && fromTitle) {
          const from = await db.get(
            'SELECT id FROM si_dj_learning_tracks WHERE artist_key = ? AND title_key = ?',
            [normalizeLibraryQuery(fromArtist), normalizeLibraryQuery(fromTitle)]
          );
          if (from) {
            const rows = await db.all(
              `SELECT t.artist,t.title,td.play_count AS transition_count,td.last_seen AS last_played
               FROM si_dj_learning_transition_djs td
               JOIN si_dj_learning_tracks t ON t.id = td.to_track_id
               WHERE td.from_track_id = ? AND td.user_id = ?
               ORDER BY td.play_count DESC,td.last_seen DESC
               LIMIT 200`,
              [from.id,u.id]
            );
            transitionMap = new Map(rows.map((x) => [normalizeLibraryQuery(x.artist) + '\\u0000' + normalizeLibraryQuery(x.title), x]));
          }
        }

        let contextMap = new Map();
        {
          const contextRows = await db.all(
            `SELECT artist,title,COUNT(*) AS play_count,MAX(played_at) AS last_played
             FROM si_dj_play_history
             WHERE user_id = ? AND (? = '' OR event_type = ?) AND (? = '' OR event_moment = ?)
             GROUP BY artist,title
             ORDER BY play_count DESC,last_played DESC
             LIMIT 1000`,
            [u.id,eventType,eventType,fromMoment,fromMoment]
          );
          contextMap = new Map(contextRows.map((x) => [
            normalizeLibraryQuery(x.artist) + '\\u0000' + normalizeLibraryQuery(x.title), x
          ]));
        }


        let eventMemoryMap = new Map();
        {
          // Read only this DJ's completed events: songs planned, played, and requested.
          const memoryRows = await db.all(
            `SELECT t.artist,t.title,
                    SUM(t.played_count) AS memory_play_count,
                    COUNT(DISTINCT m.id) AS memory_event_count,
                    SUM(t.request_count) AS memory_request_count,
                    SUM(t.planned_count) AS memory_planned_count
             FROM si_dj_event_memory_tracks t
             JOIN si_dj_event_memory m ON m.id = t.memory_id
             WHERE m.user_id = ? AND (? = '' OR m.event_type = ?)
               AND (? = '' OR t.moments_json LIKE ?)
             GROUP BY t.artist_key,t.title_key,t.artist,t.title
             ORDER BY memory_play_count DESC,memory_request_count DESC
             LIMIT 1000`,
            [u.id,eventType,eventType,fromMoment,`%${fromMoment}%`]
          );
          eventMemoryMap = new Map(memoryRows.map((x) => [
            normalizeLibraryQuery(x.artist) + '\\u0000' + normalizeLibraryQuery(x.title), x
          ]));
        }

        const enriched = tracks.map((track) => {
          const key = normalizeLibraryQuery(track.artist) + '\\u0000' + normalizeLibraryQuery(track.title);
          const live = learnedMap.get(key);
          const transition = transitionMap.get(key);
          const playCount = Number(live?.play_count || 0);
          const djCount = live ? 1 : 0;
          const transitionCount = Number(transition?.transition_count || 0);
          const context = contextMap.get(key);
          const contextPlayCount = Number(context?.play_count || 0);
          const contextDjCount = context ? 1 : 0;
          const eventMemory = eventMemoryMap.get(key);
          const eventMemoryPlayCount = Number(eventMemory?.memory_play_count || 0);
          const eventMemoryEventCount = Number(eventMemory?.memory_event_count || 0);
          const eventMemoryRequestCount = Number(eventMemory?.memory_request_count || 0);
          const eventMemoryPlannedCount = Number(eventMemory?.memory_planned_count || 0);
          return {
            ...track,
            live_play_count: playCount,
            live_dj_count: djCount,
            live_last_played: Number(live?.last_played || 0),
            live_transition_count: transitionCount,
            live_transition_dj_count: Number(transition?.dj_count || 0),
            live_learning_score: Math.min(40, Math.log1p(playCount) * 4 + Math.log1p(djCount) * 6),
            live_transition_score: Math.min(35, Math.log1p(transitionCount) * 10),
            event_play_count: contextPlayCount,
            event_dj_count: contextDjCount,
            event_learning_score: Math.min(45, Math.log1p(contextPlayCount) * 7 + Math.log1p(contextDjCount) * 8),
            event_memory_play_count: eventMemoryPlayCount,
            event_memory_event_count: eventMemoryEventCount,
            event_memory_request_count: eventMemoryRequestCount,
            event_memory_planned_count: eventMemoryPlannedCount,
            event_memory_score: Math.min(50, Math.log1p(eventMemoryPlayCount) * 10 + Math.log1p(eventMemoryEventCount) * 7 + Math.log1p(eventMemoryRequestCount) * 5)
          };
        });
        return send(res, 200, { knowledge: { ...siDjKnowledgeSummary(), live_learning: true, learning_scope: 'signed_in_dj' }, tracks: enriched }), true;
      }

      if (path === '/api/library/summary' && method === 'GET') {
        const u = await requireUser(req);
        const totals = await db.get(
          `SELECT
             COUNT(*) AS tracks,
             SUM(CASE WHEN artist <> '' THEN 1 ELSE 0 END) AS artists_known,
             SUM(CASE WHEN bpm IS NOT NULL THEN 1 ELSE 0 END) AS bpm_known,
             SUM(CASE WHEN year IS NOT NULL THEN 1 ELSE 0 END) AS years_known,
             SUM(CASE WHEN duration_seconds IS NOT NULL THEN 1 ELSE 0 END) AS duration_known
           FROM library_tracks
           WHERE user_id = ?`,
          [u.id],
        );
        const formats = await db.all(
          'SELECT file_type, COUNT(*) AS tracks FROM library_tracks WHERE user_id = ? GROUP BY file_type ORDER BY tracks DESC, file_type ASC',
          [u.id],
        );
        const latest = await db.get(
          'SELECT id, source_file, source_root, scanned_at, row_count, excluded_aliases, source_sha256, created_at FROM library_scans WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
          [u.id],
        );
        return send(res, 200, {
          inventory: {
            tracks: Number(totals?.tracks || 0),
            artists_known: Number(totals?.artists_known || 0),
            bpm_known: Number(totals?.bpm_known || 0),
            years_known: Number(totals?.years_known || 0),
            duration_known: Number(totals?.duration_known || 0),
            formats: formats.map((row) => ({ file_type: row.file_type, tracks: Number(row.tracks || 0) })),
            latest_scan: latest || null,
          }
        }), true;
      }

      if (path === '/api/library/search' && method === 'GET') {
        const u = await requireUser(req);
        const q = String(url.searchParams.get('q') || '').trim();
        const artist = String(url.searchParams.get('artist') || '').trim();
        const genre = String(url.searchParams.get('genre') || '').trim();
        const fileType = String(url.searchParams.get('file_type') || '').trim().toUpperCase();
        const eventType = String(url.searchParams.get('event_type') || '').trim();
        const eventMoment = String(url.searchParams.get('event_moment') || '').trim();
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 1000);
        const offset = Math.min(Math.max(Number(url.searchParams.get('offset') || 0), 0), 10000000);

        const where = ['user_id = ?'];
        const params = [u.id];

        if (q) {
          const like = '%' + q + '%';
          where.push('(artist LIKE ? OR title LIKE ? OR album LIKE ? OR artist_key LIKE ? OR title_key LIKE ?)');
          params.push(like, like, like, '%' + normalizeLibraryQuery(q) + '%', '%' + normalizeLibraryQuery(q) + '%');
        }
        if (artist) {
          where.push('artist_key LIKE ?');
          params.push('%' + normalizeLibraryQuery(artist) + '%');
        }
        if (genre) {
          where.push('genre LIKE ?');
          params.push('%' + genre + '%');
        }
        if (fileType) {
          where.push('file_type = ?');
          params.push(fileType);
        }

        const tracks = await db.all(
          `SELECT l.id, l.artist, l.title, l.album, l.genre, l.bpm, l.year, l.file_type, l.duration_seconds, l.file_path, l.metadata_source,
                  COALESCE((SELECT d.play_count FROM si_dj_learning_tracks t JOIN si_dj_learning_track_djs d ON d.track_id = t.id
                            WHERE d.user_id = ? AND t.artist_key = l.artist_key AND t.title_key = l.title_key LIMIT 1), 0) AS live_play_count,
                  COALESCE((SELECT SUM(m.played_count) FROM si_dj_event_memory_tracks m JOIN si_dj_event_memory e ON e.id = m.memory_id
                            WHERE e.user_id = ? AND m.artist_key = l.artist_key AND m.title_key = l.title_key
                              AND (? = '' OR e.event_type = ?) AND (? = '' OR m.moments_json LIKE ?)), 0) AS event_memory_play_count,
                  COALESCE((SELECT SUM(m.request_count) FROM si_dj_event_memory_tracks m JOIN si_dj_event_memory e ON e.id = m.memory_id
                            WHERE e.user_id = ? AND m.artist_key = l.artist_key AND m.title_key = l.title_key
                              AND (? = '' OR e.event_type = ?) AND (? = '' OR m.moments_json LIKE ?)), 0) AS event_memory_request_count,
                  COALESCE((SELECT SUM(m.planned_count) FROM si_dj_event_memory_tracks m JOIN si_dj_event_memory e ON e.id = m.memory_id
                            WHERE e.user_id = ? AND m.artist_key = l.artist_key AND m.title_key = l.title_key
                              AND (? = '' OR e.event_type = ?) AND (? = '' OR m.moments_json LIKE ?)), 0) AS event_memory_planned_count
           FROM library_tracks l
           WHERE ${where.join(' AND ')}
           ORDER BY l.artist_key ASC, l.title_key ASC, l.id ASC
           LIMIT ? OFFSET ?`,
          [u.id,u.id,eventType,eventType,eventMoment,`%${eventMoment}%`,u.id,eventType,eventType,eventMoment,`%${eventMoment}%`,u.id,eventType,eventType,eventMoment,`%${eventMoment}%`,...params,limit,offset],
        );
        return send(res, 200, { tracks }), true;
      }

      if (path === '/api/library/genre-overrides' && method === 'GET') {
        const u = await requireUser(req);
        const overrides = await db.all(
          'SELECT artist_key, title_key, artist, title, genre, updated_at FROM si_dj_library_genre_overrides WHERE user_id = ?',
          [u.id],
        );
        return send(res, 200, { overrides }), true;
      }

      if (path === '/api/library/genre-overrides' && method === 'POST') {
        const u = await requireUser(req);
        const b = await readJson(req);
        const title = str(b.title, 255, { min: 1 });
        const artist = str(b.artist || '', 255);
        const artistKey = libraryKey(artist);
        const titleKey = libraryKey(title);
        const genre = str(b.genre || '', 120);
        if (!titleKey) throw bad('invalid_track');
        if (!genre) {
          await db.run('DELETE FROM si_dj_library_genre_overrides WHERE user_id = ? AND artist_key = ? AND title_key = ?', [u.id,artistKey,titleKey]);
          return send(res, 200, { removed: true, artist, title }), true;
        }
        const updatedAt = Date.now();
        if (db.driver === 'sqlite') {
          await db.run(
            `INSERT INTO si_dj_library_genre_overrides (user_id,artist_key,title_key,artist,title,genre,updated_at)
             VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,artist_key,title_key) DO UPDATE SET artist=excluded.artist,title=excluded.title,genre=excluded.genre,updated_at=excluded.updated_at`,
            [u.id,artistKey,titleKey,artist,title,genre,updatedAt],
          );
        } else {
          await db.run(
            `INSERT INTO si_dj_library_genre_overrides (user_id,artist_key,title_key,artist,title,genre,updated_at)
             VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE artist=VALUES(artist),title=VALUES(title),genre=VALUES(genre),updated_at=VALUES(updated_at)`,
            [u.id,artistKey,titleKey,artist,title,genre,updatedAt],
          );
        }
        return send(res, 200, { override: { artist, title, genre, updated_at: updatedAt } }), true;
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
