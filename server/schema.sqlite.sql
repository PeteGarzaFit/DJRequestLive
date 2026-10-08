-- Test-only schema (SQLite). Production uses ../schema.sql on MySQL.
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  dj_name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, tagline TEXT NOT NULL DEFAULT '', genres TEXT NOT NULL DEFAULT '',
  min_tip REAL NOT NULL DEFAULT 0, pay_json TEXT NOT NULL, design_json TEXT NOT NULL,
  logo_media INTEGER NULL, wall_media INTEGER NULL, photos_json TEXT NOT NULL, is_live INTEGER NOT NULL DEFAULT 1,
  spotify_access_token TEXT NULL, spotify_refresh_token TEXT NULL, spotify_expires_at INTEGER NULL, spotify_account_id TEXT NULL, spotify_display_name TEXT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL
);
CREATE TABLE media (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime TEXT NOT NULL, data BLOB NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, event_id INTEGER NULL,
  guest_name TEXT NOT NULL DEFAULT '', song_title TEXT NOT NULL, artist TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','approved','declined','played')),
  amount REAL NOT NULL DEFAULT 0, method TEXT NOT NULL DEFAULT '', paid INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, played_at INTEGER NULL
);

CREATE TABLE IF NOT EXISTS library_scans (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_file TEXT NOT NULL,
  source_root TEXT NULL,
  scanned_at TEXT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  excluded_aliases INTEGER NOT NULL DEFAULT 0,
  source_sha256 TEXT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS library_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scan_id TEXT NULL REFERENCES library_scans(id) ON DELETE SET NULL,
  artist TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  album TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL DEFAULT '',
  bpm REAL NULL,
  year INTEGER NULL,
  file_type TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER NULL,
  file_path TEXT NOT NULL,
  metadata_source TEXT NOT NULL DEFAULT '',
  artist_key TEXT NOT NULL DEFAULT '',
  title_key TEXT NOT NULL DEFAULT '',
  path_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, path_hash)
);

CREATE INDEX IF NOT EXISTS idx_library_artist_key ON library_tracks(user_id, artist_key);
CREATE INDEX IF NOT EXISTS idx_library_title_key ON library_tracks(user_id, title_key);
CREATE INDEX IF NOT EXISTS idx_library_genre ON library_tracks(user_id, genre);
CREATE INDEX IF NOT EXISTS idx_library_bpm ON library_tracks(user_id, bpm);
CREATE INDEX IF NOT EXISTS idx_library_year ON library_tracks(user_id, year);
CREATE INDEX IF NOT EXISTS idx_library_file_type ON library_tracks(user_id, file_type);
CREATE INDEX IF NOT EXISTS idx_library_scan ON library_tracks(user_id, scan_id);

CREATE TABLE IF NOT EXISTS si_dj_play_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, event_key TEXT NOT NULL, played_at INTEGER NOT NULL, artist TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'bridge', raw_line TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, UNIQUE (user_id, event_key));
