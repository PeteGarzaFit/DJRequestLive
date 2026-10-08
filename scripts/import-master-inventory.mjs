import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

process.loadEnvFile?.();

const BATCH_SIZE = 500;
const DEFAULT_FILE = process.env.MASTER_INVENTORY_FILE || '';

function usage() {
  console.log(`
DJ Request Live master inventory importer

Required:
  MASTER_INVENTORY_FILE=/path/to/DJ_Request_Live_Master_Inventory.txt
  DJ_EMAIL=you@example.com   (or DJ_SLUG=your-dj-slug)

Example:
  MASTER_INVENTORY_FILE="$HOME/Desktop/DJ_Request_Live_Master_Inventory.txt" DJ_EMAIL="you@example.com" npm run inventory:import

The importer preserves every source row/file version. It replaces only the selected DJ's
current library snapshot inside a transaction; it never deduplicates by artist/title.
`);
}

function splitInventoryLine(line) {
  const left = line.split(' | ', 8);
  if (left.length !== 9) throw new Error('invalid inventory row: expected 10 fields');
  const tail = left[8].split(' | ');
  if (tail.length < 2) throw new Error('invalid inventory row: missing SOURCE field');
  const source = tail.pop();
  const filePath = tail.join(' | ');
  return [...left.slice(0, 8), filePath, source];
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function parseBpm(value) {
  const m = String(value || '').match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 && n <= 400 ? n : null;
}

function parseYear(value) {
  const m = String(value || '').match(/^(?:19|20)\\d{2}$/);
  if (!m) return null;
  return Number(m[0]);
}

function parseDuration(value) {
  const parts = String(value || '').trim().split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n) || n < 0) || parts.length < 2 || parts.length > 3) return null;
  let seconds = 0;
  if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
  else seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Number.isInteger(seconds) && seconds >= 0 ? seconds : null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    process.exit(0);
  }
  const fileArgIndex = args.indexOf('--file');
  const emailArgIndex = args.indexOf('--email');
  const slugArgIndex = args.indexOf('--slug');
  const file = fileArgIndex >= 0 ? args[fileArgIndex + 1] : DEFAULT_FILE;
  const email = emailArgIndex >= 0 ? args[emailArgIndex + 1] : process.env.DJ_EMAIL;
  const slug = slugArgIndex >= 0 ? args[slugArgIndex + 1] : process.env.DJ_SLUG;
  if (!file || (!email && !slug)) {
    usage();
    throw new Error('MASTER_INVENTORY_FILE plus DJ_EMAIL or DJ_SLUG is required');
  }
  return { file: path.resolve(file), email: email || '', slug: slug || '' };
}

function parseSourceHeader(lines) {
  const header = lines.slice(0, 5).join('\\n');
  const root = header.match(/# Scanned: ([^ (]+(?: [^ (]+)*?) \(recursive, read-only\)/i)?.[1] || '';
  const aliases = Number(header.match(/Excludes (\d+) Finder aliases/i)?.[1] || 0);
  return { root, aliases };
}

async function main() {
  const { file, email, slug } = parseArgs();
  const raw = await fs.readFile(file);
  const text = raw.toString('utf8');
  const lines = text.split(/\r?\n/);
  const expectedHeader = 'ARTIST | TITLE | ALBUM | GENRE | BPM | YEAR | FILE TYPE | DURATION | FILE PATH | SOURCE';
  const headerIndex = lines.findIndex((line) => line.trim() === expectedHeader);
  if (headerIndex < 0) throw new Error('inventory header not found');
  const { root, aliases } = parseSourceHeader(lines.slice(0, headerIndex + 1));

  const records = [];
  let skipped = 0;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    let fields;
    try { fields = splitInventoryLine(line); }
    catch (e) { throw new Error(`Line ${i + 1}: ${e.message}`); }

    const [artist, title, album, genre, bpm, year, fileType, duration, filePath, source] =
      fields.map((v) => String(v ?? '').trim());

    if (!filePath) {
      skipped++;
      continue;
    }

    records.push({
      artist,
      title,
      album,
      genre,
      bpm: parseBpm(bpm),
      year: parseYear(year),
      fileType: fileType.toUpperCase(),
      durationSeconds: parseDuration(duration),
      filePath,
      metadataSource: source,
      artistKey: normalizeKey(artist),
      titleKey: normalizeKey(title),
      pathHash: crypto.createHash('sha256').update(filePath, 'utf8').digest('hex'),
    });
  }

  const mysql = await import('mysql2/promise');
  const configuredHost = String(process.env.DB_HOST || '').trim().toLowerCase();
  const dbHost = (!configuredHost || configuredHost === 'localhost' || configuredHost === '::1' || configuredHost === '127.0.0.1')
    ? '127.0.0.1'
    : configuredHost;

  const pool = mysql.createPool({
    host: dbHost,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 4,
    charset: 'utf8mb4',
  });

  const conn = await pool.getConnection();
  const scanId = crypto.randomUUID();
  const sourceSha256 = crypto.createHash('sha256').update(raw).digest('hex');

  try {
    await conn.beginTransaction();

    const user = email
      ? (await conn.query('SELECT id, email, dj_name, slug FROM users WHERE email = ? LIMIT 1', [email]))[0][0]
      : (await conn.query('SELECT id, email, dj_name, slug FROM users WHERE slug = ? LIMIT 1', [slug]))[0][0];

    if (!user) throw new Error(`DJ account not found for ${email ? `email ${email}` : `slug ${slug}`}`);

    await conn.query(
      'INSERT INTO library_scans (id, user_id, source_file, source_root, scanned_at, row_count, excluded_aliases, source_sha256) VALUES (?,?,?,?,?,?,?,?)',
      [scanId, user.id, path.basename(file), root || null, null, records.length, aliases, sourceSha256],
    );

    // A scan is the current source-of-truth snapshot. Older scan records remain for auditability,
    // while library_tracks always contains the latest complete inventory for the DJ.
    await conn.query('DELETE FROM library_tracks WHERE user_id = ?', [user.id]);

    const sql = `INSERT INTO library_tracks
      (user_id, scan_id, artist, title, album, genre, bpm, year, file_type, duration_seconds, file_path, metadata_source, artist_key, title_key, path_hash)
      VALUES ?`;

    for (let offset = 0; offset < records.length; offset += BATCH_SIZE) {
      const batch = records.slice(offset, offset + BATCH_SIZE).map((r) => [
        user.id, scanId, r.artist, r.title, r.album, r.genre, r.bpm, r.year, r.fileType,
        r.durationSeconds, r.filePath, r.metadataSource, r.artistKey, r.titleKey, r.pathHash,
      ]);
      await conn.query(sql, [batch]);
      const done = Math.min(offset + batch.length, records.length);
      if (done % 5000 === 0 || done === records.length) {
        console.log(`Imported ${done.toLocaleString()} / ${records.length.toLocaleString()} tracks`);
      }
    }

    await conn.commit();

    console.log('');
    console.log('MASTER INVENTORY IMPORT COMPLETE');
    console.log(`DJ: ${user.dj_name} (${user.slug})`);
    console.log(`Rows imported: ${records.length.toLocaleString()}`);
    console.log(`Rows skipped: ${skipped}`);
    console.log(`Excluded Finder aliases: ${aliases}`);
    console.log(`Scan ID: ${scanId}`);
    console.log(`Source SHA-256: ${sourceSha256}`);
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('MASTER INVENTORY IMPORT FAILED');
  console.error(error?.stack || error);
  process.exit(1);
});
