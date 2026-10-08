import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { songRows } from '../lib/songLibrary.js';

const QUICK = [
  { title: 'PARTY', items: ['Party Hits','Sing-Alongs','Dance Floor','Group Dances','Current Hits'] },
  { title: 'GENRES', items: ['Rock','Country','Hip-Hop','R&B','Latin','Disco / Funk','Pop','EDM','80s','90s','2000s'] },
  { title: 'WEDDING', items: ['First Dance','Father–Daughter','Mother–Son','Grand Entrance','Cake Cutting','Bouquet Toss','Last Dance','Anniversary Dance'] },
  { title: 'EVENTS', items: ['Birthday','Wedding','Corporate','School','Quinceañera','Bar / Club','Festival','Holiday'] },
];


const BROWSE_GENRES = ['All','Country','Texas Country','Red Dirt','Pop','Hip-Hop','R&B','Latin','Norteño','Cumbia','Salsa','Bachata','Tejano','Conjunto','Regional Mexican','Dance','EDM','Disco','Funk','Rock','80s','90s','2000s'];

function BrowseLibrary() {
  const [genre, setGenre] = useState('All');
  const filtered = songRows().filter((s) => {
    if (genre === 'All') return true;
    const hay = [s.genre, s.tags, s.era].join(' ').toLowerCase();
    return hay.includes(genre.toLowerCase());
  });
  return (
    <section className="panel">
      <div className="planner-box-head">
        <div><span className="eyebrow">DJ LIBRARY · BROWSE MODE</span><h2>Find a Song</h2><p className="hint">No event planning. No wedding formalities. Pick a genre and browse the library.</p></div>
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:18}}>
        {BROWSE_GENRES.map((g) => <button key={g} className={genre === g ? 'btn btn-gold btn-sm' : 'btn btn-ghost btn-sm'} onClick={() => setGenre(g)}>{g}</button>)}
      </div>
      <div style={{display:'grid',gap:8,maxHeight:560,overflowY:'auto',paddingRight:4}}>
        {filtered.map((s) => <div key={s.title+'|'+s.artist} style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,alignItems:'center',padding:'12px 14px',border:'1px solid rgba(255,255,255,.08)',borderRadius:12}}>
          <div><b>{s.title}</b><span style={{display:'block'}}>{s.artist}</span><small>{s.genre} · {s.era}{s.bpm ? ' · '+s.bpm+' BPM' : ''}</small></div>
          <small>{String(s.tags||'').split(',').slice(0,3).join(' · ')}</small>
        </div>)}
      </div>
      {!filtered.length && <p className="hint">No library records match that genre yet.</p>}
    </section>
  );
}

const EXAMPLES = [
  '150-person wedding in Houston, mostly 30–50. Bride loves country and 2000s pop. Groom likes classic rock and hip-hop. Keep it fun, not too clubby.',
  '4-hour 40th birthday party. Mixed crowd, heavy 90s and 2000s, R&B, hip-hop and dance. I need a huge final hour.',
  'Texas wedding with guests from 20 to 70. Country, 80s, 90s, sing-alongs and some Latin. Help me build the night.',
];

export default function Planner() {
  const [event, setEvent] = useState('');
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [buildProgress, setBuildProgress] = useState(0);
  const [mode, setMode] = useState('planner');

  useEffect(() => {
    if (!busy) { setBuildProgress(0); return; }
    let progress = 4;
    setBuildProgress(progress);
    const timer = window.setInterval(() => {
      progress += Math.max(0.35, (92 - progress) * 0.045);
      setBuildProgress(Math.min(92, Math.round(progress)));
    }, 140);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function run(value = event) {
    const text = String(value || '').trim();
    if (!text || busy) return;
    setEvent(text); setBusy(true); setError(''); setPlan(null);
    try {
      const { plan: result } = await api.aiEventPlan(text);
      setBuildProgress(100);
      setPlan(result);
    } catch (e) {
      setError(e.code === 'ai_not_configured'
        ? 'AI is not connected yet. Add OPENAI_API_KEY in Hostinger environment variables.'
        : e.code === 'rate_limited' ? 'Too many planner requests. Try again in a few minutes.'
        : e.code === 'ai_api_error' ? 'OpenAI API error. Check the Hostinger API key, billing, model access, and deployment logs.'
        : e.code === 'server_error' ? 'Server error (500). The AI request is reaching the server but the server is failing before returning a planner result.'
        : e.code ? `Planner error: ${e.code} (HTTP ${e.status || 'unknown'}).`
        : 'The planner could not build that plan. Try a little more event detail.');
    } finally { setBusy(false); }
  }

  return (
    <div className="planner">
      <section className="planner-hero">
        <span className="eyebrow">DJ REQUEST LIVE · MUSIC INTELLIGENCE</span>
        <h1>Plan the night.<br /><span>Play with confidence.</span></h1>
        <p>Tell DJ Request Live what kind of event you’re working. The planner turns it into a DJ-ready music strategy, timeline, crowd profile and special moments.</p>
      </section>

      <div style={{display:'flex',justifyContent:'center',gap:8,marginBottom:18}}>
        <button className={mode === 'planner' ? 'btn btn-gold btn-sm' : 'btn btn-ghost btn-sm'} onClick={() => setMode('planner')}>AI Event Planner</button>
        <button className={mode === 'browse' ? 'btn btn-gold btn-sm' : 'btn btn-ghost btn-sm'} onClick={() => setMode('browse')}>Browse Music Library</button>
      </div>
      {mode === 'browse' ? <BrowseLibrary /> : <>
      <section className="planner-box panel">
        <div className="planner-box-head">
          <div><h2>AI Event Music Planner</h2><p className="hint">Describe the event like you’d describe it to another DJ.</p></div>
          <span className="ai-pill">AI</span>
        </div>
        <textarea
          className="input planner-input"
          value={event}
          onChange={e => setEvent(e.target.value)}
          placeholder="Example: 150-person wedding in Houston, ages 25–65. Bride loves country and 2000s pop. Groom likes rock and hip-hop. Need a packed dance floor without getting too clubby."
          maxLength={2500}
        />
        <div className="planner-actions">
          <button className={`btn btn-gold planner-build-btn${busy ? ' is-building' : ''}`} disabled={!event.trim() || busy} onClick={() => run()}>
            {busy && <span className="planner-build-fill" style={{ width: buildProgress + '%' }} aria-hidden="true" />}
            <span className="planner-build-label">
              {busy ? `Building your plan… ${buildProgress}%` : 'Build My Event Plan →'}
            </span>
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => { setEvent(''); setPlan(null); setError(''); }}>Clear</button>
        </div>
        {error && <div className="msg err">{error}</div>}
        <div className="examples"><span>Try:</span>{EXAMPLES.map(x => <button key={x} onClick={() => { setEvent(x); run(x); }}>{x}</button>)}</div>
      </section>

      <section className="quick panel">
        <div className="planner-box-head"><div><h2>Quick Reference</h2><p className="hint">Start with a category instead of typing.</p></div></div>
        {QUICK.map(group => (
          <div className="quick-group" key={group.title}>
            <b>{group.title}</b>
            <div className="quick-grid">{group.items.map(item => <button key={item} onClick={() => { setEvent(item); run(item); }}>{item}</button>)}</div>
          </div>
        ))}
      </section>

      {plan && <PlanResult plan={plan} onRefine={run} busy={busy} />}
      </>}
    </div>
  );
}

function PlanResult({ plan, onRefine, busy }) {
  const [refine, setRefine] = useState('');
  return (
    <section className="planner-result">
      <div className="result-head">
        <div><span className="eyebrow">EVENT PLAN</span><h2>{plan.title}</h2><p>{plan.summary}</p></div>
        <span className="result-badge">DJ READY</span>
      </div>
      <div className="result-grid">
        <ResultCard title="Crowd profile"><p>{plan.crowd_profile}</p></ResultCard>
        <ResultCard title="Music mix">
          <div className="mix">{(plan.music_mix || []).map(x => <div key={x.label}><span>{x.label}</span><b>{x.percent}%</b><i><em style={{ width: x.percent + '%' }} /></i></div>)}</div>
        </ResultCard>
        <ResultCard title="Night strategy">
          <ol className="timeline">{(plan.timeline || []).map(x => <li key={x.phase}><b>{x.phase}</b><span>{x.direction}</span></li>)}</ol>
        </ResultCard>
        <ResultCard title="Special moments">
          <ul className="specials">{(plan.special_moments || []).map(x => <li key={x.moment}><b>{x.moment}</b><span>{x.music_direction}</span></li>)}</ul>
        </ResultCard>
      </div>
      {Array.isArray(plan.recommendations) && plan.recommendations.length > 0 && (
        <section className="song-recommendations panel">
          <div className="planner-box-head">
            <div><span className="eyebrow">CURATED HIT LIBRARY</span><h2>What I'd Load for This Crowd</h2><p className="hint">Recommendations are selected from the DJ Request Live hit library.</p></div>
            <span className="result-badge">LIBRARY PICKS</span>
          </div>
          <div className="song-phase-grid">
            {plan.recommendations.map((group) => (
              <article className="song-phase" key={group.phase}>
                <div className="song-phase-head"><h3>{group.phase}</h3><span>{(group.songs || []).length} picks</span></div>
                <p className="song-phase-reason">{group.reason}</p>
                <div className="song-list">
                  {(group.songs || []).map((song) => (
                    <div className="song-row" key={song.title + song.artist}>
                      <div><b>{song.title}</b><span>{song.artist}</span></div>
                      <small>{song.reason}</small>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <SpotifyPlaylistCard plan={plan} />

      <section className="playlist-export panel">
        <div className="planner-box-head">
          <div>
            <span className="eyebrow">DJ PLAYLIST EXPORT</span>
            <h2>Take This Set With You</h2>
            <p className="hint">Export the master playlist for the DJ software and workflow you use.</p>
          </div>
          <span className="result-badge">{flattenSongs(plan).length} TRACKS</span>
        </div>
        <div className="export-grid">
          <button className="export-card export-primary" onClick={() => exportPlaylist(plan, 'm3u')}>
            <strong>⬇ M3U Playlist</strong><span>Universal playlist format</span>
          </button>
          <button className="export-card" onClick={() => exportPlaylist(plan, 'rekordbox')}>
            <strong>Rekordbox XML</strong><span>Playlist metadata export</span>
          </button>
          <button className="export-card" onClick={() => exportPlaylist(plan, 'csv')}>
            <strong>CSV</strong><span>Library + phase + reasons</span>
          </button>
          <button className="export-card" onClick={() => exportPlaylist(plan, 'txt')}>
            <strong>TXT</strong><span>Simple DJ-ready song list</span>
          </button>
          <button className="export-card" onClick={() => exportPlaylist(plan, 'json')}>
            <strong>JSON</strong><span>Full playlist data</span>
          </button>
          <button className="export-card export-package" onClick={() => exportPlaylist(plan, 'package')}>
            <strong>⬇ DJ Playlist Package</strong><span>M3U + CSV + TXT + JSON data</span>
          </button>
        </div>
        <p className="export-note">VirtualDJ, Serato, Traktor and Engine DJ workflows can use interoperable playlist formats such as M3U. Native database/crate formats can be added later without locking DJs into one platform.</p>
      </section>
      <div className="refine panel">
        <b>Refine the plan</b>
        <div className="refine-row"><input className="input" value={refine} onChange={e => setRefine(e.target.value)} placeholder="Make it 20% more country. Less hip-hop. They're mostly in their 40s." /><button className="btn btn-gold" disabled={!refine.trim() || busy} onClick={() => { onRefine(refine); setRefine(''); }}>Refine →</button></div>
      </div>
      <p className="planner-note">Recommendations are grounded in the curated DJRequestLive hit library. AI selects from our records; it does not invent the songs.</p>
    </section>
  );
}


function slugify(value) {
  return String(value || 'djrequestlive-playlist').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'djrequestlive-playlist';
}

function flattenSongs(plan) {
  const seen = new Set();
  const songs = [];
  for (const group of Array.isArray(plan?.recommendations) ? plan.recommendations : []) {
    for (const song of Array.isArray(group?.songs) ? group.songs : []) {
      const key = String(song.title || '') + '\u0000' + String(song.artist || '');
      if (song?.title && song?.artist && !seen.has(key)) {
        seen.add(key);
        songs.push({ ...song, phase: group.phase || 'Master Playlist' });
      }
    }
  }
  return songs;
}

function downloadText(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportPlaylist(plan, format) {
  const songs = flattenSongs(plan);
  if (!songs.length) return;
  const base = slugify(plan.title || 'djrequestlive-master-playlist');

  if (format === 'm3u') {
    const lines = ['#EXTM3U', '#DJREQUESTLIVE MASTER PLAYLIST', '#TITLE:' + (plan.title || 'DJ Request Live Master Playlist')];
    songs.forEach((s) => {
      lines.push('#EXTINF:-1,' + s.title + ' - ' + s.artist);
      lines.push(s.title + ' - ' + s.artist);
    });
    downloadText(base + '.m3u', lines.join('\n') + '\n', 'audio/x-mpegurl;charset=utf-8');
    return;
  }

  if (format === 'txt') {
    const lines = songs.map((s, i) => String(i + 1).padStart(2, '0') + '. ' + s.title + ' — ' + s.artist + '  [' + s.phase + ']');
    downloadText(base + '.txt', ['DJ REQUEST LIVE', plan.title || 'Master Playlist', '', ...lines].join('\n'));
    return;
  }

  if (format === 'csv') {
    const esc = (v) => '"' + String(v ?? '').replaceAll('"', '""') + '"';
    const rows = [['Order','Title','Artist','Phase','Reason'], ...songs.map((s, i) => [i + 1, s.title, s.artist, s.phase, s.reason || ''])];
    downloadText(base + '.csv', rows.map(row => row.map(esc).join(',')).join('\n') + '\n', 'text/csv;charset=utf-8');
    return;
  }

  if (format === 'json') {
    downloadText(base + '.json', JSON.stringify({ source: 'DJ Request Live', title: plan.title || 'Master Playlist', exportedAt: new Date().toISOString(), songs }, null, 2), 'application/json;charset=utf-8');
    return;
  }

  if (format === 'rekordbox') {
    const escXml = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const tracks = songs.map((s, i) => '<TRACK TrackID="' + (i + 1) + '" Name="' + escXml(s.title) + '" Artist="' + escXml(s.artist) + '" Kind="DJ Request Live playlist item" />').join('');
    const playlistTracks = songs.map((s, i) => '<TRACK Key="' + (i + 1) + '" />').join('');
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS Version="1.0.0"><PRODUCT Name="DJ Request Live" Version="1.0"/><COLLECTION Entries="' + songs.length + '">' + tracks + '</COLLECTION><PLAYLISTS><NODE Type="0" Name="ROOT" Count="1"><NODE Name="' + escXml(plan.title || 'DJ Request Live Master Playlist') + '" Type="1" KeyType="0" Entries="' + songs.length + '">' + playlistTracks + '</NODE></NODE></PLAYLISTS></DJ_PLAYLISTS>';
    downloadText(base + '-rekordbox.xml', xml, 'application/xml;charset=utf-8');
    return;
  }

  if (format === 'package') {
    const esc = (v) => '"' + String(v ?? '').replaceAll('"', '""') + '"';
    const csv = [['Order','Title','Artist','Phase','Reason'], ...songs.map((s, i) => [i + 1, s.title, s.artist, s.phase, s.reason || ''])].map(row => row.map(esc).join(',')).join('\n') + '\n';
    const m3u = ['#EXTM3U', '#DJREQUESTLIVE MASTER PLAYLIST', ...songs.flatMap(s => ['#EXTINF:-1,' + s.title + ' - ' + s.artist, s.title + ' - ' + s.artist])].join('\n') + '\n';
    const txt = songs.map((s, i) => (i + 1) + '. ' + s.title + ' — ' + s.artist + ' [' + s.phase + ']').join('\n');
    downloadText(base + '-playlist-package.json', JSON.stringify({ source: 'DJ Request Live', title: plan.title || 'Master Playlist', formats: ['m3u','csv','txt','json'], m3u, csv, txt, songs }, null, 2), 'application/json;charset=utf-8');
  }
}

function SpotifyPlaylistCard({ plan }) {
  const [status, setStatus] = useState(null);
  const [name, setName] = useState(() => String(plan?.title || 'DJ Request Live Master Playlist').slice(0, 100));
  const [visibility, setVisibility] = useState('private');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState('');
  const [mode, setMode] = useState('new');

  useEffect(() => {
    setName(String(plan?.title || 'DJ Request Live Master Playlist').slice(0, 100));
    setResult(null); setError('');
    api.spotifyStatus().then((s) => { setStatus(s); if (s.connected) api.spotifyPlaylists().then((x) => setPlaylists(x.playlists || [])).catch(() => {}); }).catch((e) => setStatus({ connected: false, error: e.code }));
  }, [plan?.title]);

  const songs = flattenSongs(plan);
  async function create() {
    if (!songs.length || busy) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const data = mode === 'existing'
        ? await api.spotifyAddToPlaylist({ playlist_id: selectedPlaylist, songs: songs.map(({ title, artist }) => ({ title, artist })) })
        : await api.spotifyCreatePlaylist({
            name: name.trim() || 'DJ Request Live Master Playlist',
            description: 'AI-planned DJ set created with DJ Request Live',
            visibility,
            songs: songs.map(({ title, artist }) => ({ title, artist })),
          });
      setResult(data.playlist);
    } catch (e) {
      setError(e.code === 'spotify_not_configured'
        ? 'Spotify is not configured on the DJ Request Live server yet.'
        : e.code === 'spotify_api_error' ? 'Spotify could not complete that playlist request. Try again.'
        : e.code === 'spotify_reconnect_required' ? 'Reconnect Spotify and try again.'
        : 'Could not create the Spotify playlist.');
    } finally { setBusy(false); }
  }

  return (
    <section className="panel spotify-builder">
      <div className="planner-box-head">
        <div>
          <span className="eyebrow">STREAMING PLAYLIST</span>
          <h2>Send This Set to Spotify</h2>
          <p className="hint">No filename headaches. DJ Request Live matches the song title and artist to Spotify, then creates the playlist in your account.</p>
        </div>
        <span className="result-badge">SPOTIFY</span>
      </div>
      {status?.connected ? (
        <>
          <div className="spotify-connected"><span className="spotify-dot" /><b>Spotify connected{status.display_name ? ' · ' + status.display_name : ''}</b></div>
          <div className="spotify-mode">
            <button className="btn btn-ghost btn-sm" aria-pressed={mode === 'new'} onClick={() => setMode('new')}>Create New</button>
            <button className="btn btn-ghost btn-sm" aria-pressed={mode === 'existing'} onClick={() => setMode('existing')}>Add to Existing</button>
          </div>
          {mode === 'new' ? (
            <div className="spotify-form">
              <div className="field"><label htmlFor="spotify-name">Playlist name</label><input id="spotify-name" className="input" maxLength={100} value={name} onChange={e => setName(e.target.value)} /></div>
              <div className="field"><label htmlFor="spotify-visibility">Playlist type</label><select id="spotify-visibility" className="input" value={visibility} onChange={e => setVisibility(e.target.value)}><option value="private">Private — just me</option><option value="public">Public — share it</option><option value="collaborative">Collaborative — let others add songs</option></select></div>
            </div>
          ) : (
            <div className="field"><label htmlFor="spotify-existing">Your Spotify playlists</label><select id="spotify-existing" className="input" value={selectedPlaylist} onChange={e => setSelectedPlaylist(e.target.value)}><option value="">Choose a playlist…</option>{playlists.map(p => <option key={p.id} value={p.id}>{p.name} · {p.tracks} tracks{p.collaborative ? ' · collaborative' : ''}</option>)}</select></div>
          )}
          <button className="btn btn-gold" disabled={busy || !songs.length || (mode === 'existing' && !selectedPlaylist)} onClick={create}>{busy ? (mode === 'existing' ? 'Adding to Spotify playlist…' : 'Creating Spotify playlist…') : (mode === 'existing' ? '🎵 Add This Set to Spotify →' : '🎵 Create Spotify Playlist →')}</button>
          {result && <div className="msg ok" style={{ marginTop: 12 }}><b>{result.added} songs added.</b>{result.missing?.length ? ' ' + result.missing.length + ' song' + (result.missing.length === 1 ? '' : 's') + ' could not be matched.' : ' Every song matched.'}{result.url && <> <a href={result.url} target="_blank" rel="noreferrer">Open in Spotify →</a></>}</div>}
          {error && <div className="msg err" style={{ marginTop: 12 }}>{error}</div>}
        </>
      ) : (
        <>
          <p className="hint" style={{ marginBottom: 14 }}>Connect your Spotify account to create playlists directly from your AI-generated set. You can keep them private, publish them, or make them collaborative.</p>
          <button className="btn btn-gold" onClick={() => { window.location.href = api.spotifyConnectUrl; }}>🎵 Connect Spotify →</button>
          {status?.error === 'spotify_not_configured' && <p className="hint" style={{ marginTop: 10 }}>Admin setup required: Spotify Client ID and Client Secret.</p>}
        </>
      )}
    </section>
  );
}

function ResultCard({ title, children }) {
  return <article className="result-card"><h3>{title}</h3>{children}</article>;
}
