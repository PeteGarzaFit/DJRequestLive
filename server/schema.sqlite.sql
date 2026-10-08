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

CREATE INDEX IF NOT EXISTS idx_si_dj_play_user_time ON si_dj_play_history(user_id, played_at);
CREATE INDEX IF NOT EXISTS idx_si_dj_play_track ON si_dj_play_history(artist, title);
CREATE TABLE IF NOT EXISTS si_dj_learning_tracks (id INTEGER PRIMARY KEY AUTOINCREMENT, artist_key TEXT NOT NULL, title_key TEXT NOT NULL, artist TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', play_count INTEGER NOT NULL DEFAULT 0, dj_count INTEGER NOT NULL DEFAULT 0, last_played INTEGER NULL, first_played INTEGER NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE (artist_key, title_key));
CREATE INDEX IF NOT EXISTS idx_si_dj_learning_play_count ON si_dj_learning_tracks(play_count);
CREATE INDEX IF NOT EXISTS idx_si_dj_learning_last_played ON si_dj_learning_tracks(last_played);

CREATE TABLE IF NOT EXISTS si_dj_learning_track_djs (track_id INTEGER NOT NULL, user_id INTEGER NOT NULL, first_played INTEGER NOT NULL, last_played INTEGER NOT NULL, play_count INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (track_id, user_id));
CREATE TABLE IF NOT EXISTS si_dj_learning_transitions (from_track_id INTEGER NOT NULL, to_track_id INTEGER NOT NULL, transition_count INTEGER NOT NULL DEFAULT 0, dj_count INTEGER NOT NULL DEFAULT 0, last_played INTEGER NULL, PRIMARY KEY (from_track_id, to_track_id));
CREATE INDEX IF NOT EXISTS idx_si_dj_transition_count ON si_dj_learning_transitions(transition_count);
CREATE INDEX IF NOT EXISTS idx_si_dj_transition_to ON si_dj_learning_transitions(to_track_id);
CREATE TABLE IF NOT EXISTS si_dj_learning_transition_djs (from_track_id INTEGER NOT NULL, to_track_id INTEGER NOT NULL, user_id INTEGER NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, play_count INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (from_track_id, to_track_id, user_id));

CREATE TABLE IF NOT EXISTS si_dj_learning_context (
  track_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  event_moment TEXT NOT NULL DEFAULT '',
  play_count INTEGER NOT NULL DEFAULT 0,
  dj_count INTEGER NOT NULL DEFAULT 0,
  last_played INTEGER NULL,
  PRIMARY KEY (track_id,event_type,event_moment)
);
CREATE INDEX IF NOT EXISTS idx_si_dj_context_type ON si_dj_learning_context(event_type,play_count);
CREATE INDEX IF NOT EXISTS idx_si_dj_context_moment ON si_dj_learning_context(event_type,event_moment,play_count);
