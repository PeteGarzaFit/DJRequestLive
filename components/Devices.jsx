import React from 'react';
import Logo from './Logo.jsx';
import Icon from './Icons.jsx';
import { themeStyle, initials } from '../lib/theme.js';

/* Generic silver-aluminum laptop and black-titanium phone. Original shapes, no brand marks.
   Screens are sized in container units (cqw) so the UI inside scales with the device. */

export function Laptop({ children, className = '' }) {
  return (
    <div className={'dv-laptop ' + className}>
      <div className="dv-lid">
        <div className="dv-bezel">
          <span className="dv-cam" />
          <div className="dv-screen">{children}</div>
        </div>
      </div>
      <div className="dv-hinge" />
      <div className="dv-base"><span className="dv-notch" /></div>
    </div>
  );
}

function StatusIcons() {
  return (
    <svg viewBox="0 0 72 18" aria-hidden="true">
      <rect x="0" y="11" width="3.6" height="5" rx="1" /><rect x="5.2" y="8" width="3.6" height="8" rx="1" />
      <rect x="10.4" y="5" width="3.6" height="11" rx="1" /><rect x="15.6" y="2" width="3.6" height="14" rx="1" />
      <path d="M33 16l3-3.1a4.2 4.2 0 0 0-6 0zM27.6 10.7a7.7 7.7 0 0 1 10.8 0l-1.8 1.9a5.2 5.2 0 0 0-7.2 0zM24.2 7.2a12.6 12.6 0 0 1 17.6 0L40 9.1a10 10 0 0 0-14 0z" />
      <rect x="46" y="2.6" width="23" height="12.4" rx="3.8" fill="none" stroke="#fff" strokeOpacity=".5" />
      <rect x="47.8" y="4.4" width="19.4" height="8.8" rx="2.4" />
      <path d="M70.6 6.6v4.8a2.4 2.4 0 0 0 0-4.8z" opacity=".5" />
    </svg>
  );
}

export function Phone({ children, className = '' }) {
  return (
    <div className={'dv-phone ' + className}>
      <span className="dv-btn dv-btn-a" /><span className="dv-btn dv-btn-b" /><span className="dv-btn dv-btn-c" /><span className="dv-btn dv-btn-p" />
      <div className="dv-frame">
        <div className="dv-pscreen">
          <span className="dv-punch" />
          <div className="dv-sb"><span>9:41</span><StatusIcons /></div>
          {children}
          <span className="dv-home" />
        </div>
      </div>
    </div>
  );
}

const SAMPLE = [
  { s: "Choosin' Texas", a: 'Ella Langley', g: 'Sarah', t: 10, i: 'EL' },
  { s: 'Boston', a: 'Stella Lefty', g: 'Mike', t: 5, i: 'SL' },
  { s: 'Been By Now', a: 'Morgan Wallen', g: 'Alex', t: 5, i: 'MW' },
  { s: 'Hate That I Made You Love Me', a: 'Ariana Grande', g: 'Jordan', t: 10, i: 'AG' },
  { s: 'Dracula', a: 'Tame Impala & JENNIE', g: 'Chris', t: 5, i: 'TI' },
  { s: 'Espresso', a: 'Sabrina Carpenter', g: 'Taylor', t: 10, i: 'SC' },
  { s: 'Pink Pony Club', a: 'Chappell Roan', g: 'Maya', t: 5, i: 'CR' },
];
const NAV = [['music', 'Live Requests', true], ['play', 'Now Playing'], ['queue', 'Queue'], ['dollar', 'Tips'], ['chart', 'Analytics'], ['gear', 'Settings']];

// What the DJ sees on a laptop: the live request queue.
export function StudioScreen() {
  return (
    <div className="ds">
      <aside className="ds-side">
        <div className="ds-brand"><Logo size="2.7cqw" stack /></div>
        {NAV.map(([ic, l, on]) => <div key={l} className={'ds-nav' + (on ? ' on' : '')}><Icon name={ic} size={14} />{l}</div>)}
      </aside>
      <section className="ds-main">
        <div className="ds-head">
          <div><h4>Live Requests</h4><p>Control your crowd in real time.</p></div>
          <span className="ds-live"><i />Accepting requests</span>
        </div>
        {SAMPLE.map((r) => (
          <div className="ds-row" key={r.s}>
            <span className="ds-art">{r.i}</span>
            <span className="ds-song"><b>{r.s}</b><small>{r.a} · {r.g}</small></span>
            <span className={'ds-tip' + (r.t >= 10 ? ' hot' : '')}>${r.t}</span>
            <span className="ds-ok">Approve</span><span className="ds-no">Decline</span>
          </div>
        ))}
        <div className="ds-now">
          <span className="ds-art">▶</span>
          <span><small>Now playing</small><b>Bidi Bidi Bom Bom</b></span>
          <span className="ds-bars">{[60, 100, 40, 80, 55, 90].map((h, i) => <i key={i} style={{ height: h + '%' }} />)}</span>
        </div>
      </section>
    </div>
  );
}

// What a guest sees right after scanning the poster.
export function QrScreen() {
  return (
    <div className="ps">
      <div className="ps-brand"><Logo size="8.5cqw" /></div>
      <h5>Scan to<br />request a song</h5>
      <img src="/djrequestlive-qr.svg" alt="Sample QR code" />
      <div className="ps-btn">Request a song</div>
      <p>Pick a song · send a tip · hear it live</p>
    </div>
  );
}

// A tiny guest page in a DJ's own colors, for the "make it yours" section.
export function MiniGuest({ name, tag, theme, bg, font, tips = [5, 10, 20] }) {
  return (
    <div className="mg" style={themeStyle({ a: theme.a, gl: theme.gl, bg, f: font })}>
      <div className="mg-vinyl"><span>{initials(name)}</span></div>
      <i className="mg-live">● Taking requests</i>
      <h6>{name}</h6>
      <p>{tag}</p>
      <div className="mg-card"><b>What should I play?</b><span className="mg-in">Song</span></div>
      <div className="mg-tips">{tips.map((t, i) => <span key={t} className={i === 1 ? 'on' : ''}>${t}</span>)}</div>
      <div className="mg-cta">Send it</div>
    </div>
  );
}
