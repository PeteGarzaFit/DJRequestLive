-- DJ Request Live: MySQL schema.
-- The server runs this automatically on start (every statement is CREATE TABLE IF NOT EXISTS),
-- so you only need to create an empty MySQL database in hPanel and set the DB_* variables.
-- You can also import this file in phpMyAdmin.

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  dj_name VARCHAR(120) NOT NULL,
  slug VARCHAR(40) NOT NULL UNIQUE,
  tagline VARCHAR(200) NOT NULL DEFAULT '',
  genres VARCHAR(160) NOT NULL DEFAULT '',
  min_tip DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  pay_json TEXT NOT NULL,
  design_json TEXT NOT NULL,
  logo_media BIGINT UNSIGNED NULL,
  wall_media BIGINT UNSIGNED NULL,
  photos_json TEXT NOT NULL,
  is_live TINYINT(1) NOT NULL DEFAULT 1,
  spotify_access_token TEXT NULL,
  spotify_refresh_token TEXT NULL,
  spotify_expires_at BIGINT NULL,
  spotify_account_id VARCHAR(120) NULL,
  spotify_display_name VARCHAR(180) NULL,
  created_at BIGINT NOT NULL
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_user (user_id)
) CHARACTER SET utf8mb4;

-- Uploaded logo, wallpaper and photos live in the database so they survive redeploys.
CREATE TABLE IF NOT EXISTS media (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  mime VARCHAR(40) NOT NULL,
  data MEDIUMBLOB NOT NULL,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_media_user (user_id)
) CHARACTER SET utf8mb4;

-- Reserved for multi-event support later.
CREATE TABLE IF NOT EXISTS events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  venue VARCHAR(180) NULL,
  event_date DATETIME NULL,
  status ENUM('draft','live','closed') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_events_user (user_id)
) CHARACTER SET utf8mb4;

-- Dedicated collaborative wedding plans. The unguessable share token is a view/edit capability.
CREATE TABLE IF NOT EXISTS wedding_plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  share_token CHAR(43) NOT NULL UNIQUE,
  plan_json MEDIUMTEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_wedding_plans_owner (owner_id, updated_at)
) CHARACTER SET utf8mb4;

-- General party and event plans with private collaboration links.
CREATE TABLE IF NOT EXISTS event_plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT UNSIGNED NOT NULL,
  share_token CHAR(43) NOT NULL UNIQUE,
  plan_json MEDIUMTEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_event_plans_owner (owner_id, updated_at)
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  event_id BIGINT UNSIGNED NULL,
  guest_name VARCHAR(60) NOT NULL DEFAULT '',
  song_title VARCHAR(120) NOT NULL,
  artist VARCHAR(120) NOT NULL DEFAULT '',
  message VARCHAR(200) NOT NULL DEFAULT '',
  status ENUM('new','approved','declined','played') NOT NULL DEFAULT 'new',
  amount DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  method VARCHAR(10) NOT NULL DEFAULT '',
  paid TINYINT(1) NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  played_at BIGINT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  INDEX idx_requests_user_created (user_id, created_at)
) CHARACTER SET utf8mb4;

-- Curated DJ hit library used by Music Intelligence.
CREATE TABLE IF NOT EXISTS songs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  artist VARCHAR(180) NOT NULL,
  genre VARCHAR(60) NOT NULL,
  era VARCHAR(20) NOT NULL,
  bpm DECIMAL(6,2) NULL,
  energy TINYINT NOT NULL DEFAULT 5,
  dancefloor_score TINYINT NOT NULL DEFAULT 5,
  singalong_score TINYINT NOT NULL DEFAULT 5,
  crossgen_score TINYINT NOT NULL DEFAULT 5,
  content VARCHAR(20) NOT NULL DEFAULT 'Clean',
  tags VARCHAR(500) NOT NULL DEFAULT '',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_song (title, artist),
  INDEX idx_songs_genre (genre),
  INDEX idx_songs_era (era),
  INDEX idx_songs_active (active)
) CHARACTER SET utf8mb4;

-- Private, DJ-owned inventory snapshots. Spotify catalog results are never stored here.
CREATE TABLE IF NOT EXISTS library_scans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  track_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_library_scans_user (user_id, created_at)
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS library_tracks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  scan_id BIGINT UNSIGNED NOT NULL,
  artist VARCHAR(255) NOT NULL DEFAULT '',
  title VARCHAR(255) NOT NULL,
  album VARCHAR(255) NOT NULL DEFAULT '',
  genre VARCHAR(120) NOT NULL DEFAULT '',
  bpm DECIMAL(6,2) NULL,
  year VARCHAR(12) NOT NULL DEFAULT '',
  file_type VARCHAR(30) NOT NULL DEFAULT '',
  duration_seconds INT UNSIGNED NULL,
  file_path TEXT NOT NULL,
  metadata_source VARCHAR(40) NOT NULL DEFAULT '',
  artist_key VARCHAR(255) NOT NULL DEFAULT '',
  title_key VARCHAR(255) NOT NULL DEFAULT '',
  path_hash CHAR(64) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (scan_id) REFERENCES library_scans(id) ON DELETE CASCADE,
  UNIQUE KEY uq_library_user_path (user_id, path_hash),
  INDEX idx_library_user_artist_title (user_id, artist(120), title(120)),
  INDEX idx_library_user_title_key (user_id, title_key(120))
) CHARACTER SET utf8mb4;

-- Reserved for Stripe boosts and subscriptions later.
CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  stripe_payment_id VARCHAR(255) NULL UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  net_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS votes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  guest_identifier VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_vote (request_id, guest_identifier),
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;


-- Per-DJ source-of-truth inventory imported from the DJ's local master scan.
CREATE TABLE IF NOT EXISTS library_scans (
  id CHAR(36) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  source_file VARCHAR(255) NOT NULL,
  source_root VARCHAR(500) NULL,
  scanned_at DATETIME NULL,
  row_count INT UNSIGNED NOT NULL DEFAULT 0,
  excluded_aliases INT UNSIGNED NOT NULL DEFAULT 0,
  source_sha256 CHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_library_scans_user_created (user_id, created_at)
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS library_tracks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  scan_id CHAR(36) NULL,
  artist VARCHAR(255) NOT NULL DEFAULT '',
  title VARCHAR(500) NOT NULL DEFAULT '',
  album VARCHAR(255) NOT NULL DEFAULT '',
  genre VARCHAR(255) NOT NULL DEFAULT '',
  bpm DECIMAL(7,2) NULL,
  year SMALLINT UNSIGNED NULL,
  file_type VARCHAR(16) NOT NULL DEFAULT '',
  duration_seconds INT UNSIGNED NULL,
  file_path TEXT NOT NULL,
  metadata_source VARCHAR(180) NOT NULL DEFAULT '',
  artist_key VARCHAR(255) NOT NULL DEFAULT '',
  title_key VARCHAR(500) NOT NULL DEFAULT '',
  path_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (scan_id) REFERENCES library_scans(id) ON DELETE SET NULL,
  UNIQUE KEY uq_library_track_path (user_id, path_hash),
  INDEX idx_library_artist_key (user_id, artist_key),
  INDEX idx_library_title_key (user_id, title_key),
  INDEX idx_library_genre (user_id, genre),
  INDEX idx_library_bpm (user_id, bpm),
  INDEX idx_library_year (user_id, year),
  INDEX idx_library_file_type (user_id, file_type),
  INDEX idx_library_scan (user_id, scan_id)
) CHARACTER SET utf8mb4;


-- Live Bridge play history and anonymized SI DJ learning.
CREATE TABLE IF NOT EXISTS si_dj_play_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  event_key CHAR(64) NOT NULL,
  played_at BIGINT NOT NULL,
  artist VARCHAR(255) NOT NULL DEFAULT '',
  title VARCHAR(500) NOT NULL DEFAULT '',
  source VARCHAR(60) NOT NULL DEFAULT 'bridge',
  raw_line VARCHAR(1000) NOT NULL DEFAULT '',
  event_type VARCHAR(80) NOT NULL DEFAULT '',
  event_moment VARCHAR(160) NOT NULL DEFAULT '',
  event_key_context VARCHAR(160) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_si_dj_play_event (user_id, event_key),
  INDEX idx_si_dj_play_user_time (user_id, played_at),
  INDEX idx_si_dj_play_track (artist, title)
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS si_dj_learning_tracks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  artist_key VARCHAR(255) NOT NULL,
  title_key VARCHAR(500) NOT NULL,
  artist VARCHAR(255) NOT NULL DEFAULT '',
  title VARCHAR(500) NOT NULL DEFAULT '',
  play_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  dj_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_played BIGINT NULL,
  first_played BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_si_dj_learning_track (artist_key, title_key),
  INDEX idx_si_dj_learning_play_count (play_count),
  INDEX idx_si_dj_learning_last_played (last_played)
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS si_dj_learning_track_djs (
  track_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  first_played BIGINT NOT NULL,
  last_played BIGINT NOT NULL,
  play_count BIGINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (track_id, user_id),
  FOREIGN KEY (track_id) REFERENCES si_dj_learning_tracks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS si_dj_learning_transitions (
  from_track_id BIGINT UNSIGNED NOT NULL,
  to_track_id BIGINT UNSIGNED NOT NULL,
  transition_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  dj_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_played BIGINT NULL,
  PRIMARY KEY (from_track_id, to_track_id),
  FOREIGN KEY (from_track_id) REFERENCES si_dj_learning_tracks(id) ON DELETE CASCADE,
  FOREIGN KEY (to_track_id) REFERENCES si_dj_learning_tracks(id) ON DELETE CASCADE,
  INDEX idx_si_dj_transition_count (transition_count),
  INDEX idx_si_dj_transition_to (to_track_id)
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS si_dj_learning_transition_djs (
  from_track_id BIGINT UNSIGNED NOT NULL,
  to_track_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  first_seen BIGINT NOT NULL,
  last_seen BIGINT NOT NULL,
  play_count BIGINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (from_track_id, to_track_id, user_id),
  FOREIGN KEY (from_track_id) REFERENCES si_dj_learning_tracks(id) ON DELETE CASCADE,
  FOREIGN KEY (to_track_id) REFERENCES si_dj_learning_tracks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS si_dj_learning_context (
  track_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  event_moment VARCHAR(160) NOT NULL DEFAULT '',
  play_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  dj_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_played BIGINT NULL,
  planned_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  request_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  event_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (track_id,event_type,event_moment),
  FOREIGN KEY (track_id) REFERENCES si_dj_learning_tracks(id) ON DELETE CASCADE,
  INDEX idx_si_dj_context_type (event_type,play_count),
  INDEX idx_si_dj_context_moment (event_type,event_moment,play_count)
) CHARACTER SET utf8mb4;


-- Permanent post-event SI DJ memory. This stores what actually happened at an event
-- so future SI DJ recommendations can learn from completed performances.
CREATE TABLE IF NOT EXISTS si_dj_event_memory (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  event_key CHAR(64) NOT NULL,
  event_type VARCHAR(80) NOT NULL DEFAULT '',
  event_name VARCHAR(180) NOT NULL DEFAULT '',
  venue VARCHAR(180) NOT NULL DEFAULT '',
  event_date DATE NULL,
  closed_at BIGINT NULL,
  planned_track_count INT UNSIGNED NOT NULL DEFAULT 0,
  played_track_count INT UNSIGNED NOT NULL DEFAULT 0,
  unique_played_count INT UNSIGNED NOT NULL DEFAULT 0,
  planned_played_count INT UNSIGNED NOT NULL DEFAULT 0,
  unplanned_played_count INT UNSIGNED NOT NULL DEFAULT 0,
  completion_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  repeat_request_count INT UNSIGNED NOT NULL DEFAULT 0,
  summary_json TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_si_dj_event_memory (user_id,event_key),
  INDEX idx_si_dj_event_memory_type_date (event_type,event_date),
  INDEX idx_si_dj_event_memory_user_date (user_id,event_date)
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS si_dj_event_memory_tracks (
  memory_id BIGINT UNSIGNED NOT NULL,
  artist_key VARCHAR(255) NOT NULL,
  title_key VARCHAR(500) NOT NULL,
  artist VARCHAR(255) NOT NULL DEFAULT '',
  title VARCHAR(500) NOT NULL DEFAULT '',
  moments_json TEXT NOT NULL,
  planned_count INT UNSIGNED NOT NULL DEFAULT 0,
  played_count INT UNSIGNED NOT NULL DEFAULT 0,
  request_count INT UNSIGNED NOT NULL DEFAULT 0,
  first_played BIGINT NULL,
  last_played BIGINT NULL,
  PRIMARY KEY (memory_id,artist_key,title_key),
  FOREIGN KEY (memory_id) REFERENCES si_dj_event_memory(id) ON DELETE CASCADE,
  INDEX idx_si_dj_event_memory_track (artist_key,title_key),
  INDEX idx_si_dj_event_memory_track_played (played_count),
  INDEX idx_si_dj_event_memory_track_requests (request_count)
) CHARACTER SET utf8mb4;
