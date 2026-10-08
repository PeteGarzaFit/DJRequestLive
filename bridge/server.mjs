import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 8765);
const CONFIG_PATH = process.env.DJRL_BRIDGE_CONFIG || path.join(process.cwd(), 'config.json');

function cfg() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { source: 'virtualdj-history', virtualdjHistory: { historyFile: '' }, rekordbox: { historyFile: '' } };
  }
}

function out(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Private-Network': 'true',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function defaultVdjHistoryFile() {
  return path.join(os.homedir(), 'Library', 'Application Support', 'VirtualDJ', 'History', 'tracklist.txt');
}

function parseTrackLine(line) {
  const raw = line.trim();
  if (!raw) return null;

  // VirtualDJ macOS history uses: HH:MM : Artist - Title
  // Ignore date/header/separator lines and only accept a real time-stamped entry.
  const match = raw.match(/^\s*\d{1,2}:\d{2}\s*:\s*(.+?)\s+-\s+(.+)\s*$/);
  if (!match) return null;

  return {
    artist: match[1].trim(),
    title: match[2].trim(),
    raw
  };
}

function readHistory(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    const entries = [];
    let date = null;
    for (const line of lines) {
      const header = line.trim().match(/^VirtualDJ History - (\d{4}\/\d{2}\/\d{2})$/i);
      if (header) { date = header[1]; continue; }
      const raw = line.trim();
      const m = raw.match(/^(\d{1,2}:\d{2})\s*:\s*(.+?)\s+-\s+(.+)$/);
      if (!m) continue;
      entries.push({ time:m[1], artist:m[2].trim(), title:m[3].trim(), raw, date });
    }
    return entries;
  } catch { return []; }
}

function readLastLine(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size === 0) return null;

    const fd = fs.openSync(file, 'r');
    const size = Math.min(stat.size, 16384);
    const buffer = Buffer.alloc(size);
    fs.readSync(fd, buffer, 0, size, Math.max(0, stat.size - size));
    fs.closeSync(fd);

    const lines = buffer.toString('utf8').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    return lines.length ? lines[lines.length - 1] : null;
  } catch {
    return null;
  }
}

function vdjHistory() {
  const configured = cfg().virtualdjHistory?.historyFile;
  const file = configured || defaultVdjHistoryFile();
  const line = readLastLine(file);

  if (!line) {
    return {
      connected: false,
      source: 'virtualdj-history',
      nowPlaying: null,
      updatedAt: Date.now(),
      error: 'Waiting for VirtualDJ History/tracklist.txt'
    };
  }

  const track = parseTrackLine(line);
  return {
    connected: !!track,
    source: 'virtualdj-history',
    nowPlaying: track ? { ...track, source: 'virtualdj-history' } : null,
    updatedAt: Date.now(),
    error: track ? null : 'Unable to parse VirtualDJ tracklist'
  };
}

function rekordbox() {
  const file = cfg().rekordbox?.historyFile;
  if (!file) return null;

  try {
    const line = readLastLine(file);
    if (!line) return null;
    const parts = line.split(/\t|,/).map(x => x.trim());
    return parts.length >= 2
      ? { artist: parts[0], title: parts[1], source: 'rekordbox-history', raw: line }
      : null;
  } catch {
    return null;
  }
}

let state = {
  connected: false,
  source: null,
  nowPlaying: null,
  updatedAt: Date.now(),
  error: 'Starting bridge…'
};

function poll() {
  try {
    const c = cfg();

    if (c.source === 'rekordbox-history') {
      const track = rekordbox();
      state = {
        connected: !!track,
        source: 'rekordbox-history',
        nowPlaying: track,
        updatedAt: Date.now(),
        error: track ? null : 'Waiting for Rekordbox history file'
      };
      return;
    }

    state = vdjHistory();
  } catch (e) {
    state = {
      connected: false,
      source: 'virtualdj-history',
      nowPlaying: null,
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

  if (u.pathname === '/health' || u.pathname === '/now-playing') return out(res, 200, state);

  if (u.pathname === '/config') {
    return out(res, 200, {
      source: cfg().source || 'virtualdj-history',
      port: PORT,
      host: os.hostname(),
      virtualdjHistoryFile: cfg().virtualdjHistory?.historyFile || defaultVdjHistoryFile()
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
