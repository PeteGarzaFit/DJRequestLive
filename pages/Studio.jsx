import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, toProfile, shrink, copyText, ago, errorText } from '../lib/api.js';
import { THEMES, BGS, FONTS, hex, tipList, initials } from '../lib/theme.js';
import { PAY, clean, money } from '../lib/pay.js';
import { toast } from '../lib/toast.js';
import GuestView from '../components/GuestView.jsx';
import { Mark } from '../components/Logo.jsx';
import Planner from './Planner.jsx';

const TABS = [['queue', 'SI QUE'], ['planner', 'AI Planner'], ['page', 'My page'], ['design', 'Design'], ['share', 'QR code']];
const FILTERS = [['new', 'New'], ['approved', 'Approved'], ['played', 'Played'], ['declined', 'Declined']];
const ORIGIN = () => window.location.origin;

function ping() {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    const a = new C(); const o = a.createOscillator(); const g = a.createGain(); o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.25, a.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.35);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.4); setTimeout(() => a.close(), 600);
  } catch { /* audio blocked */ }
}

export default function Studio() {
  const nav = useNavigate(); const [dj, setDj] = useState(null); const [fail, setFail] = useState(false);
  const [outdoorMode, setOutdoorMode] = useState(() => { try { return localStorage.getItem('rl.outdoor') === '1'; } catch { return false; } });
  const toggleOutdoor = () => setOutdoorMode((v) => { const n = !v; try { localStorage.setItem('rl.outdoor', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('rl.tab') || 'queue'; } catch { return 'queue'; } });
  const [saved, setSaved] = useState('Saved'); const djRef = useRef(null); const timer = useRef(null); djRef.current = dj;
  useEffect(() => { document.title = 'Studio · DJ Request Live'; }, []);
  useEffect(() => { api.me().then(({ user }) => setDj(user), (e) => { if (e.status === 401) nav('/login', { replace: true }); else setFail(true); }); }, [nav]);
  const saveNow = useCallback(async () => {
    clearTimeout(timer.current); const d = djRef.current; if (!d) return; if (!String(d.name || '').trim()) { setSaved('Name needed'); return; }
    try { await api.saveMe({ name: d.name, tagline: d.tagline || '', genres: d.genres || '', min_tip: +d.min_tip || 0, pay: d.pay, design: d.design, is_live: d.is_live }); setSaved('Saved'); }
    catch (e) { setSaved('Couldn’t save'); toast(errorText(e)); }
  }, []);
  const edit = useCallback((patch) => { setDj((d) => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch) })); setSaved('Saving…'); clearTimeout(timer.current); timer.current = setTimeout(saveNow, 700); }, [saveNow]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const goTab = (k) => { setTab(k); try { sessionStorage.setItem('rl.tab', k); } catch { /* ignore */ } window.scrollTo(0, 0); };
  const mergeMedia = (u) => setDj((d) => ({ ...d, logo: u.logo, wall: u.wall, photos: u.photos }));
  async function logout() { await saveNow(); try { await api.logout(); } catch { /* ignore */ } nav('/', { replace: true }); }
  if (fail) return <div className="rl rl-app"><div className="wrap"><section className="panel center"><h2 style={{ fontSize: 18 }}>We couldn’t load your page</h2><p className="hint">Refresh to try again.</p></section></div></div>;
  if (!dj) return <div className="rl rl-app"><div className="wrap"><div className="panel center"><p className="hint">Loading your studio…</p></div></div></div>;
  return (
    <div className={"rl rl-app" + (outdoorMode ? " outdoor-mode" : "")}><div className="wrap wide">
      <div className="shead"><Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}><Mark size={28} badge />DJ Request Live</Link>
        <div className="shead-r"><button className={"outdoor-toggle" + (outdoorMode ? " active" : "")} onClick={toggleOutdoor} aria-pressed={outdoorMode} title="High-contrast mode for bright outdoor sunlight">{outdoorMode ? "☀ Outdoor" : "☾ Dark"}</button><label className="golive" htmlFor="golive"><input type="checkbox" id="golive" checked={!!dj.is_live} onChange={(e) => { edit({ is_live: e.target.checked }); setTimeout(saveNow, 0); }} />{dj.is_live ? 'Taking requests' : 'Paused'}</label><button className="mini" onClick={logout}>Log out</button></div>
      </div>
      <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => goTab(k)}>{l}</button>)}</div>
      {tab === 'queue' && <QueueTab goTab={goTab} />}{tab === 'planner' && <Planner />}{tab === 'page' && <PageTab dj={dj} edit={edit} saved={saved} goTab={goTab} />}{tab === 'design' && <DesignTab dj={dj} edit={edit} saved={saved} mergeMedia={mergeMedia} goTab={goTab} />}{tab === 'share' && <ShareTab dj={dj} />}
    </div></div>
  );
}



function SIDJLiveLinkSetup() {
  const [bridge, setBridge] = useState(null);
  const [checking, setChecking] = useState(true);
  const check = useCallback(async () => {
    setChecking(true);
    try {
      const r = await fetch('http://127.0.0.1:8765/health', { cache: 'no-store' });
      if (!r.ok) throw new Error('offline');
      setBridge(await r.json());
    } catch { setBridge(null); }
    finally { setChecking(false); }
  }, []);
  useEffect(() => { check(); const t = setInterval(check, 5000); return () => clearInterval(t); }, [check]);
  const connected = !!bridge?.connected;
  return <div className="sidj-setup">
    <div className="sidj-setup-head"><div><div className="eyebrow">SI DJ LIVE LINK</div><h3>Connect your DJ software</h3><p>Install the local Bridge once. SI DJ can then read your live set context without asking for your Rekordbox or DJ-software password.</p></div><span className={connected?'sidj-status connected':'sidj-status'}>{connected?'● CONNECTED':'○ BRIDGE OFFLINE'}</span></div>
    <div className="sidj-setup-grid">
      <div className="sidj-setup-card"><b>1 · DOWNLOAD</b><span>Install the Bridge on the computer running your DJ software.</span><div className="sidj-downloads"><a className="btn btn-primary btn-sm" href="/downloads/djrequestlive-bridge-mac.dmg">Mac</a><a className="btn btn-ghost btn-sm" href="/downloads/djrequestlive-bridge-windows.exe">Windows</a></div></div>
      <div className="sidj-setup-card"><b>2 · CONNECT</b><span>Open the Bridge and choose your DJ software.</span><div className="sidj-software"><span>Rekordbox</span><span>VirtualDJ</span><span>Serato · coming soon</span></div></div>
      <div className="sidj-setup-card"><b>3 · LET SI DJ READ THE SET</b><span>Current track, recent history and music context become intelligence for recommendations.</span><button className="btn btn-ghost btn-sm" onClick={check} disabled={checking}>{checking?'Checking…':'Check connection'}</button></div>
    </div>
    <p className="hint">The Bridge stays on the DJ computer and binds locally. We do not need the DJ's Rekordbox password.</p>
  </div>;
}

function SIDJCommandCenter({ reqs }) {
  const [intel, setIntel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [nowPlaying, setNowPlaying] = useState(null);
  const lastSig = useRef('');

  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const r = await fetch('http://127.0.0.1:8765/now-playing', { cache: 'no-store' });
        if (!r.ok) return;
        const data = await r.json();
        if (live) setNowPlaying(data);
      } catch {
        if (live) setNowPlaying(null);
      }
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const analyze = useCallback(async () => {
    const active = reqs.filter((r) => r.status !== 'declined');
    if (!active.length && !nowPlaying?.nowPlaying) {
      setIntel(null);
      return;
    }
    setBusy(true);
    try {
      const top = [...active]
        .sort((a,b) => (Number(b.tip)||0) - (Number(a.tip)||0) || b.created_at - a.created_at)
        .slice(0,30);

      const requestText = top
        .map((r) =>
          (r.song || '') +
          (r.artist ? ' — ' + r.artist : '') +
          (r.tip ? ' [$' + Number(r.tip).toFixed(0) + ' tip]' : '') +
          (r.status === 'played' ? ' [PLAYED]' : '')
        )
        .join('\n');

      const played = active
        .filter((r) => r.status === 'played')
        .slice(0,20)
        .map((r) => r.song + (r.artist ? ' — ' + r.artist : ''))
        .join(', ');

      const liveTrack = nowPlaying?.nowPlaying;
      const liveText = liveTrack
        ? [
            'NOW PLAYING:',
            liveTrack.title || '',
            liveTrack.artist ? ' — ' + liveTrack.artist : '',
            liveTrack.bpm ? ' BPM ' + liveTrack.bpm : '',
            liveTrack.key ? ' KEY ' + liveTrack.key : '',
            liveTrack.genre ? ' GENRE ' + liveTrack.genre : ''
          ].join('')
        : 'NOW PLAYING: unavailable';

      const event = [
        'LIVE SI DJ QUEUE INTELLIGENCE.',
        'This is a real-time DJ event, not a generic event plan.',
        'Use the live DJ software track as the strongest current context when available.',
        'Analyze the live request signals and recommend what the DJ should consider next.',
        'DJ final say: never treat a request, tip, or recommendation as an automatic play command.',
        'Use the curated library and bridge intelligence. Look for genre momentum, cross-generational fit, energy, repeat requests, tips, useful transitions, and continuity from the current track.',
        'LIVE SOFTWARE DATA:',
        liveText,
        'LIVE REQUESTS:',
        requestText || 'none',
        'RECENT PLAYED REQUESTS:',
        played || 'none',
        'Return the strongest useful next-song options first.'
      ].join('\n');

      const { plan, planner_source } = await api.aiEventPlan(event);
      const songs = (plan?.recommendations || [])
        .flatMap((g) => (g.songs || []).map((song) => ({ ...song, phase: g.phase })))
        .slice(0,8);

      const text = requestText.toLowerCase();
      const genreWords = ['country','texas','tejano','cumbia','latin','hip-hop','r&b','pop','rock','dance','funk','reggaeton'];
      const signals = genreWords
        .map((g) => ({ g, n: text.split(g).length - 1 }))
        .filter((x) => x.n)
        .sort((a,b) => b.n - a.n)
        .slice(0,3);

      const paid = active.filter((r) => r.paid).reduce((sum,r) => sum + Number(r.tip || 0), 0);
      const repeat = {};
      active.forEach((r) => {
        const k = (r.song || '').toLowerCase();
        repeat[k] = (repeat[k] || 0) + 1;
      });
      const repeatTop = Object.entries(repeat)
        .sort((a,b) => b[1] - a[1])
        .find((x) => x[1] > 1);

      setIntel({
        planner_source,
        topRequests: [...active]
          .sort((a,b) => Number(b.tip||0) - Number(a.tip||0) || b.created_at - a.created_at)
          .slice(0,3),
        signals,
        paid,
        repeat: repeatTop ? { song: repeatTop[0], count: repeatTop[1] } : null,
        songs
      });
    } catch(e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }, [reqs, nowPlaying]);

  useEffect(() => {
    const trackSig = nowPlaying?.nowPlaying
      ? [nowPlaying.nowPlaying.artist, nowPlaying.nowPlaying.title, nowPlaying.nowPlaying.bpm].join(':')
      : '';
    const sig = reqs.map((r) => [r.id, r.status, r.tip, r.paid, r.song].join(':')).join('|') + '|' + trackSig;
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    if (reqs.length || trackSig) {
      const t = setTimeout(analyze, 500);
      return () => clearTimeout(t);
    }
    setIntel(null);
  }, [reqs, nowPlaying, analyze]);

  const connected = !!nowPlaying?.connected && !!nowPlaying?.nowPlaying;
  return (<>
    <SIDJLiveLinkSetup />
    <section className="panel sidj-command">
      <div className="shead">
        <div><div className="eyebrow">SUPER INTELLIGENCE DJ</div></div>
        <button className="btn btn-ghost btn-sm" onClick={analyze} disabled={busy}>
          {busy ? 'Reading the room…' : 'Analyze room'}
        </button>
      </div>
      <div className="sidj-live-link">
        <span className={connected ? 'dot on' : 'dot'}></span>
        <div>
          <b>{connected ? 'SI DJ LIVE LINK · CONNECTED' : 'SI DJ LIVE LINK · NOT CONNECTED'}</b>
          <small>{connected ? ((nowPlaying.source || 'DJ software') + ' · live track feed') : 'Run the local DJ Request Live Bridge on the DJ computer'}</small>
        </div>
      </div>
      {connected && <div className="sidj-now">
        <div className="eyebrow">NOW PLAYING</div>
        <strong>{nowPlaying.nowPlaying.title}</strong>
        <span>
          {nowPlaying.nowPlaying.artist}
          {nowPlaying.nowPlaying.bpm ? ' · ' + nowPlaying.nowPlaying.bpm + ' BPM' : ''}
          {nowPlaying.nowPlaying.key ? ' · ' + nowPlaying.nowPlaying.key : ''}
        </span>
      </div>}
      {!reqs.length && !connected ? (
        <p className="hint">Waiting for crowd signals or a connected DJ software feed.</p>
      ) : !intel ? (
        <p className="hint">SI DJ is reading requests, tips, played history and live DJ software context.</p>
      ) : <>
        <div className="sidj-grid">
          <div className="sidj-card"><b>LIVE SIGNAL</b><strong>{intel.signals.length ? intel.signals.map(x=>x.g).join(' · ') : 'Mixed room'}</strong><span>Request momentum</span></div>
          <div className="sidj-card"><b>TIP SIGNAL</b><strong>{'$'}{intel.paid.toFixed(0)}</strong><span>Paid requests</span></div>
          <div className="sidj-card"><b>REPEAT SIGNAL</b><strong>{intel.repeat ? intel.repeat.count + '×' : '—'}</strong><span>{intel.repeat ? intel.repeat.song : 'No repeat request yet'}</span></div>
        </div>
        <div className="sidj-section">
          <div className="eyebrow">TOP REQUEST SIGNALS</div>
          {intel.topRequests.map((r) => <div className="sidj-row" key={r.id}><div><strong>{r.song}</strong>{r.artist && <span>{r.artist}</span>}</div><b>{'$'}{Number(r.tip||0).toFixed(0)}</b></div>)}
        </div>
        <div className="sidj-section">
          <div className="eyebrow">WHAT SHOULD I CONSIDER NEXT?</div>
          {intel.songs.map((song,i) => <div className="sidj-row" key={song.title+'-'+song.artist+'-'+i}>
            <div><strong>{song.title}</strong><span>{song.artist}</span><small>{song.reason || 'Strong fit from the curated SI DJ library.'}</small></div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(song.title+' — '+song.artist)}>Copy</button>
          </div>)}
        </div>
        <p className="hint">SI DJ is your second brain — the DJ makes the final call. Source: {intel.planner_source === 'ai' ? 'AI + curated library' : 'curated fallback intelligence'}.</p>
      </>}
    </section>
  </>);
}/* ---------------- Queue ---------------- */
function QueueTab({ goTab }) {
  const [reqs, setReqs] = useState([]); const [loaded, setLoaded] = useState(false); const [qf, setQf] = useState('new'); const [fresh, setFresh] = useState(() => new Set()); const known = useRef(null);
  const load = useCallback(async () => {
    try { const { requests } = await api.requests();
      if (known.current) { const added = requests.filter((r) => !known.current.has(r.id)); if (added.length) { ping(); toast(`New request: ${added[0].song} · ${money(added[0].tip)}`); setFresh((s) => new Set([...s, ...added.map((r) => r.id)])); setTimeout(() => setFresh((s) => { const n = new Set(s); added.forEach((r) => n.delete(r.id)); return n; }), 12000); } }
      known.current = new Set(requests.map((r) => r.id)); setReqs(requests); setLoaded(true);
    } catch { /* keep the last list; the next poll retries */ }