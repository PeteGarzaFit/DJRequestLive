// Payment apps a DJ can accept tips in. Tips go straight from the guest to the DJ.
export const PAY = [
  { k: 'cash', name: 'Cash App', cls: 'ico-cash', ab: '$', ph: '$cashtag' },
  { k: 'venmo', name: 'Venmo', cls: 'ico-venmo', ab: 'V', ph: '@username' },
  { k: 'paypal', name: 'PayPal', cls: 'ico-paypal', ab: 'P', ph: 'paypal.me username' },
  { k: 'zelle', name: 'Zelle', cls: 'ico-zelle', ab: 'Z', ph: 'Email or phone on Zelle' },
  { k: 'apple', name: 'Apple Cash', cls: 'ico-apple', ab: '', ph: 'Phone number' },
];
export const clean = (s) => String(s || '').trim().replace(/^[@$]/, '');
export const money = (n) => '$' + (Math.round((+n || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export function payLink(k, p, amt, note) {
  const h = clean(p[k]);
  if (!h) return null;
  if (k === 'cash') return `https://cash.app/$${encodeURIComponent(h)}/${amt}`;
  if (k === 'venmo') return `https://venmo.com/?txn=pay&recipients=${encodeURIComponent(h)}&amount=${amt}&note=${encodeURIComponent(note)}`;
  if (k === 'paypal') return `https://paypal.me/${encodeURIComponent(h)}/${amt}USD`;
  return null; // Zelle and Apple Cash have no web pay link
}
export const handleLabel = (k, v) => (k === 'cash' ? '$' + clean(v) : k === 'venmo' ? '@' + clean(v) : k === 'paypal' ? 'paypal.me/' + clean(v) : v);
export const requestText = (g) => {
  const song = g.song.trim() || '(song)';
  const by = g.artist.trim();
  let t = `🎵 ${song}${by ? ' — ' + by : ''}`;
  if (g.from.trim()) t += `\nFrom: ${g.from.trim()}`;
  if (g.note.trim()) t += `\n${g.note.trim()}`;
  return t;
};
