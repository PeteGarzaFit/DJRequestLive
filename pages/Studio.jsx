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
import Intelligence from './Intelligence.jsx';

const TABS = [['intelligence', 'SUPER INTELLIGENCE'], ['queue', 'SI QUE'], ['planner', 'AI Planner'], ['page', 'My page'], ['design', 'Design'], ['share', 'QR code']];
const FILTERS = [['new', 'New'], ['approved', 'Approved'], ['played', 'Played'], ['declined', 'Declined']];
const ORIGIN = () => window.location.origin;
async function siDjEventKey(input) {
  try {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((x) => x.toString(16).padStart(2, '0')).join('');
  } catch {
    let h = 2166136261;
    for (const ch of String(input)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return String(h >>> 0).padStart(32, '0');
  }
}
function currentEventContext(playedAt) {
  try {
    const plan = JSON.parse(localStorage.getItem('djrl_event_curator') || '{}');
    if (!plan || !plan.eventType) return {};
    const moments = plan.eventType === 'Wedding'
      ? ['Pre-Ceremony','Processional','Bride Entrance','Unity / Special Ceremony Song','Recessional','Cocktail','Dinner / Background','Grand Entrance','Bridal Party Entrance','First Dance','Father–Daughter Dance','Mother–Son Dance','Anniversary Dance','Open Dance Floor','Cake Cutting','Bouquet Toss','Garter / Alternative','Toasts / Speeches','Last Dance','Must Play','Do Not Play']
      : ['Arrival / Cocktail','Dinner / Background','Main Event','Must Play','Do Not Play','Last Songs'];
    const d = new Date(Number(playedAt) || Date.now());
    if (plan.details?.eventDate) {
      const eventDate = String(plan.details.eventDate);
      const playedDate = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      if (eventDate !== playedDate) return { event_type: String(plan.eventType || '') };
    }
    const mins = d.getHours() * 60 + d.getMinutes();
    const times = plan.timelineTimes || {};
    const candidates = moments.map(item => {
      const raw = times[item];
      if (!raw) return null;
      const parts = String(raw).split(':').map(Number);
      if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
      return { item, minutes: parts[0] * 60 + parts[1] };
    }).filter(Boolean).sort((a,b) => a.minutes - b.minutes);
    const active = [...candidates].reverse().find(x => x.minutes <= mins);
    return {
      event_type: String(plan.eventType || ''),
      event_moment: active?.item || '',
      event_key_context: String(plan.name || plan.eventType || '').slice(0,160)
    };
  } catch { return {}; }
}

function bridgePlayedAt(track) {
  const raw = String(track?.raw || '');
  const m = raw.match(/^(\\d{1,2}):(\\d{2})\\s*:/);
  const now = new Date();
  if (!m) return Date.now();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() > Date.now() + 2 * 3600000) d.setDate(d.getDate() - 1);
  return d.getTime();
}


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
  useEffect(() => {
    let alive = true;
    let timerId = null;
    let cursor = Number(localStorage.getItem('djrl_si_bridge_cursor') || 0);

    const pollAndLearn = async () => {
      try {
        const r = await fetch('http://127.0.0.1:8765/played?after=' + encodeURIComponent(cursor), { cache: 'no-store' });
        if (!r.ok) return;
        const history = await r.json();
        if (history.reset) cursor = 0;
        const entries = Array.isArray(history.entries) ? history.entries : [];
        for (const track of entries) {
          const playedAt = track.date
            ? new Date(String(track.date).replaceAll('/', '-') + 'T' + String(track.time || '00:00') + ':00').getTime()
            : Date.now();
          const signature = [history.source || 'bridge', track.date || '', track.time || '', track.artist, track.title].join('|');
          const eventKey = await siDjEventKey(signature);
          await api.siDjRecordPlay({
            event_key: eventKey,
            played_at: Number.isFinite(playedAt) ? playedAt : Date.now(),
            artist: track.artist,
            title: track.title,
            source: history.source || 'bridge',
            raw: track.raw || '',
            ...currentEventContext(playedAt)
          });
        }
        if (history.reset) cursor = entries.length;
        else cursor = Number(history.cursor || (cursor + entries.length));
        if (alive) {
          try { localStorage.setItem('djrl_si_bridge_cursor', String(cursor)); } catch { /* ignore */ }
        }
      } catch {
        // Bridge or learning API can be offline without interrupting the Studio.
      }
    };

    pollAndLearn();
    timerId = setInterval(pollAndLearn, 3000);
    return () => { alive = false; if (timerId) clearInterval(timerId); };
  }, []);

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
        <div className="shead-r"><Link to="/wedding-planner" className="mini">Wedding planner</Link><button className={"outdoor-toggle" + (outdoorMode ? " active" : "")} onClick={toggleOutdoor} aria-pressed={outdoorMode} title="High-contrast mode for bright outdoor sunlight">{outdoorMode ? "☀ Outdoor" : "☾ Dark"}</button><label className="golive" htmlFor="golive"><input type="checkbox" id="golive" checked={!!dj.is_live} onChange={(e) => { edit({ is_live: e.target.checked }); setTimeout(saveNow, 0); }} />{dj.is_live ? 'Taking requests' : 'Paused'}</label><button className="mini" onClick={logout}>Log out</button></div>
      </div>
      <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => goTab(k)}>{l}</button>)}</div>
      {tab === 'intelligence' && <Intelligence />}{tab === 'queue' && <QueueTab goTab={goTab} />}{tab === 'planner' && <Planner />}{tab === 'page' && <PageTab dj={dj} edit={edit} saved={saved} goTab={goTab} />}{tab === 'design' && <DesignTab dj={dj} edit={edit} saved={saved} mergeMedia={mergeMedia} goTab={goTab} />}{tab === 'share' && <ShareTab dj={dj} />}
    </div></div>
  );
}



function SIDJCommandCenter({ reqs }) {
  const [intel, setIntel] = useState(null);
  const [bridge, setBridge] = useState({ connected: false, source: null, nowPlaying: null, error: 'Checking SI DJ Bridge…' });
  const [busy, setBusy] = useState(false);
  const [musicIntel, setMusicIntel] = useState(null);
  const [musicIntelBusy, setMusicIntelBusy] = useState(true);
  const lastSig = useRef('');

  const loadBridge = useCallback(async () => {
    try {
      const r = await fetch('http://127.0.0.1:8765/now-playing', { cache: 'no-store' });
      if (!r.ok) throw new Error('Bridge HTTP ' + r.status);
      setBridge(await r.json());
    } catch {
      setBridge({ connected: false, source: null, nowPlaying: null, error: 'Bridge offline' });
    }
  }, []);

  useEffect(() => {
    loadBridge();
    const t = setInterval(loadBridge, 2000);
    return () => clearInterval(t);
  }, [loadBridge]);

  useEffect(() => {
    let alive = true;
    api.musicIntelligence()
      .then((data) => { if (alive) setMusicIntel(data); })
      .catch(() => { if (alive) setMusicIntel({ available: false, lanes: [], subgenres: [] }); })
      .finally(() => { if (alive) setMusicIntelBusy(false); });
    return () => { alive = false; };
  }, []);

  const analyze = useCallback(async () => {
    const active = reqs.filter((r) => r.status !== 'declined');
    if (!active.length && !bridge.nowPlaying) {
      setIntel(null);
      return;
    }
    setBusy(true);
    try {
      const top = [...active].sort((a,b) => (Number(b.tip)||0) - (Number(a.tip)||0) || b.created_at - a.created_at).slice(0,30);
      const requestText = top.map((r) => (r.song||'') + (r.artist ? ' — ' + r.artist : '') + (r.tip ? ' [$' + Number(r.tip).toFixed(0) + ' tip]' : '') + (r.status === 'played' ? ' [PLAYED]' : '')).join('\n');
      const played = active.filter((r) => r.status === 'played').slice(0,20).map((r) => r.song + (r.artist ? ' — ' + r.artist : '')).join(', ');
      const now = bridge.nowPlaying;
      const liveTrack = now ? (now.title || 'Unknown title') + ' — ' + (now.artist || 'Unknown artist') + (now.bpm ? ' · ' + now.bpm + ' BPM' : '') + (now.key ? ' · ' + now.key : '') + (now.genre ? ' · ' + now.genre : '') : 'No live track available';
      const event = [
        'LIVE SI DJ INTELLIGENCE.',
        'This is a real-time DJ event, not a generic event plan.',
        'Analyze crowd requests, tips, played history, and the current DJ software track context.',
        'DJ final say: never treat a request, tip, or recommendation as an automatic play command.',
        'Use the current track as the transition anchor. Consider genre momentum, BPM/key compatibility, cross-generational fit, energy, repeat requests, tips, and useful transitions.',
        'CURRENT DJ SOFTWARE TRACK:', liveTrack,
        'CURRENT MUSIC INTELLIGENCE SNAPSHOT:',
        musicIntel?.available
          ? JSON.stringify((musicIntel.lanes || []).map((lane) => ({
              lane: lane.label,
              status: lane.status,
              items: (lane.items || []).slice(0, 5).map((x) => ({
                rank: x.rank, title: x.title, artist: x.artist, chart: x.chart, position: x.position, trend: x.trend
              }))
            })))
          : 'not available for this session',
        'LIVE REQUESTS:', requestText || 'none',
        'RECENT PLAYED REQUESTS:', played || 'none',
        'Return the strongest useful next-song options first.'
      ].join('\n');
      const { plan, planner_source } = await api.aiEventPlan(event);
      const songs = (plan?.recommendations || []).flatMap((g) => (g.songs || []).map((s) => ({ ...s, phase: g.phase }))).slice(0,8);
      const text = requestText.toLowerCase();
      const genreWords = ['country','texas','tejano','cumbia','latin','hip-hop','r&b','pop','rock','dance','funk','reggaeton'];
      const signals = genreWords.map((g) => ({ g, n: text.split(g).length - 1 })).filter((x) => x.n).sort((a,b) => b.n - a.n).slice(0,3);
      const paid = active.filter((r) => r.paid).reduce((s,r) => s + Number(r.tip || 0), 0);
      const repeat = {};
      active.forEach((r) => { const k = (r.song || '').toLowerCase(); repeat[k] = (repeat[k] || 0) + 1; });
      const repeatTop = Object.entries(repeat).sort((a,b) => b[1] - a[1]).find((x) => x[1] > 1);
      setIntel({
        planner_source,
        topRequests: [...active].sort((a,b) => Number(b.tip||0) - Number(a.tip||0) || b.created_at - a.created_at).slice(0,3),
        signals,
        paid,
        repeat: repeatTop ? { song: repeatTop[0], count: repeatTop[1] } : null,
        songs
      });
    } catch (e) {
      setIntel(null);
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }, [reqs, bridge.nowPlaying, musicIntel]);

  useEffect(() => {
    const sig = [
      reqs.map((r) => [r.id, r.status, r.tip, r.paid, r.song].join(':')).join('|'),
      bridge.nowPlaying ? JSON.stringify(bridge.nowPlaying) : ''
    ].join('||');
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    if (reqs.length || bridge.nowPlaying) {
      const t = setTimeout(analyze, 600);
      return () => clearTimeout(t);
    }
    setIntel(null);
  }, [reqs, bridge.nowPlaying, analyze]);

  const now = bridge.nowPlaying;
  const activeReqs = reqs.filter((r) => r.status !== 'declined');
  const paid = activeReqs.filter((r) => r.paid).reduce((s, r) => s + Number(r.tip || 0), 0);
  const pendingTips = activeReqs.filter((r) => !r.paid).reduce((s, r) => s + Number(r.tip || 0), 0);
  const played = reqs.filter((r) => r.status === 'played');
  const requestGenres = ['Country', 'Texas Country', 'Hip-Hop', 'R&B', 'Latin', 'Tejano', 'Dance', 'Rock'];
  const requestText = activeReqs.map((r) => (r.song || '') + ' ' + (r.artist || '') + ' ' + (r.note || '')).join(' ').toLowerCase();
  const roomSignals = requestGenres.map((g) => ({ label: g, n: requestText.split(g.toLowerCase()).length - 1 })).filter((x) => x.n > 0).sort((a,b) => b.n - a.n).slice(0, 4);

  return (<section className="panel sidj-command">
    <div className="shead">
      <div>
        <div className="eyebrow">SUPER INTELLIGENCE DJ</div>
        <strong style={{ display:'block', marginTop:4, fontSize:18 }}>Live Set Intelligence</strong>
        <span className="hint">Your live DJ information center — not just a request queue.</span>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={analyze} disabled={busy}>{busy ? 'Analyzing…' : 'Analyze room'}</button>
    </div>

    <div className="sidj-livebar" style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) auto', gap:12, alignItems:'center', padding:'14px 16px', margin:'14px 0 18px', border:'1px solid rgba(255,255,255,.10)', borderRadius:14 }}>
      <div>
        <div className="eyebrow">{bridge.connected ? 'BRIDGE CONNECTED' : 'BRIDGE OFFLINE'}</div>
        <strong style={{ display:'block', marginTop:4 }}>{now ? now.title : 'Waiting for DJ software…'}</strong>
        <span className="hint">{now ? [now.artist, now.bpm ? now.bpm + ' BPM' : '', now.key || '', now.genre || ''].filter(Boolean).join(' · ') : (bridge.error || 'Launch SI DJ Bridge on the DJ computer.')}</span>
      </div>
      <div style={{ textAlign:'right' }}>
        <div className="eyebrow">SOURCE</div>
        <strong>{bridge.source || '—'}</strong>
        {!bridge.connected && <div style={{ marginTop:6 }}><Link className="btn btn-ghost btn-sm" to="/bridge">Launch Bridge</Link></div>}
      </div>
    </div>

    <div className="sidj-grid">
      <div className="sidj-card"><b>SET STATUS</b><strong>{now ? 'LIVE' : 'WAITING'}</strong><span>{now ? 'DJ software track detected' : 'Waiting for Bridge context'}</span></div>
      <div className="sidj-card"><b>REQUESTS</b><strong>{activeReqs.length}</strong><span>{activeReqs.length === 1 ? 'active crowd request' : 'active crowd requests'}</span></div>
      <div className="sidj-card"><b>TIP SIGNAL</b><strong>{'$'}{paid.toFixed(0)}</strong><span>{pendingTips ? '$' + pendingTips.toFixed(0) + ' still to confirm' : 'No unpaid tip requests'}</span></div>
      <div className="sidj-card"><b>PLAYED HISTORY</b><strong>{played.length}</strong><span>requests marked played</span></div>
    </div>

    <div className="sidj-section">
      <div className="eyebrow">CURRENT TRACK INTELLIGENCE</div>
      {now ? <div className="sidj-row">
        <div><strong>{now.title || 'Unknown title'}</strong><span>{now.artist || 'Unknown artist'}</span><small>{[now.genre, now.bpm ? now.bpm + ' BPM' : '', now.key ? 'Key ' + now.key : ''].filter(Boolean).join(' · ') || 'Bridge is supplying live track context.'}</small></div>
        <b>{now.bpm ? now.bpm + ' BPM' : 'LIVE'}</b>
      </div> : <p className="hint">No current track yet. Launch the Bridge and SI DJ will anchor its intelligence to the DJ software.</p>}
    </div>

    <div className="sidj-section">
      <div className="eyebrow">ROOM PULSE</div>
      <div className="sidj-grid">
        <div className="sidj-card"><b>GENRE MOMENTUM</b><strong>{roomSignals.length ? roomSignals.map(x => x.label).join(' · ') : 'No clear signal yet'}</strong><span>{roomSignals.length ? 'Based on current requests' : 'Requests will shape this automatically'}</span></div>
        <div className="sidj-card"><b>HIGHEST TIP</b><strong>{activeReqs.length ? '$' + Math.max(...activeReqs.map(r => Number(r.tip || 0))).toFixed(0) : '$0'}</strong><span>{activeReqs.length ? 'strongest current request' : 'Waiting for requests'}</span></div>
        <div className="sidj-card"><b>REPEAT REQUESTS</b><strong>{intel?.repeat ? intel.repeat.count + '×' : '—'}</strong><span>{intel?.repeat ? intel.repeat.song : 'No repeat signal yet'}</span></div>
      </div>
    </div>

    <div className="sidj-section">
      <div className="eyebrow">LIVE CROWD SIGNALS</div>
      {activeReqs.length ? activeReqs.slice().sort((a,b) => Number(b.tip||0) - Number(a.tip||0) || b.created_at - a.created_at).slice(0,5).map((r) =>
        <div className="sidj-row" key={r.id}><div><strong>{r.song}</strong><span>{r.artist || 'Artist not supplied'}{r.from ? ' · from ' + r.from : ''}</span></div><b>{'$'}{Number(r.tip||0).toFixed(0)}</b></div>
      ) : <p className="hint">No crowd requests yet. This space will fill automatically as guests scan your QR code and request songs.</p>}
    </div>

    <div className="sidj-section">
      <div className="eyebrow">MUSIC INTELLIGENCE</div>
      {musicIntelBusy ? <p className="hint">Loading current chart and music intelligence data…</p> :
        musicIntel?.available && (musicIntel.lanes || []).some((lane) => lane.items?.length) ? <>
          <div className="sidj-grid">
            {(musicIntel.lanes || []).filter((lane) => lane.items?.length).slice(0, 8).map((lane) => {
              const x = lane.items[0];
              return <div className="sidj-card" key={lane.key}>
                <b>{lane.label}</b>
                <strong>{x.title}</strong>
                <span>{x.artist}{x.position ? ' · #' + x.position : ''}{x.trend ? ' · ' + x.trend : ''}</span>
              </div>;
            })}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>Fresh intelligence across national, Texas Country/Red Dirt, Regional Mexican, Tejano/Conjunto, Latin, hip-hop, dance and party lanes.</p>
        </> : <div className="sidj-grid">
          <div className="sidj-card"><b>CHARTS</b><strong>Ready</strong><span>Live chart intelligence will appear here when available.</span></div>
          <div className="sidj-card"><b>REGIONAL</b><strong>Texas + Latin</strong><span>Regional music lanes are part of the intelligence engine.</span></div>
          <div className="sidj-card"><b>DJ CONTEXT</b><strong>Bridge + Requests</strong><span>SI DJ can still reason from your live set context.</span></div>
        </div>}
    </div>

    <div className="sidj-section">
      <div className="eyebrow">WHAT SI DJ IS WATCHING</div>
      <div className="sidj-grid">
        {['Current track & transition compatibility','Crowd request momentum','Tips and high-value requests','Repeat requests and played history','Genre / regional momentum','Fresh music and chart signals'].map((x) =>
          <div className="sidj-card" key={x}><b>SI DJ</b><strong>Watching</strong><span>{x}</span></div>
        )}
      </div>
    </div>

    {intel?.songs?.length ? <div className="sidj-section">
      <div className="eyebrow">AI NEXT-SONG OPTIONS</div>
      {intel.songs.map((s,i) => <div className="sidj-row" key={s.title + '-' + s.artist + '-' + i}>
        <div><strong>{s.title}</strong><span>{s.artist}</span><small>{s.reason || 'Strong fit using the live set context.'}</small></div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(s.title + ' — ' + s.artist)}>Copy</button>
      </div>)}
      <p className="hint" style={{ marginTop: 8 }}>Source: {intel.planner_source === 'ai' ? 'AI + live Bridge context + music intelligence' : 'curated fallback intelligence + live Bridge context'}.</p>
    </div> : <div className="sidj-section">
      <div className="eyebrow">AI SET ADVISOR</div>
      <p className="hint">{now ? 'Click Analyze room for AI next-song options anchored to the track currently playing.' : 'Connect the Bridge to unlock track-aware AI next-song options.'}</p>
    </div>}

    <p className="hint">SI DJ is your second brain — the DJ makes the final call. It observes the room; it never sends an automatic play command.</p>
  </section>);
}

/* ---------------- Queue ---------------- */
function QueueTab({ goTab }) {
  const [reqs, setReqs] = useState([]); const [loaded, setLoaded] = useState(false); const [qf, setQf] = useState('new'); const [fresh, setFresh] = useState(() => new Set()); const known = useRef(null);
  const load = useCallback(async () => {
    try { const { requests } = await api.requests();
      if (known.current) { const added = requests.filter((r) => !known.current.has(r.id)); if (added.length) { ping(); toast(`New request: ${added[0].song} · ${money(added[0].tip)}`); setFresh((s) => new Set([...s, ...added.map((r) => r.id)])); setTimeout(() => setFresh((s) => { const n = new Set(s); added.forEach((r) => n.delete(r.id)); return n; }), 12000); } }
      known.current = new Set(requests.map((r) => r.id)); setReqs(requests); setLoaded(true);
    } catch { /* keep the last list; the next poll retries */ }
  }, []);
  useEffect(() => { load(); const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 4000); return () => clearInterval(t); }, [load]);
  async function act(r, patch) { setReqs((l) => l.map((x) => (x.id === r.id ? { ...x, ...patch } : x))); try { await api.patchRequest(r.id, patch); } catch (e) { toast(errorText(e)); load(); } }
  async function del(r) { setReqs((l) => l.filter((x) => x.id !== r.id)); try { await api.deleteRequest(r.id); } catch (e) { toast(errorText(e)); load(); } }
  const cutoff = Date.now() - 12 * 3600 * 1000; const recent = reqs.filter((r) => r.created_at > cutoff);
  const confirmed = recent.filter((r) => r.paid).reduce((s, r) => s + r.tip, 0); const pending = recent.filter((r) => !r.paid && r.status !== 'declined').reduce((s, r) => s + r.tip, 0);
  const counts = { new: 0, approved: 0, played: 0, declined: 0 }; reqs.forEach((r) => { counts[r.status] += 1; }); const list = reqs.filter((r) => r.status === qf); if (qf === 'new') list.sort((a, b) => b.tip - a.tip || a.created_at - b.created_at);
  return (<div className="studio-command-layout"><SIDJCommandCenter reqs={reqs} /><div className="stats"><div className="stat"><b>{counts.new}</b><span>Waiting</span></div><div className="stat"><b style={{ color: 'var(--ok)' }}>{money(confirmed)}</b><span>Paid 12h</span></div><div className="stat"><b>{money(pending)}</b><span>To confirm</span></div></div>
    <div className="qf">{FILTERS.map(([k, l]) => <button key={k} aria-pressed={qf === k} onClick={() => setQf(k)}>{l} ({counts[k]})</button>)}</div>
    <div className="queue">{list.length ? list.map((r) => { const m = PAY.find((x) => x.k === r.method); return (<article key={r.id} className={'req' + (fresh.has(r.id) ? ' fresh' : '')} data-id={r.id}>
      <div className="req-top"><div className="req-song"><strong>{r.song}</strong>{r.artist && <span>{r.artist}</span>}</div><div className={'tip' + (r.paid ? ' paid' : '')}>{money(r.tip)}<small>{r.paid ? 'paid' : m ? 'via ' + m.name : 'tip'}</small></div></div>
      {(r.from || r.note) && <p className="req-meta">{r.from && <>from <b>{r.from}</b> </>}{r.note && `“${r.note}”`}</p>}<div className="req-time">{ago(r.created_at)}</div>
      <div className="req-actions">{r.status === 'new' && <><button className="ok" onClick={() => act(r, { status: 'approved' })}>Approve</button><button className="bad" onClick={() => act(r, { status: 'declined' })}>Decline</button></>}{r.status === 'approved' && <><button className="ok" onClick={() => act(r, { status: 'played' })}>Played</button><button className="bad" onClick={() => act(r, { status: 'declined' })}>Decline</button></>}{(r.status === 'played' || r.status === 'declined') && <button onClick={() => act(r, { status: 'new' })}>Move back</button>}<button onClick={() => act(r, { paid: !r.paid })}>{r.paid ? 'Unmark paid' : 'Mark paid'}</button><button className="x" aria-label="Delete request" onClick={() => del(r)}>Delete</button></div>
    </article>); }) : (<div className="empty"><b style={{ color: 'var(--fg)' }}>{!loaded ? 'Loading…' : qf === 'new' ? 'No requests yet' : 'Nothing here'}</b>{loaded && qf === 'new' && <span>Put your QR code where guests can see it. New requests show up here within seconds.</span>}{loaded && qf === 'new' && <button className="btn btn-ghost" style={{ justifySelf: 'center', marginTop: 6 }} onClick={() => goTab('share')}>Get my QR code</button>}</div>)}</div>
    <p className="hint center">Tips go straight to your apps. Mark a request paid once you see the money land.</p></div>);
}

/* ---------------- My page ---------------- */
function PageTab({ dj, edit, saved, goTab }) {
  const link = `${ORIGIN()}/${dj.slug}`;
  return (<><section className="panel"><div className="shead"><h2 style={{ fontSize: 17 }}>Your DJ profile</h2><span className={'saved' + (saved === 'Saved' ? ' ok' : '')}>{saved}</span></div>
    <div className="field"><label htmlFor="p-n">DJ name</label><input className="input" id="p-n" maxLength={60} value={dj.name} onChange={(e) => edit({ name: e.target.value })} /></div><div className="field"><label htmlFor="p-t">Tagline</label><textarea className="input" id="p-t" rows={2} maxLength={200} value={dj.tagline} onChange={(e) => edit({ tagline: e.target.value })} /></div><div className="field"><label htmlFor="p-g">Genres <span className="hint">(comma separated)</span></label><input className="input" id="p-g" maxLength={160} value={dj.genres} onChange={(e) => edit({ genres: e.target.value })} /></div><div className="field"><label htmlFor="p-m">Minimum tip per request ($)</label><input className="input" id="p-m" inputMode="decimal" placeholder="0 = no minimum" value={+dj.min_tip ? dj.min_tip : ''} onChange={(e) => edit({ min_tip: e.target.value.replace(/[^\d.]/g, '') })} /></div><div className="field"><label>Your page link</label><div className="linkbox"><code>{link}</code><button className="btn btn-ghost" onClick={async () => toast((await copyText(link)) ? 'Link copied' : 'Couldn’t copy')}>Copy</button></div></div>
  </section><section className="panel"><h2 style={{ fontSize: 17 }}>Where tips go</h2><p className="hint" style={{ marginTop: -8 }}>Fill in any you use. Blank ones won’t show to guests.</p>{PAY.map((x) => (<div className="pay-row" key={x.k}><span className={'pay-ico ' + x.cls}>{x.ab}</span><div className="field"><label htmlFor={'pay-' + x.k}>{x.name}</label><input className="input" id={'pay-' + x.k} maxLength={80} value={dj.pay[x.k] || ''} placeholder={x.ph} autoComplete="off" autoCapitalize="off" onChange={(e) => edit((d) => ({ pay: { ...d.pay, [x.k]: e.target.value.trim() } }))} /></div></div>))}</section>
  <button className="btn btn-gold btn-block" onClick={() => goTab('design')}>Next: design your page →</button></>);
}

/* ---------------- Design ---------------- */
function Upload({ kind, index, title, sub, url, onChange }) {
  const id = `u-${kind}${index ?? ''}`; const [busy, setBusy] = useState(false);
  async function pick(e) { const file = e.target.files && e.target.files[0]; e.target.value = ''; if (!file) return; setBusy(true); try { const logo = kind === 'logo'; const blob = await shrink(file, logo ? 420 : kind === 'wall' ? 1400 : 900, logo ? 'image/webp' : 'image/jpeg', logo ? 0.9 : 0.75); const { user } = await api.upload(kind, blob, index ?? 0); onChange(user); toast('Image added'); } catch (err) { toast(err && err.code ? errorText(err) : 'Couldn’t use that image. Try a different file'); } finally { setBusy(false); } }
  async function remove() { setBusy(true); try { const { user } = await api.removeMedia(kind, index ?? 0); onChange(user); } catch (err) { toast(errorText(err)); } finally { setBusy(false); } }
  return (<div className="up"><div className="thumb" style={url ? { backgroundImage: `url('${url}')` } : undefined}>{url ? '' : '+'}</div><div><strong>{title}</strong>{sub && <small>{sub}</small>}<div className="up-btns"><label className="btn btn-ghost btn-sm" htmlFor={id} style={{ cursor: 'pointer' }}>{busy ? 'Working…' : url ? 'Replace' : 'Upload'}</label><input type="file" accept="image/*" id={id} hidden disabled={busy} onChange={pick} />{url && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={remove}>Remove</button>}</div></div></div>);
}

function DesignTab({ dj, edit, saved, mergeMedia, goTab }) {
  const d = dj.design || {}; const A = hex(d.a) ? d.a : '#e9bb5f'; const G = hex(d.gl) ? d.gl : '#d8478e';
  const setD = (patch) => edit((x) => ({ design: { ...x.design, ...patch } })); const slots = Math.min(3, dj.photos.length + 1); const p = toProfile(dj);
  return (<><section className="panel"><div className="shead"><h2 style={{ fontSize: 17 }}>Design your page</h2><span className={'saved' + (saved === 'Saved' ? ' ok' : '')}>{saved}</span></div>
    <div className="field"><label>Color theme</label><div className="swatches">{THEMES.map((t) => <button key={t.k} className="sw" aria-pressed={d.a === t.a && d.gl === t.gl} onClick={() => setD({ a: t.a, gl: t.gl })}><i style={{ background: `linear-gradient(90deg,${t.a},${t.gl})` }} />{t.n}</button>)}</div></div>
    <div className="colors"><div className="field"><label htmlFor="d-a">Accent color</label><div className="colorin"><input type="color" id="d-a" value={A} onChange={(e) => setD({ a: e.target.value })} /><span className="hint">Buttons, highlights</span></div></div><div className="field"><label htmlFor="d-gl">Glow color</label><div className="colorin"><input type="color" id="d-gl" value={G} onChange={(e) => setD({ gl: e.target.value })} /><span className="hint">Background light</span></div></div></div>
    <div className="field"><label htmlFor="d-show-name">Show DJ name text</label><label className="switch-row"><input id="d-show-name" type="checkbox" checked={d.showName !== false} onChange={(e) => setD({ showName: e.target.checked })} /><span>Show the DJ name below the logo</span></label><span className="hint">Turn this off if your logo already includes your DJ name.</span></div>
    <div className="field"><label htmlFor="d-ls">Guest page logo size</label><div className="logo-size-control"><input type="range" id="d-ls" min="140" max="420" step="10" value={Math.max(140, Math.min(420, Number(d.ls) || 220))} onChange={(e) => setD({ ls: Number(e.target.value) })} /><output>{Math.max(140, Math.min(420, Number(d.ls) || 220))} px</output></div><span className="hint">Controls the logo size on your live DJ page.</span></div>
    <div className="field"><label htmlFor="d-pls">QR poster logo size</label><div className="logo-size-control"><input type="range" id="d-pls" min="400" max="900" step="20" value={Math.max(400, Math.min(900, Number(d.pls) || 760))} onChange={(e) => setD({ pls: Number(e.target.value) })} /><output>{Math.max(400, Math.min(900, Number(d.pls) || 760))} px</output></div><span className="hint">Make your logo smaller or let it fill more of the poster.</span></div>
    <div className="field"><label>Background</label><div className="opt4">{Object.entries(BGS).map(([k, b]) => <button key={k} className="ob" aria-pressed={(d.bg || 'midnight') === k} onClick={() => setD({ bg: k })}><span className="dot" style={{ background: b.ink }} />{b.n}</button>)}</div></div>
    <div className="field"><label>Font style</label><div className="opt4">{Object.entries(FONTS).map(([k, f]) => <button key={k} className="ob" aria-pressed={(d.f || 'bold') === k} onClick={() => setD({ f: k })}><b style={{ fontFamily: f.v }}>Aa</b>{f.n}</button>)}</div></div>
  </section><section className="panel"><h2 style={{ fontSize: 17 }}>Images</h2><p className="hint" style={{ marginTop: -8 }}>Photos are shrunk to load fast on guests’ phones.</p><Upload kind="logo" title="Logo" sub="Replaces the vinyl. A PNG with a clear background looks best." url={dj.logo} onChange={mergeMedia} /><Upload kind="wall" title="Wallpaper" sub="Full-page background behind everything." url={dj.wall} onChange={mergeMedia} />{Array.from({ length: slots }, (_, i) => <Upload key={i} kind="photo" index={i} title={'Photo ' + (i + 1)} sub={i === 0 ? 'Shows in a row under your name.' : ''} url={dj.photos[i]} onChange={mergeMedia} />)}</section>
  <section className="panel"><h2 style={{ fontSize: 17 }}>Details</h2><label className="switch" htmlFor="d-v">Show spinning vinyl<input type="checkbox" id="d-v" checked={d.v !== 0} onChange={(e) => setD({ v: e.target.checked ? 1 : 0 })} /></label><div className="row2"><div className="field"><label htmlFor="d-lb">Vinyl label (up to 3 letters)</label><input className="input" id="d-lb" maxLength={3} value={d.lb || ''} placeholder={initials(dj.name)} onChange={(e) => setD({ lb: e.target.value })} /></div><div className="field"><label htmlFor="d-ig">Instagram</label><input className="input" id="d-ig" maxLength={40} value={d.ig || ''} placeholder="@username" autoCapitalize="off" onChange={(e) => setD({ ig: e.target.value.replace(/[^A-Za-z0-9._@]/g, '') })} /></div><div className="field"><label htmlFor="d-tt">TikTok</label><input className="input" id="d-tt" maxLength={40} value={d.tt || ''} placeholder="@username" autoCapitalize="off" onChange={(e) => setD({ tt: e.target.value.replace(/[^A-Za-z0-9._@]/g, '') })} /></div><div className="field"><label htmlFor="d-fb">Facebook</label><input className="input" id="d-fb" maxLength={200} value={d.fb || ''} placeholder="username or full URL" autoCapitalize="off" onChange={(e) => setD({ fb: e.target.value.trim() })} /></div></div><div className="field"><label htmlFor="d-live">Status line</label><input className="input" id="d-live" maxLength={40} value={d.live || ''} placeholder="Taking requests now" onChange={(e) => setD({ live: e.target.value })} /></div><div className="field"><label htmlFor="d-tips">Quick tip amounts (up to 4, comma separated)</label><input className="input" id="d-tips" maxLength={30} value={d.tips || ''} placeholder="5,10,20,50" onChange={(e) => setD({ tips: e.target.value.replace(/[^\d.,\s]/g, '') })} /></div></section>
  <div className="shead"><span className="eyebrow">Live preview</span><a className="mini" href={`/${dj.slug}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>Open real page ↗</a></div><GuestView key={tipList(p).join()} p={p} preview paused={!dj.is_live} /><button className="btn btn-gold btn-block" onClick={() => goTab('share')}>Get my QR code →</button></>);
}

/* ---------------- QR + poster ---------------- */
function saveBlob(blob, name) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }

function ShareTab({ dj }) {
  const canvasRef = useRef(null); const link = `${ORIGIN()}/${dj.slug}`; const methods = PAY.filter((x) => clean(dj.pay[x.k])).map((x) => x.name).join(' · ');
  useEffect(() => { if (canvasRef.current) QRCode.toCanvas(canvasRef.current, link, { width: 512, margin: 0, errorCorrectionLevel: 'H', color: { dark: '#140e1a', light: '#ffffff' } }).catch(() => {}); }, [link]);
  async function downloadQrSvg() {
    try {
      const svg = await QRCode.toString(link, { type: 'svg', margin: 0, errorCorrectionLevel: 'H', width: 1200, color: { dark: '#140e1a', light: '#ffffff' } });
      saveBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${dj.slug}-qr.svg`);
      toast('QR SVG downloaded');
    } catch { toast('Couldn’t create the SVG QR'); }
  }
  async function poster() {
    const qr = canvasRef.current; if (!qr) { toast('QR isn’t ready yet'); return; } const p = toProfile(dj);
    const a = hex(p.a) ? p.a : '#e9bb5f'; const gl = hex(p.gl) ? p.gl : '#d8478e'; const bg = BGS[p.bg] || BGS.midnight; const dispFont = (FONTS[p.f] || FONTS.bold).v;
    try { await document.fonts.load(`800 80px ${dispFont.split(',')[0]}`); await document.fonts.load('500 28px "JetBrains Mono"'); await document.fonts.load('700 30px Manrope'); } catch { /* fonts optional */ }
    const W = 1080; const H = 1500; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = bg.ink; x.fillRect(0, 0, W, H);
    let g = x.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, 900); g.addColorStop(0, gl + '88'); g.addColorStop(1, gl + '00'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    g = x.createRadialGradient(0, H * 0.2, 0, 0, 0, 700); g.addColorStop(0, a + '33'); g.addColorStop(1, a + '00'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.textAlign = 'center'; x.fillStyle = a; if ('letterSpacing' in x) x.letterSpacing = '8px'; x.font = '600 36px "JetBrains Mono", monospace'; x.fillText('SCAN TO REQUEST A SONG', W / 2, 100); if ('letterSpacing' in x) x.letterSpacing = '0px';
    let logoHeight = 0;
    if (dj.logo) {
      try {
        const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = dj.logo + (dj.logo.includes('?') ? '&' : '?') + 'poster=' + Date.now(); });
        const defaultPosterLogo = 760; const posterLogo = Math.max(400, Math.min(900, Number(p.pls) || defaultPosterLogo)); const maxW = posterLogo; const maxH = 360;
        const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight); const lw = Math.max(1, Math.round(img.naturalWidth * scale)); const lh = Math.max(1, Math.round(img.naturalHeight * scale)); const ly = 145;
        x.drawImage(img, (W - lw) / 2, ly, lw, lh); logoHeight = lh;
      } catch { /* poster still works if the logo cannot be loaded */ }
    }
    const showName = dj.showName !== undefined ? dj.showName !== false : !dj.logo; let size = 112; const name = (dj.name || '').toUpperCase();
    const nameY = showName ? Math.max(390, 175 + logoHeight + 85) : Math.max(330, 175 + logoHeight + 45);
    if (showName) { do { x.font = `800 ${size}px ${dispFont}`; size -= 4; } while (x.measureText(name).width > W - 140 && size > 40); x.fillStyle = '#f4eff8'; x.fillText(name, W / 2, nameY); }
    const q = 620; const qx = (W - q) / 2; const qy = showName ? nameY + 105 : nameY + 55;
    x.fillStyle = '#fbf7ef'; x.beginPath(); x.roundRect(qx - 38, qy - 38, q + 76, q + 76, 46); x.fill(); x.imageSmoothingEnabled = false; x.drawImage(qr, qx, qy, q, q);
    x.fillStyle = '#f4eff8'; x.font = '600 36px "Manrope", system-ui, sans-serif'; x.fillText('Pick a song. Send a tip. I’ll play it.', W / 2, qy + q + 105);
    x.fillStyle = a; x.font = '700 30px "Manrope", system-ui, sans-serif'; x.fillText(PAY.filter((m) => clean(dj.pay[m.k])).map((m) => m.name).join('   ·   '), W / 2, qy + q + 165);
    x.fillStyle = '#a197ae'; x.font = '500 24px "JetBrains Mono", monospace'; x.fillText(link.replace(/^https?:\/\//, ''), W / 2, H - 70);
    c.toBlob((b) => b && saveBlob(b, `${dj.slug}-request-poster.png`), 'image/png');
  }
  return (<><div className="ticket"><span className="t-sub">Scan to request a song</span><h2>{dj.name}</h2><div id="qr" aria-label="QR code to your request page"><canvas ref={canvasRef} width="512" height="512" /></div><div className="perf" /><span className="pays">{methods || 'Add a payment app on My page'}</span></div>
    <section className="panel"><div className="field"><label>Your request link</label><div className="linkbox"><code>{link}</code><button className="btn btn-ghost" onClick={async () => toast((await copyText(link)) ? 'Link copied' : 'Couldn’t copy')}>Copy</button></div></div>
      <div className="poster-actions"><button className="btn btn-gold btn-block" onClick={poster}>Download poster (PNG)</button><button className="btn btn-ghost btn-block" onClick={() => canvasRef.current && canvasRef.current.toBlob((b) => b && saveBlob(b, `${dj.slug}-qr.png`), 'image/png')}>Download QR only (PNG)</button><button className="btn btn-ghost btn-block" onClick={downloadQrSvg}>Download QR only (SVG)</button><a className="btn btn-ghost btn-block" href={`/${dj.slug}`} target="_blank" rel="noopener noreferrer">Open my guest page ↗</a></div>
      <div className="panel" style={{ marginTop: 16, background: 'rgba(255,255,255,.035)' }}><h3 style={{ fontSize: 16, marginBottom: 6 }}>Make your own custom poster</h3><p className="hint">Download the QR above and drop it into Canva, Photoshop, Adobe Express, or an AI design tool. For the best print quality, use the SVG.</p><div className="field"><label>AI design prompt</label><textarea className="input" rows={5} readOnly value={`Create a premium professional DJ poster using this QR code. Keep the QR code completely unchanged and fully scannable. Use my DJ logo, brand colors, and a modern nightlife aesthetic. Include the text "SCAN TO REQUEST A SONG" and "${link.replace(/^https?:\/\//, '')}". Do not crop, distort, recolor, blur, stylize, or place graphics over the QR code. Leave clear white space around the QR code.`} /><button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={async () => toast((await copyText(`Create a premium professional DJ poster using this QR code. Keep the QR code completely unchanged and fully scannable. Use my DJ logo, brand colors, and a modern nightlife aesthetic. Include the text "SCAN TO REQUEST A SONG" and "${link.replace(/^https?:\/\//, '')}". Do not crop, distort, recolor, blur, stylize, or place graphics over the QR code. Leave clear white space around the QR code.`)) ? 'Prompt copied' : 'Couldn’t copy')}>Copy AI prompt</button></div></div>
      <p className="hint">The poster is sized for a table tent or 8×10 print. Your QR always points to your personal DJ Request Live page.</p></section></>);
}
