import { readFileSync } from 'node:fs';
import { songRows } from '../lib/songLibrary.js';

// One small interface for both databases:
//   all(sql, params) -> rows     get(sql, params) -> row | null     run(sql, params) -> { insertId, changes }
// Production uses MySQL (Hostinger). Tests can set DB_DRIVER=sqlite to run without a MySQL server.
export async function createDb() {
  if (process.env.DB_DRIVER === 'sqlite') {
    const { DatabaseSync } = await import('node:sqlite');
    const d = new DatabaseSync(process.env.SQLITE_FILE || ':memory:');
    d.exec('PRAGMA foreign_keys = ON');
    d.exec(readFileSync(new URL('./schema.sqlite.sql', import.meta.url), 'utf8'));
    const contextColumns = new Set(d.prepare('PRAGMA table_info(si_dj_learning_context)').all().map((r) => r.name));
    for (const [name, type] of [
      ['planned_count', 'INTEGER NOT NULL DEFAULT 0'],
      ['request_count', 'INTEGER NOT NULL DEFAULT 0'],
      ['event_count', 'INTEGER NOT NULL DEFAULT 0'],
    ]) {
      if (!contextColumns.has(name)) d.exec('ALTER TABLE si_dj_learning_context ADD COLUMN ' + name + ' ' + type);
    }
    return {
      driver: 'sqlite',
      async all(sql, p = []) { return d.prepare(sql).all(...p).map((r) => ({ ...r })); },
      async get(sql, p = []) { const r = d.prepare(sql).get(...p); return r ? { ...r } : null; },
      async run(sql, p = []) { const r = d.prepare(sql).run(...p); return { insertId: Number(r.lastInsertRowid), changes: Number(r.changes) }; },
      async close() { d.close(); },
    };
  }

  const mysql = await import('mysql2/promise');
  const configuredHost = String(process.env.DB_HOST || '').trim().toLowerCase();
  // Hostinger's Node runtime may resolve localhost to IPv6. Use IPv4 for the local MySQL service.
  const dbHost = (!configuredHost || configuredHost === 'localhost' || configuredHost === '::1' || configuredHost === '127.0.0.1')
    ? '127.0.0.1'
    : configuredHost;

  const pool = mysql.createPool({
    // Hostinger can resolve localhost to IPv6 (::1). Force local DB connections to IPv4.
    host: dbHost,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
  });
  const ddl = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8').replace(/^\s*--.*$/gm, '');
  for (const stmt of ddl.split(';').map((s) => s.trim()).filter(Boolean)) await pool.query(stmt);
  for (const stmt of [
    'ALTER TABLE si_dj_learning_context ADD COLUMN planned_count BIGINT UNSIGNED NOT NULL DEFAULT 0',
    'ALTER TABLE si_dj_learning_context ADD COLUMN request_count BIGINT UNSIGNED NOT NULL DEFAULT 0',
    'ALTER TABLE si_dj_learning_context ADD COLUMN event_count BIGINT UNSIGNED NOT NULL DEFAULT 0',
    'ALTER TABLE users ADD COLUMN spotify_access_token TEXT NULL',
    'ALTER TABLE users ADD COLUMN spotify_refresh_token TEXT NULL',
    'ALTER TABLE users ADD COLUMN spotify_expires_at BIGINT NULL',
    'ALTER TABLE users ADD COLUMN spotify_account_id VARCHAR(120) NULL',
    'ALTER TABLE users ADD COLUMN spotify_display_name VARCHAR(180) NULL',
  ]) {
    try { await pool.query(stmt); } catch (e) {
      if (!/duplicate column|duplicate field|ER_DUP_FIELDNAME/i.test(String(e?.message || e?.code))) throw e;
    }
  }
  await seedSongs({
    all: async (sql, p = []) => { const [rows] = await pool.query(sql, p); return rows; },
    run: async (sql, p = []) => { const [r] = await pool.query(sql, p); return { insertId: Number(r.insertId || 0), changes: Number(r.affectedRows || 0) }; },
  });
  return {
    driver: 'mysql',
    async all(sql, p = []) { const [rows] = await pool.query(sql, p); return rows; },
    async get(sql, p = []) { const [rows] = await pool.query(sql, p); return rows[0] || null; },
    async run(sql, p = []) { const [r] = await pool.query(sql, p); return { insertId: Number(r.insertId || 0), changes: Number(r.affectedRows || 0) }; },
    async close() { await pool.end(); },
  };
}


async function seedSongs(db) {
  // Upsert the curated library on every production startup so new SI DJ knowledge
  // reaches existing databases without requiring a manual database reset.
  const rows = songRows();
  for (const s of rows) {
    await db.run(
      'INSERT INTO songs (title, artist, genre, era, bpm, energy, dancefloor_score, singalong_score, crossgen_score, content, tags) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE genre=VALUES(genre), era=VALUES(era), bpm=VALUES(bpm), energy=VALUES(energy), dancefloor_score=VALUES(dancefloor_score), singalong_score=VALUES(singalong_score), crossgen_score=VALUES(crossgen_score), content=VALUES(content), tags=VALUES(tags), active=1',
      [s.title, s.artist, s.genre, s.era, s.bpm, s.energy, s.dancefloor, s.singalong, s.crossgen, s.content, s.tags],
    );
  }
}
