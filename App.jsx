import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';

const demoRequests = [
  { id: 1, song: 'Friends in Low Places', artist: 'Garth Brooks', guest: 'Pete', amount: 10, status: 'BOOSTED' },
  { id: 2, song: 'Mr. Brightside', artist: 'The Killers', guest: 'Sarah', amount: 0, status: 'NEW' },
  { id: 3, song: 'Neon Moon', artist: 'Brooks & Dunn', guest: 'Mike', amount: 5, status: 'NEW' },
];

function ConcertHero() {
  const bars = Array.from({ length: 28 });
  return <div className="concert-wrap" aria-label="Animated DJ concert stage">
    <div className="stage-glow" />
    <div className="moving-heads" aria-hidden="true">
      {Array.from({ length: 9 }).map((_, i) => <i key={i} style={{ '--i': i }} />)}
    </div>
    <div className="led-wall">
      <div className="led-logo">DJ</div>
      <div className="led-title">REQUEST <b>LIVE</b></div>
      <div className="led-wave" />
    </div>
    <div className="speaker-stack left" aria-hidden="true">
      <div className="speaker small" /><div className="speaker medium" /><div className="speaker sub" />
    </div>
    <div className="speaker-stack right" aria-hidden="true">
      <div className="speaker small" /><div className="speaker medium" /><div className="speaker sub" />
    </div>
    <div className="dj-booth">
      <div className="dj-silhouette"><span /></div>
      <div className="analyzer">{bars.map((_, i) => <i key={i} style={{ '--i': i }} />)}</div>
    </div>
    <div className="crowd" aria-hidden="true">
      {Array.from({ length: 18 }).map((_, i) => <i key={i} style={{ '--i': i }} />)}
    </div>
  </div>;
}

function Home() {
  return <main className="hero">
    <ConcertHero />
    <div className="hero-copy">
      <div className="eyebrow">DJ AUDIENCE ENGAGEMENT</div>
      <h1>Your crowd.<br/><span>Your requests.</span><br/>Your set.</h1>
      <p>DJ Request Live turns a simple QR code into your DJ booth's digital front door.</p>
      <div className="actions">
        <Link className="button primary" to="/dashboard">Open DJ Dashboard</Link>
        <Link className="button secondary" to="/pete-garza">View Guest Experience</Link>
      </div>
    </div>
  </main>;
}

function Dashboard() {
  return <main className="page">
    <header className="topbar"><div className="brand">DJ REQUEST <span>LIVE</span></div><div className="live">● LIVE EVENT</div></header>
    <section className="stats">
      <div><small>REQUESTS</small><strong>27</strong></div>
      <div><small>BOOSTS</small><strong>$85</strong></div>
      <div><small>GUESTS</small><strong>64</strong></div>
    </section>
    <section className="panel">
      <div className="panel-title"><h2>Live Requests</h2><button className="button primary small">Show QR</button></div>
      {demoRequests.map(r => <article className="request" key={r.id}>
        <div><b>{r.song}</b><span>{r.artist} · Requested by {r.guest}</span></div>
        <div className="request-actions">
          {r.amount > 0 && <em>${r.amount} BOOST</em>}
          <button>✓</button><button>×</button>
        </div>
      </article>)}
    </section>
  </main>;
}

function Guest({ slug }) {
  return <main className="guest">
    <div className="guest-card">
      <div className="avatar">DG</div>
      <div className="eyebrow">DJ GARZA · LIVE</div>
      <h1>What do you want to hear?</h1>
      <input placeholder="Search song or artist..." />
      <input placeholder="Your name" />
      <textarea placeholder="Message to the DJ (optional)" rows="3" />
      <button className="button primary full">Send Request</button>
      <button className="button boost full">⚡ Boost My Request</button>
      <p className="fine">No app. No account. Just request a song.</p>
    </div>
  </main>;
}

export default function App() {
  return <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/:slug" element={<Guest />} />
  </Routes>;
}