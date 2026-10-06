import { readFileSync } from 'node:fs';

// One small interface for both databases:
//   all(sql, params) -> rows     get(sql, params) -> row | null     run(sql, params) -> { insertId, changes }
// Production uses MySQL (Hostinger). Tests can set DB_DRIVER=sqlite to run without a MySQL server.
export async function createDb() {
  if (process.env.DB_DRIVER === 'sqlite') {
    const { DatabaseSync } = await import('node:sqlite');
    const d = new DatabaseSync(process.env.SQLITE_FILE || ':memory:');
    d.exec('PRAGMA foreign_keys = ON');
    d.exec(readFileSync(new URL('./schema.sqlite.sql', import.meta.url), 'utf8'));
    return {
      driver: 'sqlite',
      async all(sql, p = []) { return d.prepare(sql).all(...p).map((r) => ({ ...r })); },
      async get(sql, p = []) { const r = d.prepare(sql).get(...p); return r ? { ...r } : null; },
      async run(sql, p = []) { const r = d.prepare(sql).run(...p); return { insertId: Number(r.lastInsertRowid), changes: Number(r.changes) }; },
      async close() { d.close(); },
    };
  }

  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
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
  return {
    driver: 'mysql',
    async all(sql, p = []) { const [rows] = await pool.query(sql, p); return rows; },
    async get(sql, p = []) { const [rows] = await pool.query(sql, p); return rows[0] || null; },
    async run(sql, p = []) { const [r] = await pool.query(sql, p); return { insertId: Number(r.insertId || 0), changes: Number(r.affectedRows || 0) }; },
    async close() { await pool.end(); },
  };
}
