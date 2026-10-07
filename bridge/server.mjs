import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 8765);
const CONFIG_PATH = process.env.DJRL_BRIDGE_CONFIG || path.join(process.cwd(), 'config.json');
const FETCH_TIMEOUT_MS = 1500;

function cfg() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {
      source: 'virtualdj',
      virtualdj: { baseUrl: 'http://127.0.0.1:80', bearer: '' }
    };
  }
}

let state = {
  connected: false,
  source: null,
  nowPlaying: null,
  updatedAt: null,
  error: 'Starting bridge…'
};

function out(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Private-Network': 'true',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

async function q(base, bearer, script) {
  const u = new URL('/query', base);
  u.searchParams.set('script', script);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const r = await fetch(u, {
      signal: controller.signal,
      headers: bearer ? { Authorization: 'Bearer ' + bearer } : {}
    });
    if (!r.ok) throw Error('VirtualDJ HTTP ' + r.status);
    return (await r.text()).trim();
  } catch (e) {
    if (e?.name === 'AbortError') throw Error('VirtualDJ connection timed out');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function vdj() {
  const c = cfg().virtualdj || {};
  const base = c.baseUrl || 'http://127.0.0.1:80';

  try {
    const audible = await q(base, c.bearer || '', 'deck master is_audible');

    if (['false', '0', ''].includes(audible)) {
      state = {
        connected: true,
        source: 'virtualdj',
        nowPlaying: null,
        updatedAt: Date.now(),
        error: null
      };
      return;
    }

    const [artist, title, bpm, key, genre, elapsed] = await Promise.all([
      q(base, c.bearer || '', 'deck master get_artist'),
      q(base, c.bearer || '', 'deck master get_title'),
      q(base, c.bearer || '', 'deck master get_bpm'),
      q(base, c.bearer || '', 'deck master get_key'),
      q(base, c.bearer || '', 'deck master get_genre'),
      q(base, c.bearer || '', 'deck master get_time elapsed')
    ]);

    state = {
      connected: true,
      source: 'virtualdj',
      nowPlaying: {
        artist,
        title,
        bpm: Number(bpm) || null,
        key: key || null,
        genre: genre || null,
        elapsedMs: Number(elapsed) || null
      },
      updatedAt: Date.now(),
      error: null
    };
  } catch (e) {
    state = {
      ...state,
      connected: false,
      source: 'virtualdj',
      updatedAt: Date.now(),
      error: e?.message || 'VirtualDJ connection failed'
    };
  }
}

function rb() {
  const f = cfg().rekordbox?.historyFile;
  if (!f) return null;

  try {
    const line = fs.readFileSync(f, 'utf8')
      .split(/\r?\n/)
      .map(x => x.trim())
      .filter(Boolean)
      .pop();

    if (!line) return null;

    const parts = line.split(/\t|,/).map(x => x.trim());
    return parts.length >= 2
      ? { artist: parts[0], title: parts[1], source: 'rekordbox-history' }
      : null;
  } catch {
    return null;
  }
}

async function poll() {
  try {
    const c = cfg();

    if (c.source === 'rekordbox-history') {
      const nowPlaying = rb();
      state = {
        connected: !!nowPlaying,
        source: 'rekordbox-history',
        nowPlaying,
        updatedAt: Date.now(),
        error: nowPlaying ? null : 'Waiting for Rekordbox history file'
      };
      return;
    }

    await vdj();
  } catch (e) {
    state = {
      ...state,
      connected: false,
      updatedAt: Date.now(),
      error: e?.message || 'Bridge polling failed'
    };
  }
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1:' + PORT);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Private-Network': 'true'
    });
    return res.end();
  }

  if (u.pathname === '/health' || u.pathname === '/now-playing') {
    return out(res, 200, state);
  }

  if (u.pathname === '/config') {
    return out(res, 200, {
      source: cfg().source || 'virtualdj',
      port: PORT,
      host: os.hostname()
    });
  }

  return out(res, 404, { error: 'not_found' });
});

server.on('error', err => {
  console.error('DJ Request Live Bridge server error:', err);
  process.exitCode = 1;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('DJ Request Live Bridge: http://127.0.0.1:' + PORT);
});

poll();
setInterval(poll, 2000);
