import React from 'react';

// Brand mark: a "D" with a play triangle cut into it, plus the wordmark.
export function Mark({ size = 30, color = '#fff', accent = '#1769e8' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M5 4h10.5C23 4 28 9 28 16s-5 12-12.5 12H5V4z" fill={color} />
      <path d="M13 11.2v9.6l8-4.8-8-4.8z" fill={accent} />
    </svg>
  );
}

export default function Logo({ dark = false }) {
  return (
    <span className={'mk-logo' + (dark ? ' dark' : '')}>
      <Mark color={dark ? '#0b0d10' : '#fff'} />
      <span><em>DJ</em> REQUEST<b>LIVE</b></span>
    </span>
  );
}
