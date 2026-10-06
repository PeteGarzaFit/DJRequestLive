import React from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icons.jsx';
import { Laptop, Phone, StudioScreen, QrScreen, MiniGuest } from '../components/Devices.jsx';
import { THEMES } from '../lib/theme.js';

const STEPS = [
  ['qr', 'Share Your QR Code', 'Display it at your booth, on screens, or on social media.'],
  ['music', 'Guests Request Songs', 'Your crowd submits requests and can add a tip.'],
  ['queue', 'Manage in Real Time', 'Approve, decline, and control your queue instantly.'],
  ['chart', 'Keep the Party Going', 'More engagement, happier crowds, bigger tips.'],
];
const FEATURES = [
  ['music', 'Live Requests', 'See and manage requests as they come in.'],
  ['phone', 'Mobile Friendly', 'Works on any phone. No app for guests.'],
  ['dollar', 'Tips Go to You', 'Cash App, Venmo, PayPal, Zelle and Apple Cash.'],
  ['palette', 'Your Look', 'Colors, fonts, logo and wallpaper on your own page.'],
  ['qr', 'Printable QR Poster', 'Download a ready-to-print poster for your booth.'],
  ['shield', 'Secure & Reliable', 'Built for working DJs, on your own web address.'],
];
const LOOKS = [
  { name: 'DJ Nova', tag: 'House · Afro · Latin', t: THEMES[0], bg: 'midnight', f: 'bold', tips: [5, 10, 20] },
  { name: 'DJ Kaya', tag: 'Open format · Weddings', t: THEMES[1], bg: 'plum', f: 'classic', tips: [10, 20, 50] },
  { name: 'DJ Volt', tag: 'Hip hop · Club', t: THEMES[2], bg: 'navy', f: 'street', tips: [5, 10, 25] },
];

export default function Home() {
  return (
    <div className="mk">
      <section className="mk-hero">
        <header className="mk-nav">
          <Link to="/" aria-label="DJ Request Live home"><Logo /></Link>
          <nav><a href="#how">How It Works</a><a href="#features">Features</a><a href="#looks">Your Look</a><a href="#pricing">Pricing</a></nav>
          <div className="mk-nav-r"><Link to="/login">Log in</Link><Link className="mk-btn sm" to="/signup">Get Started</Link></div>
        </header>
        <div className="mk-hero-grid">
          <div className="mk-hero-copy">
            <span className="mk-kicker">DJ audience engagement</span>
            <h1>Your crowd.<br /><span>Your requests.</span><br />Your set.</h1>
            <p>The easiest way to take song requests, boost engagement, and get tipped, straight to your own Cash App, Venmo, PayPal or Zelle.</p>
            <div className="mk-actions">
              <Link className="mk-btn" to="/signup">Get Started Free <Icon name="arrow" size={18} /></Link>
              <a className="mk-btn ghost" href="#how"><Icon name="play" size={14} /> See How It Works</a>
            </div>
            <ul className="mk-mini">
              <li><Icon name="bolt" /><b>Easy setup</b><span>Live in minutes</span></li>
              <li><Icon name="users" /><b>More engagement</b><span>Keep the crowd involved</span></li>
              <li><Icon name="dollar" /><b>More tips</b><span>Requests that pay</span></li>
            </ul>
          </div>
          <div className="mk-devices" aria-label="Request Live on a laptop and a phone">
            <div className="mk-glow" />
            <Laptop className="mk-laptop"><StudioScreen /></Laptop>
            <Phone className="mk-phone"><QrScreen /></Phone>
          </div>
        </div>
      </section>

      <section id="how" className="mk-how">
        <span className="mk-kicker dark">How it works</span>
        <h2>Simple. Powerful. <span>Built for DJs.</span></h2>
        <p className="lead">Set up in minutes and start taking requests from your crowd.</p>
        <ol className="mk-steps">
          {STEPS.map(([ic, t, d], i) => (
            <li key={t}>
              <span className="mk-step-ic"><Icon name={ic} size={26} /></span>
              <b>{i + 1}. {t}</b><p>{d}</p>
              {i < 3 && <Icon className="mk-step-arrow" name="arrow" size={18} />}
            </li>
          ))}
        </ol>
      </section>

      <section id="features" className="mk-feat">
        <div className="mk-feat-in">
          <div className="mk-feat-copy">
            <span className="mk-kicker">Built for modern DJs</span>
            <h2>Everything you need<br />to run a better set.</h2>
            <p>From private events to packed venues, DJ Request Live gives you the tools to stay in control and keep your crowd engaged.</p>
            <Link className="mk-btn" to="/signup">Get Started Free <Icon name="arrow" size={18} /></Link>
          </div>
          <div className="mk-feat-grid">
            {FEATURES.map(([ic, t, d]) => (
              <div className="mk-card" key={t}><span><Icon name={ic} size={22} /></span><div><b>{t}</b><p>{d}</p></div></div>
            ))}
          </div>
        </div>
      </section>

      <section id="looks" className="mk-looks">
        <span className="mk-kicker">Make it yours</span>
        <h2>Your page, <span>your look.</span></h2>
        <p className="lead">Pick colors, fonts and a background. Add your logo, wallpaper and photos. Guests see your brand, not ours.</p>
        <div className="mk-looks-row">
          {LOOKS.map((l, i) => (
            <Phone key={l.name} className={'mk-mini-phone m' + i}><MiniGuest name={l.name} tag={l.tag} theme={l.t} bg={l.bg} font={l.f} tips={l.tips} /></Phone>
          ))}
        </div>
      </section>

      <section id="pricing" className="mk-price">
        <span className="mk-kicker dark">Pricing</span>
        <h2>Start free. Upgrade when you're ready.</h2>
        <div className="mk-price-card">
          <div><span className="mk-kicker dark">DJ Pro</span><strong>$14.99<small>/month</small></strong><p>Everything you need to turn requests into a better crowd experience.</p></div>
          <ul><li><Icon name="check" size={18} />Unlimited requests</li><li><Icon name="check" size={18} />Paid boosts &amp; tips</li><li><Icon name="check" size={18} />Live queue management</li><li><Icon name="check" size={18} />Your own page &amp; QR poster</li></ul>
          <Link className="mk-btn" to="/signup">Start Free</Link>
        </div>
      </section>

      <section className="mk-cta">
        <h2>Give your crowd a better way<br />to connect with you.</h2>
        <p>Scan. Request. Dance.</p>
        <Link className="mk-btn" to="/signup">Get Started Free <Icon name="arrow" size={18} /></Link>
      </section>

      <footer className="mk-foot"><Logo /><span>© {new Date().getFullYear()} DJ Request Live</span><span>Your crowd. Your requests. Your set.</span></footer>
    </div>
  );
}
