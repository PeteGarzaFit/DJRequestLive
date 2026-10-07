import React from 'react';

// Brand mark: a rounded app-icon badge holding a bold "D" whose counter is a play button.
// `color` and `accent` are kept so the studio and sign-in pages (gold theme) can recolor it.
export function Mark({ size = 30, color = '#fff', accent = '#1769e8', badge = false }) {
  const s = typeof size === 'number' ? size : undefined;
  return (
    <svg className="mk-mark" width={s} height={s} viewBox={badge ? '0 0 40 40' : '8 6 24 28'} aria-hidden="true"
      style={s ? undefined : { width: size, height: size }}>
      {badge && (
        <>
          <defs>
            <linearGradient id="mkg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4a97ff" /><stop offset="1" stopColor="#1257d6" />
            </linearGradient>
          </defs>
          <rect width="40" height="40" rx="11" fill="url(#mkg)" />
          <rect x=".5" y=".5" width="39" height="39" rx="10.5" fill="none" stroke="#fff" strokeOpacity=".28" />
        </>
      )}
      <path d="M11 9h8.4c6.5 0 10.6 4.4 10.6 11s-4.1 11-10.6 11H11V9z" fill={badge ? '#fff' : color} />
      <path d="M17.2 15v10l8.2-5-8.2-5z" fill={badge ? '#1a62e0' : accent} />
    </svg>
  );
}

// Horizontal lockup: [badge]  DJ REQUEST LIVE.  `size` is the badge size (px number or any CSS length);
// the wordmark scales with it. `stack` puts LIVE under DJ REQUEST for narrow spaces.
export default function Logo({ dark = false, size = 36, stack = false }) {
  const s = typeof size === 'number' ? size + 'px' : size;
  return (
    <span className={'mk-logo' + (dark ? ' dark' : '') + (stack ? ' stack' : '')} style={{ '--s': s }}>
      <Mark size={s} badge />
      <span className="mk-word"><b>DJ REQUEST</b><i>LIVE</i></span>
    </span>
  );
}
