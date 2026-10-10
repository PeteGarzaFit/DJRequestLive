import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icons.jsx';
import { Laptop, Phone, StudioScreen, QrScreen, MiniGuest } from '../components/Devices.jsx';
import LightRays from '../components/reactbits/LightRays.jsx';
import SplitText from '../components/reactbits/SplitText.jsx';
import Magnet from '../components/reactbits/Magnet.jsx';
import SpotlightCard from '../components/reactbits/SpotlightCard.jsx';
import { THEMES } from '../lib/theme.js';

gsap.registerPlugin(ScrollTrigger, useGSAP);

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
const SPOTLIGHT_STYLE = { '--spotlight-card-surface': '#0b0f15', '--spotlight-card-border': '#1d2430', '--spotlight-card-shadow': 'none' };

function useMedia(query) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

// Lenis smooth scroll, driven by GSAP's ticker so ScrollTrigger stays in sync.
// Only lives while the homepage is mounted; the app pages keep native scrolling.
function useSmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({ anchors: true, autoRaf: false });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
    };
  }, []);
}

function useHomeMotion(scope) {
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add({ motion: '(prefers-reduced-motion: no-preference)', wide: '(min-width: 601px)' }, (ctx) => {
      const { motion, wide } = ctx.conditions;
      if (!motion) return;

      // Hero intro
      const tl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.9 } });
      tl.from('.mk-nav > *', { y: -20, autoAlpha: 0, stagger: 0.08, duration: 0.6 })
        .from('.mk-hero-kicker', { y: 10, autoAlpha: 0, duration: 0.5 }, '-=0.3')
        .from('.mk-line-in', { yPercent: 110, stagger: 0.12, duration: 1 }, '-=0.3')
        .from('.mk-hero-copy > p', { y: 20, autoAlpha: 0 }, '-=0.6')
        .from('.mk-actions', { y: 20, autoAlpha: 0 }, '-=0.6')
        .from('.mk-mini li', { y: 16, autoAlpha: 0, stagger: 0.07, duration: 0.6 }, '-=0.5')
        .from('.mk-glow', { autoAlpha: 0, duration: 1.6 }, 0.3)
        .from('.mk-laptop', { y: 80, scale: 0.94, autoAlpha: 0, duration: 1.2 }, 0.35)
        .from('.mk-phone', { x: 60, y: 40, rotate: 8, autoAlpha: 0, duration: 1.1, ease: 'back.out(1.4)' }, 0.75);

      // Devices drift apart as the hero scrolls away
      const heroScrub = { trigger: '.mk-hero', start: 'top top', end: 'bottom top', scrub: true };
      gsap.to('.mk-laptop', { yPercent: -6, ease: 'none', scrollTrigger: heroScrub });
      gsap.to('.mk-phone', { yPercent: -28, ease: 'none', scrollTrigger: { ...heroScrub } });

      // Section headings
      gsap.utils.toArray('.mk-reveal').forEach((el) => {
        gsap.from(el, { y: 40, autoAlpha: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } });
      });

      // How it works: steps rise, icons pop, arrows slide in
      const steps = { trigger: '.mk-steps', start: 'top 85%' };
      gsap.from('.mk-steps li', { y: 40, autoAlpha: 0, stagger: 0.14, duration: 0.8, ease: 'power3.out', scrollTrigger: steps });
      gsap.from('.mk-step-ic', { scale: 0.4, stagger: 0.14, duration: 0.9, ease: 'back.out(2.2)', scrollTrigger: { ...steps } });
      gsap.from('.mk-step-arrow', { x: -14, autoAlpha: 0, stagger: 0.14, duration: 0.6, delay: 0.35, scrollTrigger: { ...steps } });

      // Features
      gsap.from('.mk-feat-in', { y: 60, scale: 0.97, autoAlpha: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: '.mk-feat-in', start: 'top 85%' } });
      gsap.from('.mk-feat-grid .mk-card', { y: 30, autoAlpha: 0, stagger: 0.07, duration: 0.7, ease: 'power2.out', scrollTrigger: { trigger: '.mk-feat-grid', start: 'top 85%' } });

      // Your look: phones deal out like cards (desktop), fade up (phone)
      if (wide) {
        const deal = { trigger: '.mk-looks-row', start: 'top 95%', end: 'top 45%', scrub: 1 };
        gsap.from('.mk-mini-phone.m0', { xPercent: 75, rotate: -10, ease: 'none', scrollTrigger: deal });
        gsap.from('.mk-mini-phone.m2', { xPercent: -75, rotate: 10, ease: 'none', scrollTrigger: { ...deal } });
        gsap.from('.mk-mini-phone.m1', { y: 70, ease: 'none', scrollTrigger: { ...deal } });
      } else {
        gsap.from('.mk-mini-phone', { y: 40, autoAlpha: 0, stagger: 0.1, duration: 0.8, scrollTrigger: { trigger: '.mk-looks-row', start: 'top 90%' } });
      }

      // Pricing: card rises, price counts up
      const card = { trigger: '.mk-price-card', start: 'top 85%' };
      gsap.from('.mk-price-card', { y: 50, autoAlpha: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: card });
      const num = scope.current?.querySelector('.mk-price-num');
      if (num) {
        const price = { v: 0 };
        num.textContent = '0.00';
        gsap.to(price, { v: 14.99, duration: 1.4, ease: 'power2.out', delay: 0.2, scrollTrigger: { ...card }, onUpdate: () => { num.textContent = price.v.toFixed(2); } });
      }

      // CTA button
      gsap.from('.mk-cta .mk-magnet', { y: 30, autoAlpha: 0, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: '.mk-cta', start: 'top 75%' } });

      return () => { if (num) num.textContent = '14.99'; };
    });
  }, { scope });
}

function CtaButton({ children, magnet }) {
  return (
    <Magnet wrapperClassName="mk-magnet" padding={70} magnetStrength={4} disabled={!magnet}>
      <Link className="mk-btn" to="/signup">{children} <Icon name="arrow" size={18} /></Link>
    </Magnet>
  );
}

export default function Home() {
  const root = useRef(null);
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const finePointer = useMedia('(hover: hover) and (pointer: fine)');
  const magnet = finePointer && !reduced;
  useSmoothScroll();
  useHomeMotion(root);

  return (
    <div className="mk" ref={root}>
      <section className="mk-hero">
        {!reduced && (
          <div className="mk-rays" aria-hidden="true">
            <LightRays raysOrigin="top-center" raysColor="#5ea1ff" raysSpeed={0.8} lightSpread={0.85} rayLength={1.5}
              followMouse mouseInfluence={0.08} noiseAmount={0.06} distortion={0.04} />
          </div>
        )}
        <header className="mk-nav">
          <Link to="/" aria-label="DJ Request Live home"><Logo /></Link>
          <nav><a href="#how">How It Works</a><a href="#features">Features</a><a href="#looks">Your Look</a><a href="#pricing">Pricing</a></nav>
          <div className="mk-nav-r"><Link to="/login">Log in</Link><Link className="mk-btn sm" to="/signup">Get Started</Link></div>
        </header>
        <div className="mk-hero-grid">
          <div className="mk-hero-copy">
            <span className="mk-kicker mk-hero-kicker">DJ audience engagement</span>
            <h1>
              <span className="mk-line"><span className="mk-line-in">Your crowd.</span></span>
              <span className="mk-line"><span className="mk-line-in mk-blue">Your requests.</span></span>
              <span className="mk-line"><span className="mk-line-in">Your set.</span></span>
            </h1>
            <p>The easiest way to take song requests, boost engagement, and get tipped, straight to your own Cash App, Venmo, PayPal or Zelle.</p>
            <div className="mk-actions">
              <CtaButton magnet={magnet}>Get Started Free</CtaButton>
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
        <div className="mk-reveal">
          <span className="mk-kicker dark">How it works</span>
          <h2>Simple. Powerful. <span>Built for DJs.</span></h2>
          <p className="lead">Set up in minutes and start taking requests from your crowd.</p>
        </div>
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
              <SpotlightCard key={t} className="mk-card" style={SPOTLIGHT_STYLE} spotlightColor="#4a97ff"
                intensity={0.22} spotlightSize={220} borderGlow={0.9} proximity={60}>
                <span className="mk-card-ic"><Icon name={ic} size={22} /></span><div><b>{t}</b><p>{d}</p></div>
              </SpotlightCard>
            ))}
          </div>
        </div>
      </section>

      <section id="looks" className="mk-looks">
        <div className="mk-reveal">
          <span className="mk-kicker">Make it yours</span>
          <h2>Your page, <span>your look.</span></h2>
          <p className="lead">Pick colors, fonts and a background. Add your logo, wallpaper and photos. Guests see your brand, not ours.</p>
        </div>
        <div className="mk-looks-row">
          {LOOKS.map((l, i) => (
            <Phone key={l.name} className={'mk-mini-phone m' + i}><MiniGuest name={l.name} tag={l.tag} theme={l.t} bg={l.bg} font={l.f} tips={l.tips} /></Phone>
          ))}
        </div>
      </section>

      <section id="pricing" className="mk-price">
        <div className="mk-reveal">
          <span className="mk-kicker dark">Pricing</span>
          <h2>Start free. Upgrade when you're ready.</h2>
        </div>
        <div className="mk-price-card">
          <div><span className="mk-kicker dark">DJ Pro</span><strong>$<span className="mk-price-num">14.99</span><small>/month</small></strong><p>Everything you need to turn requests into a better crowd experience.</p></div>
          <ul><li><Icon name="check" size={18} />Unlimited requests</li><li><Icon name="check" size={18} />Paid boosts &amp; tips</li><li><Icon name="check" size={18} />Live queue management</li><li><Icon name="check" size={18} />Your own page &amp; QR poster</li></ul>
          <Link className="mk-btn" to="/signup">Start Free</Link>
        </div>
      </section>

      <section className="mk-cta">
        <h2 className="mk-reveal">Give your crowd a better way<br />to connect with you.</h2>
        <SplitText tag="p" className="mk-chant" text="Scan. Request. Dance." splitType="chars" delay={35} duration={0.9}
          ease="back.out(1.6)" from={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }} to={{ opacity: 1, y: 0 }}
          threshold={0.2} rootMargin="0px" />
        <div><CtaButton magnet={magnet}>Get Started Free</CtaButton></div>
      </section>

      <footer className="mk-foot"><Logo /><span>© {new Date().getFullYear()} DJ Request Live</span><span>Your crowd. Your requests. Your set.</span></footer>
    </div>
  );
}
