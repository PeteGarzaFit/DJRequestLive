import React from 'react';
import Logo, { Mark } from './Logo.jsx';
import Icon from './Icons.jsx';
import { themeStyle, initials } from '../lib/theme.js';

/* Generic silver-aluminum laptop and black-titanium phone. Original shapes, no brand marks.
   Screens are sized in container units (cqw) so the UI inside scales with the device. */

const DOCK = ['#2f7bff,#1544b8', '#ff6a5c,#c92a52', '#34d399,#0f8f6a', '#ffb14a,#e2701a', '#a78bfa,#5b3fd4', '#38bdf8,#0b6fb8'];

export function Laptop({ children, className = '' }) {
  return (
    <div className={'dv-laptop ' + className}>
      <div className="dv-lid">
        <div className="dv-bezel">
          <div className="dv-screen">
            <div className="dv-wall">
              <i className="dv-orb o1" /><i className="dv-orb o2" /><i className="dv-orb o3" />
              <svg className="dv-silk" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
                <path d="M-5 70C30 40 60 95 100 62S150 30 170 48" /><path d="M-5 80C35 52 65 100 105 72S150 46 170 60" /><path d="M-5 90C40 66 70 104 110 82S152 62 170 74" />
              </svg>
            </div>
            <div className="dv-menubar">
              <span className="dv-mb-l"><Mark size="1.25cqw" badge /><b>DJ Request Live</b><span>File</span><span>Edit</span><span>View</span><span>Window</span></span>
              <span className="dv-notch-cam" />
              <span className="dv-mb-r"><svg viewBox="0 0 24 18" aria-hidden="true"><path d="M12 16l3-3.2a4.4 4.4 0 0 0-6 0zM6.2 10.6a8.2 8.2 0 0 1 11.6 0l-1.8 1.9a5.6 5.6 0 0 0-8 0zM2.6 7a13.2 13.2 0 0 1 18.8 0l-1.8 1.9a10.6 10.6 0 0 0-15.2 0z" /></svg>Tue 9:41 PM</span>
            </div>
            <div className="dv-win">
              <div className="dv-title"><i /><i /><i /><span>Live Requests — Saturday Night</span></div>
              <div className="dv-win-body">{children}</div>
            </div>
            <div className="dv-dock">
              <span className="dv-dk" style={{ background: 'none', boxShadow: 'none' }}><Mark size="100%" badge /></span>
              {DOCK.map((g) => <span key={g} className="dv-dk" style={{ background: `linear-gradient(160deg,${g.split(',')[0]},${g.split(',')[1]})` }} />)}
            </div>
          </div>
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
        {SAMPLE.slice(0, 6).map((r) => (
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

// The page a DJ's guests see after scanning: now playing, search, tip, send. Themed from the DJ's own colors.
const SONGS = {
  'DJ Nova': { now: ['Cruel Summer', 'Taylor Swift'], list: [['Espresso', 'Sabrina Carpenter'], ['Gimme a Hug', 'Drake']] },
  'DJ Kaya': { now: ['Golden Hour', 'JVKE'], list: [['Valerie', 'Amy Winehouse'], ['September', 'Earth, Wind & Fire']] },
  'DJ Volt': { now: ['Rich Flex', 'Drake & 21 Savage'], list: [['Sicko Mode', 'Travis Scott'], ['Wait For U', 'Future']] },
};
const Ico = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  note: <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
};
const I = ({ n }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{Ico[n]}</svg>;

export function MiniGuest({ name, tag, theme, bg, font, tips = [5, 10, 20] }) {
  const d = SONGS[name] || SONGS['DJ Nova'];
  return (
    <div className="mg" style={themeStyle({ a: theme.a, gl: theme.gl, bg, f: font })}>
      <i className="mg-orb a" /><i className="mg-orb b" />
      <div className="mg-top">
        <span className="mg-live"><i />Taking requests</span>
        <div className="mg-vinyl"><span>{initials(name)}</span></div>
        <h6>{name}</h6>
        <p>{tag}</p>
      </div>
      <div className="mg-now">
        <span className="mg-cover" />
        <span className="mg-meta"><small>Now playing</small><b>{d.now[0]}</b><em>{d.now[1]}</em></span>
        <span className="mg-eq">{[55, 100, 45, 80, 62].map((h, i) => <i key={i} style={{ height: h + '%', animationDelay: i * 0.12 + 's' }} />)}</span>
      </div>
      <div className="mg-search"><I n="search" /><span>Search any song or artist</span></div>
      <div className="mg-list">
        {d.list.map(([s, a], i) => (
          <div className="mg-row" key={s}>
            <span className="mg-cover sm" style={{ '--rot': i * 70 + 'deg' }} />
            <span className="mg-meta"><b>{s}</b><em>{a}</em></span>
            <span className="mg-add"><I n="plus" /></span>
          </div>
        ))}
      </div>
      <div className="mg-tiplabel">Add a tip to move it up</div>
      <div className="mg-tips">{tips.map((t, i) => <span key={t} className={i === 1 ? 'on' : ''}>${t}</span>)}</div>
      <div className="mg-cta">Send request</div>
      <p className="mg-foot">Tips go straight to {name}</p>
    </div>
  );
}
