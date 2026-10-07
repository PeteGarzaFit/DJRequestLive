import React from 'react';
import Logo from '../components/Logo.jsx';

export default function BridgeDownload(){
  return <div className="bridge-download">
    <header><Logo /><a href="/studio">DJ Studio</a></header>
    <main>
      <span className="bd-kicker">SUPER INTELLIGENCE DJ</span>
      <h1>SI DJ Bridge</h1>
      <p className="bd-lead">Connect your DJ software to DJ Request Live so SI DJ can understand what you're playing and help you decide what comes next.</p>
      <div className="bd-grid">
        <a className="bd-card" href="/downloads/SI-DJ-Bridge.dmg">
          <span className="bd-icon"></span><b>Download for Mac</b><small>Signed &amp; notarized DMG</small><span className="bd-btn">Download</span>
        </a>
        <a className="bd-card" href="/downloads/SI-DJ-Bridge-Setup.exe">
          <span className="bd-icon">⊞</span><b>Download for Windows</b><small>Signed installer</small><span className="bd-btn">Download</span>
        </a>
      </div>
      <section className="bd-how"><b>How it works</b><ol><li>Install SI DJ Bridge on the computer running your DJ software.</li><li>Choose Rekordbox or VirtualDJ.</li><li>Open DJ Request Live on your iPad or browser.</li><li>SI DJ reads the set context locally and combines it with your crowd signals.</li></ol></section>
      <p className="bd-privacy"><b>Private by design.</b> The Bridge runs locally on your computer. We don't need your Rekordbox or DJ-software password.</p>
    </main>
  </div>;
}
