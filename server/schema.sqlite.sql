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
CREATE TABLE library_scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE library_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scan_id INTEGER NOT NULL REFERENCES library_scans(id) ON DELETE CASCADE,
  artist TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, album TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL DEFAULT '', bpm REAL NULL, year TEXT NOT NULL DEFAULT '', file_type TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER NULL, file_path TEXT NOT NULL, metadata_source TEXT NOT NULL DEFAULT '',
  artist_key TEXT NOT NULL DEFAULT '', title_key TEXT NOT NULL DEFAULT '', path_hash TEXT NOT NULL,
  UNIQUE(user_id, path_hash)
);
CREATE INDEX idx_library_user_artist_title ON library_tracks(user_id, artist_key, title_key);
CREATE TABLE requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, event_id INTEGER NULL,
  guest_name TEXT NOT NULL DEFAULT '', song_title TEXT NOT NULL, artist TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','approved','declined','played')),
  amount REAL NOT NULL DEFAULT 0, method TEXT NOT NULL DEFAULT '', paid INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, played_at INTEGER NULL
);
