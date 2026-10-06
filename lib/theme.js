// Colors, backgrounds and fonts a DJ can pick for their own guest page.
export const THEMES = [
  { k: 'gold', n: 'Gold Club', a: '#e9bb5f', gl: '#d8478e' },
  { k: 'pink', n: 'Neon Pink', a: '#ff5fae', gl: '#7a3cff' },
  { k: 'blue', n: 'Electric', a: '#5cd0ff', gl: '#3b5bff' },
  { k: 'sunset', n: 'Sunset', a: '#ff9a5c', gl: '#ff3d7f' },
  { k: 'mint', n: 'Mint', a: '#5ff0b0', gl: '#1aa3a3' },
  { k: 'ice', n: 'Ice', a: '#f4eff8', gl: '#6b5bd6' },
];
export const BGS = {
  midnight: { n: 'Midnight', ink: '#0d0a12', stage: '#16111d', deck: '#1e1828', line: '#2e2638' },
  navy: { n: 'Navy', ink: '#070b16', stage: '#0e1424', deck: '#151c32', line: '#252e4a' },
  plum: { n: 'Plum', ink: '#140913', stage: '#1e0f1d', deck: '#291629', line: '#3d233c' },
  black: { n: 'Black', ink: '#050505', stage: '#101010', deck: '#181818', line: '#2a2a2a' },
};
export const FONTS = {
  bold: { n: 'Bold', v: '"Unbounded","Arial Black",system-ui,sans-serif' },
  classic: { n: 'Classic', v: '"Playfair Display",Georgia,serif' },
  street: { n: 'Street', v: '"Bebas Neue","Arial Narrow",Impact,sans-serif' },
  clean: { n: 'Clean', v: '"Manrope",system-ui,sans-serif' },
};
export const hex = (c) => /^#[0-9a-f]{6}$/i.test(c || '');

function shade(c, k) {
  const n = parseInt(c.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Returns a React style object of CSS variables for a DJ's page.
export function themeStyle(p = {}) {
  const a = hex(p.a) ? p.a : '#e9bb5f';
  const g = hex(p.gl) ? p.gl : '#d8478e';
  const bg = BGS[p.bg] || BGS.midnight;
  const f = (FONTS[p.f] || FONTS.bold).v;
  return {
    '--gold': a, '--gold-deep': shade(a, -0.3), '--glow': g,
    '--ink': bg.ink, '--stage': bg.stage, '--deck': bg.deck, '--line': bg.line, '--display': f,
  };
}
export const tipList = (p = {}) => {
  const t = String(p.tips || '5,10,20,50').split(',').map((x) => +x.trim()).filter((x) => x > 0 && x <= 10000).slice(0, 4);
  return t.length ? t : [5, 10, 20, 50];
};
export const initials = (n) => (n || 'DJ').replace(/^dj\s+/i, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'DJ';
