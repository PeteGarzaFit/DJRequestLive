import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';

const requests = [
  { song:"Choosin' Texas", artist:'Ella Langley', guest:'Sarah', amount:'$10 BOOST' },
  { song:'Boston', artist:'Stella Lefty', guest:'Mike', amount:'$5' },
  { song:'Been By Now', artist:'Morgan Wallen', guest:'Alex', amount:'$5' },
  { song:'Hate That I Made You Love Me', artist:'Ariana Grande', guest:'Jordan', amount:'$10 BOOST' },
  { song:'Dracula', artist:'Tame Impala & JENNIE', guest:'Chris', amount:'$5' },
];

function Logo(){ return <div className="logo"><strong>DJ</strong><span>REQUEST<b>LIVE</b></span></div>; }

function ProductMockup(){
  return <div className="mockup-wrap">
    <div className="laptop">
      <div className="screen">
        <aside><Logo/><nav><a className="active">♫ Live Requests</a><a>▶ Now Playing</a><a>☷ Queue</a><a>＄ Tips</a><a>▥ Analytics</a><a>⚙ Settings</a></nav></aside>
        <section className="dashboard-preview">
          <div className="dash-head"><div><h3>Live Requests</h3><p>Control your crowd in real time.</p></div><span className="accept">● Accepting Requests</span></div>
          {requests.map((r,i)=><div className="request-row" key={i}><div className="song-art">{['FL','ND','MB','TH','NM'][i]}</div><div className="song"><b>{r.song}</b><span>{r.artist} · {r.guest}</span></div><em>{r.amount}</em><button>Approve</button><button className="decline">Decline</button></div>)}
        </section>
      </div>
    </div>
    <div className="phone">
      <div className="phone-screen"><Logo/><div className="phone-title">Scan to<br/>Request a Song</div><img className="qr" src="/djrequestlive-qr.svg" alt="Scan to open DJRequestLive.com" /><button>REQUEST A SONG</button></div>
    </div>
  </div>;
}

function Home(){
 return <main>
  <header className="nav"><Link to="/" className="nav-logo"><Logo/></Link><nav><a href="#features">Features</a><a href="#how">How It Works</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a></nav><div className="nav-actions"><a href="#login">Login</a><Link className="blue-btn small-btn" to="/dashboard">Get Started</Link></div></header>
  <section className="hero-section">
   <div className="hero-content"><div className="eyebrow">DJ AUDIENCE ENGAGEMENT</div><h1>Your crowd.<br/><span>Your requests.</span><br/>Your set.</h1><p>The easiest way to take song requests, boost engagement, and keep your dance floor moving.</p><div className="hero-actions"><Link className="blue-btn" to="/dashboard">Get Started Free <b>→</b></Link><a className="outline-btn" href="#how">◉ &nbsp;See How It Works</a></div><div className="mini-benefits"><div><b>ϟ</b><strong>Easy Setup</strong><span>Get running in minutes</span></div><div><b>♧</b><strong>More Engagement</strong><span>Keep your crowd involved</span></div><div><b>▥</b><strong>More Tips</strong><span>Turn requests into revenue</span></div></div></div>
   <ProductMockup/>
  </section>
  <section id="how" className="how-section"><div className="section-kicker">HOW IT WORKS</div><h2>Simple. Powerful. <span>Built for DJs.</span></h2><p className="section-lead">Set up in minutes and start taking requests from your crowd.</p><div className="steps"><Step n="1" icon="▦" title="Share Your QR Code" text="Display it at your booth, on screens, or social media."/><Step n="2" icon="♫" title="Guests Request Songs" text="Your crowd submits requests and can boost requests with tips."/><Step n="3" icon="☷" title="Manage in Real Time" text="Approve, decline, and control your queue instantly."/><Step n="4" icon="▥" title="Keep the Party Going" text="More engagement, happier crowds, and bigger opportunities."/></div></section>
  <section id="features" className="features-section"><div className="feature-intro"><div className="section-kicker">BUILT FOR MODERN DJS</div><h2>Everything you need<br/>to run a better set.</h2><p>From private events to packed venues, DJ Request Live gives you the tools to stay in control and keep your crowd engaged.</p><Link className="blue-btn" to="/dashboard">Get Started Free <b>→</b></Link></div><div className="feature-grid"><Feature icon="♫" title="Live Requests" text="See and manage requests in real time."/><Feature icon="▣" title="Mobile Friendly" text="Works on any device. No app needed."/><Feature icon="$" title="Tip Integration" text="Let guests boost their favorite songs."/><Feature icon="▥" title="Event Analytics" text="See what your crowd loves."/><Feature icon="⚙" title="Customizable Settings" text="Control what works for your event."/><Feature icon="⌑" title="Secure & Reliable" text="Built for professional DJs."/></div></section>
  <section id="pricing" className="pricing-section"><div className="section-kicker">PRICING</div><h2>Start free. Upgrade when you're ready.</h2><div className="price-card"><div><span className="price-label">DJ PRO</span><strong>$14.99<span>/month</span></strong><p>Everything you need to turn requests into a better crowd experience.</p></div><ul><li>Unlimited requests</li><li>Paid boosts & tips</li><li>Live queue management</li><li>Event analytics</li></ul><Link className="blue-btn" to="/dashboard">Start Free</Link></div></section>
  <section id="faq" className="final-cta"><div className="section-kicker">DJ REQUEST LIVE</div><h2>Give your crowd a better way<br/>to connect with you.</h2><p>Scan. Request. Dance.</p><Link className="blue-btn" to="/dashboard">Get Started Free <b>→</b></Link></section>
  <footer><Logo/><span>© 2026 DJ Request Live</span><span>Your crowd. Your requests. Your set.</span></footer>
 </main>;
}
function Step({n,icon,title,text}){return <div className="step"><div className="step-icon">{icon}</div><b>{n}. {title}</b><p>{text}</p></div>}
function Feature({icon,title,text}){return <div className="feature"><div className="feature-icon">{icon}</div><div><b>{title}</b><p>{text}</p></div></div>}
function Dashboard(){return <main className="simple-page"><header className="nav"><Link to="/" className="nav-logo"><Logo/></Link><span className="live">● LIVE EVENT</span></header><section className="simple-panel"><div className="section-kicker">DJ GARZA</div><h1>Live Requests</h1><p>Dashboard preview coming next. The premium homepage is ready.</p><Link className="blue-btn" to="/">Back Home</Link></section></main>}
function Guest(){return <main className="guest"><div className="guest-card"><Logo/><div className="section-kicker">DJ GARZA · LIVE</div><h1>What do you want to hear?</h1><input placeholder="Search song or artist..." /><input placeholder="Your name" /><textarea placeholder="Message to the DJ (optional)" rows="3" /><button className="blue-btn full">Send Request</button><button className="boost full">⚡ Boost My Request</button><p>No app. No account. Just request a song.</p></div></main>}
export default function App(){return <Routes><Route path="/" element={<Home/>}/><Route path="/dashboard" element={<Dashboard/>}/><Route path="/:slug" element={<Guest/>}/></Routes>}