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
