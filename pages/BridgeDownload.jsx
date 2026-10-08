import React from 'react';
import Logo from '../components/Logo.jsx';
import './bridge.css';

const GITHUB_RELEASE = 'https://github.com/PeteGarzaFit/DJRequestLive/releases/latest/download/';

export default function BridgeDownload(){
  return <div className="bridge-download">
    <header><Logo /><a href="/studio">DJ Studio</a></header>
    <main>
      <span className="bd-kicker">SUPER INTELLIGENCE DJ</span>
      <h1>SI DJ Bridge</h1>
      <p className="bd-lead">Connect your DJ software to DJ Request Live so SI DJ can understand what you are playing and help you decide what comes next.</p>
      <div className="bd-launch">
        <a className="bd-launch-btn" href="sidj-bridge://open">▶ Launch SI DJ Bridge</a>
        <small>If the Bridge is already installed on this computer, this opens it and starts the local connection automatically.</small>
      </div>
      <div className="bd-grid">
        <a className="bd-card" href={GITHUB_RELEASE + 'SI-DJ-Bridge.dmg'}>
          <span className="bd-icon"></span><b>Download for Mac</b><small>SI DJ Bridge desktop app</small><span className="bd-btn">Download Mac</span>
        </a>
        <a className="bd-card" href={GITHUB_RELEASE + 'SI-DJ-Bridge-Setup.exe'}>
          <span className="bd-icon">⊞</span><b>Download for Windows</b><small>SI DJ Bridge desktop app</small><span className="bd-btn">Download Windows</span>
        </a>
      </div>
      <section className="bd-how"><b>How it works</b><ol><li>Install SI DJ Bridge on the computer running your DJ software.</li><li>Open the Bridge and select/configure your DJ software.</li><li>Open DJ Request Live on your browser or iPad.</li><li>SI DJ reads the local set context and combines it with your crowd signals.</li></ol></section>
      <section className="bd-supported"><b>Current connections</b><div><strong>VirtualDJ</strong> — live now-playing connector</div><div><strong>Rekordbox</strong> — history-file connector</div><div><strong>Serato</strong> — coming next</div></section>
      <p className="bd-privacy"><b>Private by design.</b> The Bridge runs locally on your computer and exposes its feed only on that computer. DJ software credentials are not sent to DJ Request Live.</p>
      <p className="bd-note">Downloads are published from the official DJ Request Live GitHub release. Production code signing/notarization will be added before public commercial distribution.</p>
    </main>
  </div>;
}
