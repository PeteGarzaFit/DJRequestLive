import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';

const scryptAsync = (pw, salt) => new Promise((res, rej) => scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt);
  return `s1$${salt.toString('hex')}$${key.toString('hex')}`;
}
export async function verifyPassword(pw, stored) {
  try {
    const [v, saltHex, keyHex] = String(stored).split('$');
    if (v !== 's1') return false;
    const key = await scryptAsync(pw, Buffer.from(saltHex, 'hex'));
    const want = Buffer.from(keyHex, 'hex');
    return want.length === key.length && timingSafeEqual(key, want);
  } catch { return false; }
}
// Used so a wrong email takes about as long as a wrong password.
export async function fakeVerify() { await scryptAsync('x', Buffer.alloc(16)); }

export const newToken = () => randomBytes(32).toString('hex');
export const tokenHash = (t) => createHash('sha256').update(String(t)).digest('hex');

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Simple in-memory limiter (resets on restart). Good enough to blunt guessing and spam.
const buckets = new Map();
export function limited(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); return false; }
  b.n += 1;
  return b.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); }, 60000).unref();
