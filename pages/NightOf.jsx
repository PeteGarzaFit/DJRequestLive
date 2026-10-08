import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mark } from '../components/Logo.jsx';
import { api, errorText } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const WEDDING_MOMENTS = [
  ['CEREMONY','Pre-Ceremony','Processional','Bride Entrance','Unity / Special Ceremony Song','Recessional'],
  ['COCKTAIL HOUR','Cocktail'],
  ['DINNER','Dinner / Background'],
  ['FORMALITIES','Grand Entrance','Bridal Party Entrance','First Dance','Father–Daughter Dance','Mother–Son Dance','Anniversary Dance'],
  ['RECEPTION','Open Dance Floor','Cake Cutting','Bouquet Toss','Garter / Alternative'],
  ['TOASTS & SPECIALS','Toasts / Speeches','Last Dance','Must Play','Do Not Play'],
];

function loadPlan() {
  try { return JSON.parse(localStorage.getItem('djrl_event_curator') || '{}'); } catch { return {}; }
}
function songKey(s) { return String(s?.title || '') + '|' + String(s?.artist || ''); }
function timeToMinutes(value) {
  if (!value) return null;
  const [h,m] = String(value).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}
function todayString() {
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
}
function formatTime(value) {
  if (!value) return '';
  const [h,m] = value.split(':').map(Number);
  const d = new Date();
  d.setHours(h,m,0,0);
  return d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
}

async function eventMemoryKey(plan) {
  const input = [
    plan?.eventType || '',
    plan?.name || '',
    plan?.details?.venue || '',
    plan?.details?.eventDate || ''
  ].join('|').trim();
  try {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2,'0')).join('');
  } catch {
    let h = 2166136261;
    for (const ch of input) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return String(h >>> 0).padStart(64,'0');
  }
}

export default function NightOf() {
  const [plan] = useState(loadPlan);
  const [done, setDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem('djrl_event_night_done') || '{}'); } catch { return {}; }
  });
  const [nowPlaying, setNowPlaying] = useState(null);
  const [bridge, setBridge] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [memory, setMemory] = useState(null);
  const [memoryBusy, setMemoryBusy] = useState(false);

  const moments = useMemo(() => plan.eventType === 'Wedding'
    ? WEDDING_MOMENTS.flatMap(([group, ...items]) => items.map(item => ({ group, item })))
    : ['Arrival / Cocktail','Dinner / Background','Main Event','Must Play','Do Not Play','Last Songs'].map(item => ({ group:'EVENT MUSIC', item })), [plan.eventType]);

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch('http://127.0.0.1:8765/now-playing', { cache:'no-store' });
        if (!r.ok) throw new Error();
        const d = await r.json();
        setBridge(!!d.connected);
        setNowPlaying(d.nowPlaying || null);
      } catch { setBridge(false); setNowPlaying(null); }
    };
    poll();
    const id = setInterval(poll, 2500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!plan.details?.eventDate || !plan.eventType || !plan.name) return;
      try {
        const eventKey = await eventMemoryKey(plan);
        const result = await api.siDjEventMemories({ event_key: eventKey, limit: 1 });
        if (alive && result?.memories?.[0]) {
          const m = result.memories[0];
          setMemory({
            ...m,
            totals: {
              planned_tracks: Number(m.planned_track_count || 0),
              played_tracks: Number(m.played_track_count || 0),
              unique_played: Number(m.unique_played_count || 0),
              planned_played: Number(m.planned_played_count || 0),
              repeat_request_count: Number(m.repeat_request_count || 0)
            }
          });
        }
      } catch { /* Event memory is optional while offline. */ }
    })();
    return () => { alive = false; };
  }, [plan]);

  function toggle(key) {
    setDone(x => {
      const next = { ...x, [key]: !x[key] };
      localStorage.setItem('djrl_event_night_done', JSON.stringify(next));
      return next;
    });
  }
  function resetNight() {
    setDone({});
    localStorage.removeItem('djrl_event_night_done');
    setMemory(null);
  }

  async function saveEventMemory() {
    if (!plan.details?.eventDate) {
      toast('Set the event date in the Planner before saving event memory.');
      return;
    }
    if (!plan.eventType || !plan.name) {
      toast('Save the event plan before saving event memory.');
      return;
    }
    setMemoryBusy(true);
    try {
      const eventKey = await eventMemoryKey(plan);
      const result = await api.siDjEventMemory({
        event_key: eventKey,
        event_type: plan.eventType,
        event_name: plan.name,
        venue: plan.details?.venue || '',
        event_date: plan.details.eventDate,
        closed_at: Date.now(),
        selections: plan.selections || {},
        done
      });
      setMemory(result.memory || null);
      toast('Event memory saved to SI DJ.');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setMemoryBusy(false);
    }
  }

  const totalItems = moments.reduce((n, m) => n + ((plan.selections || {})[m.item] || []).length, 0);
  const completed = Object.values(done).filter(Boolean).length;
  const progress = totalItems ? Math.min(100, Math.round(completed / totalItems * 100)) : 0;

  const times = plan.timelineTimes || {};
  const eventDate = plan.details?.eventDate || '';
  const isEventToday = !eventDate || eventDate === todayString();
  const currentMinutes = clock.getHours() * 60 + clock.getMinutes();

  const timedMoments = moments
    .map((m, index) => ({ ...m, index, minutes: timeToMinutes(times[m.item]) }))
    .filter(m => m.minutes !== null)
    .sort((a,b) => a.minutes - b.minutes);

  const currentTimed = isEventToday
    ? [...timedMoments].reverse().find(m => m.minutes <= currentMinutes) || null
    : null;

  const nextTimed = isEventToday
    ? timedMoments.find(m => m.minutes > currentMinutes) || null
    : null;

  const nextPlayable = moments.find(m => (plan.selections?.[m.item] || []).some(s => !done[m.item + '|' + songKey(s)])) || null;
  const currentText = nowPlaying ? songKey(nowPlaying).toLowerCase() : '';

  const timelineStatus = (m) => {
    const songs = plan.selections?.[m.item] || [];
    const sectionDone = songs.length > 0 && songs.every(s => done[m.item + '|' + songKey(s)]);
    const t = timeToMinutes(times[m.item]);
    if (sectionDone) return 'complete';
    if (t !== null && isEventToday && currentMinutes >= t) return 'current';
    return 'upcoming';
  };

  const nextMoment = nextTimed || nextPlayable;
  const liveMoment = currentTimed || null;

  return <div className="rl rl-app">
    <div className="wrap wide">
      <div className="shead" style={{marginBottom:14}}>
        <Link to="/studio" className="brand" style={{textDecoration:'none',color:'inherit'}}><Mark size={28} badge/>DJ Request Live</Link>
        <div className="shead-r"><Link className="mini" to="/curate">Planner</Link><Link className="mini" to="/intelligence">SI DJ</Link><button className="btn btn-ghost btn-sm" onClick={resetNight}>Reset Night</button></div>
      </div>

      <section className="panel" style={{marginBottom:16}}>
        <div className="eyebrow">DJ EVENT MODE · NIGHT OF</div>
        <div className="shead" style={{alignItems:'end',gap:16}}>
          <div>
            <h1 style={{fontSize:34,margin:'6px 0'}}>{plan.name || 'Tonight’s Event'}</h1>
            <p className="hint" style={{margin:0}}>{plan.details?.venue || 'Event venue'}{plan.details?.eventDate ? ' · ' + plan.details.eventDate : ''}</p>
          </div>
          <div style={{textAlign:'right'}}><div className="ai-pill">{completed} / {totalItems} COMPLETED</div><div className="hint" style={{fontSize:11,marginTop:5}}>{progress}% through planned music</div></div>
        </div>
        <div style={{height:7,borderRadius:99,background:'rgba(255,255,255,.08)',marginTop:15,overflow:'hidden'}}><div style={{height:'100%',width:progress+'%',background:'var(--accent)',transition:'width .2s'}} /></div>
      </section>

      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(280px,360px)',gap:16,alignItems:'start'}}>
        <main>
          <section className="panel" style={{marginBottom:12}}>
            <div className="shead" style={{alignItems:'center',gap:12}}>
              <div>
                <div className="eyebrow">LIVE TIMELINE</div>
                <h2 style={{margin:'5px 0'}}>{liveMoment ? liveMoment.item : nextMoment ? 'Next: ' + nextMoment.item : 'Run of Show'}</h2>
                <p className="hint" style={{marginBottom:0}}>
                  {liveMoment
                    ? (times[liveMoment.item] ? formatTime(times[liveMoment.item]) + ' · Current timeline position' : 'Current timeline position')
                    : isEventToday && timedMoments.length ? 'Waiting for the first scheduled moment.' : 'Add optional times in the Planner to make this timeline time-aware.'}
                </p>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:12,fontWeight:800,letterSpacing:'.08em',opacity:.65}}>{clock.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</div>
                <div className="hint" style={{fontSize:10,marginTop:3}}>LOCAL EVENT TIME</div>
              </div>
            </div>
            <div style={{display:'grid',gap:7,marginTop:14}}>
              {moments.map((m,idx) => {
                const status = timelineStatus(m);
                const songs = plan.selections?.[m.item] || [];
                const t = times[m.item];
                return <div key={m.item} style={{display:'grid',gridTemplateColumns:'78px minmax(0,1fr) auto',gap:10,alignItems:'center',padding:'10px 11px',borderRadius:9,border:status==='current'?'1px solid var(--accent)':'1px solid rgba(255,255,255,.07)',background:status==='current'?'rgba(233,187,95,.08)':status==='complete'?'rgba(120,220,150,.035)':'rgba(255,255,255,.018)'}}>
                  <span style={{fontSize:12,fontWeight:800,opacity:.65}}>{t ? formatTime(t) : '—'}</span>
                  <span><strong>{idx+1}. {m.item}</strong><small style={{display:'block',opacity:.55}}>{songs.length} planned song{songs.length===1?'':'s'}</small></span>
                  <span className="ai-pill" style={{borderColor:status==='current'?'var(--accent)':'rgba(255,255,255,.12)'}}>{status==='current'?'NOW':status==='complete'?'DONE':'UP NEXT'}</span>
                </div>;
              })}
            </div>
          </section>

          {moments.map((m, idx) => {
            const songs = (plan.selections || {})[m.item] || [];
            if (!songs.length && m.item !== 'Must Play' && m.item !== 'Do Not Play') return null;
            const sectionDone = songs.length > 0 && songs.every(s => done[m.item + '|' + songKey(s)]);
            const status = timelineStatus(m);
            return <section className="panel" key={m.item} style={{marginBottom:10,opacity:sectionDone ? .7 : 1,border:status==='current'?'1px solid rgba(233,187,95,.55)':undefined}}>
              <div className="shead" style={{alignItems:'center'}}>
                <div><div className="eyebrow">{m.group}{times[m.item] ? ' · ' + formatTime(times[m.item]) : ''}</div><h2 style={{margin:'4px 0'}}>{idx + 1}. {m.item}</h2></div>
                {sectionDone ? <span className="ai-pill">COMPLETE ✓</span> : status==='current' ? <span className="ai-pill">CURRENT</span> : null}
              </div>
              {songs.length ? <div style={{display:'grid',gap:7,marginTop:10}}>{songs.map((s,i) => {
                const k = m.item + '|' + songKey(s); const checked = !!done[k]; const playing = currentText && songKey(s).toLowerCase() === currentText;
                return <button key={k} onClick={() => toggle(k)} style={{display:'grid',gridTemplateColumns:'32px minmax(0,1fr) auto',gap:10,alignItems:'center',textAlign:'left',padding:12,borderRadius:10,border:playing?'1px solid var(--accent)':checked?'1px solid rgba(120,220,150,.35)':'1px solid rgba(255,255,255,.08)',background:playing?'rgba(233,187,95,.09)':checked?'rgba(120,220,150,.05)':'rgba(255,255,255,.02)',color:'var(--fg)',cursor:'pointer'}}>
                  <span style={{width:24,height:24,borderRadius:7,border:'1px solid '+(checked?'rgba(120,220,150,.7)':'rgba(255,255,255,.22)'),display:'grid',placeItems:'center',fontWeight:900}}>{checked?'✓':i+1}</span>
                  <span><b style={{textDecoration:checked?'line-through':'none'}}>{s.title}</b><span style={{display:'block',opacity:.65,fontSize:12}}>{s.artist}</span></span>
                  {playing ? <span className="ai-pill">NOW PLAYING</span> : <span style={{fontSize:11,opacity:.5}}>{checked?'PLAYED':'PLAY'}</span>}
                </button>;
              })}</div> : <p className="hint" style={{marginBottom:0}}>No library selections assigned to this moment yet.</p>}
              {plan.notes?.[m.item] && <div className="hint" style={{marginTop:10,paddingTop:10,borderTop:'1px solid rgba(255,255,255,.07)'}}>DJ NOTE: {plan.notes[m.item]}</div>}
            </section>;
          })}
        </main>

        <aside style={{position:'sticky',top:12,display:'grid',gap:12}}>
          <section className="panel">
            <div className="eyebrow">LIVE CONTROL</div>
            <div style={{marginTop:8,padding:13,borderRadius:10,border:'1px solid '+(bridge?'rgba(120,220,150,.35)':'rgba(255,255,255,.08)'),background:'rgba(255,255,255,.025)'}}>
              <div style={{fontSize:11,fontWeight:800,opacity:.55}}>VIRTUALDJ BRIDGE</div>
              <strong>{bridge?'CONNECTED':'NOT CONNECTED'}</strong>
              {nowPlaying ? <div style={{marginTop:9}}><div style={{fontSize:11,opacity:.55}}>CURRENTLY PLAYING</div><b>{nowPlaying.title}</b><span style={{display:'block',fontSize:12,opacity:.65}}>{nowPlaying.artist}</span></div> : <p className="hint" style={{fontSize:12,marginBottom:0}}>Connect the DJ Request Live Bridge to see the live track.</p>}
            </div>
          </section>

          <section className="panel">
            <div className="eyebrow">NEXT UP</div>
            {nextMoment ? <><h2 style={{margin:'5px 0'}}>{nextMoment.item}</h2><p className="hint">{nextTimed ? formatTime(times[nextTimed.item]) + ' · ' : ''}{(plan.selections?.[nextMoment.item] || []).length} planned song{(plan.selections?.[nextMoment.item] || []).length===1?'':'s'}.</p></> : <p className="hint">The planned music is complete.</p>}
          </section>

          <section className="panel">
            <div className="eyebrow">PERMANENT EVENT MEMORY</div>
            <h2 style={{margin:'5px 0'}}>Teach SI DJ what happened.</h2>
            <p className="hint">Save the completed event after the night. SI DJ records the planned songs, what was actually played, unplanned plays, skipped picks, repeated tracks, and repeated guest requests as performance evidence.</p>
            <button className="btn btn-gold btn-block" onClick={saveEventMemory} disabled={memoryBusy}>{memoryBusy ? 'Saving event memory…' : memory ? 'UPDATE EVENT MEMORY' : 'SAVE EVENT MEMORY'}</button>
            {memory && <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:7,marginTop:10}}>
              {[
                ['PLAYED',memory.totals?.played_tracks ?? 0],
                ['UNIQUE',memory.totals?.unique_played ?? 0],
                ['PLANNED HIT',memory.totals?.planned_played ?? 0],
                ['REPEAT REQUESTS',memory.totals?.repeat_request_count ?? 0]
              ].map(([label,value])=><div key={label} style={{padding:'9px',border:'1px solid rgba(255,255,255,.08)',borderRadius:8}}><small style={{display:'block',opacity:.5,fontWeight:800}}>{label}</small><strong>{value}</strong></div>)}
            </div>}
          </section>

          <section className="panel">
            <div className="eyebrow">EVENT QUICK ACCESS</div>
            <div style={{display:'grid',gap:7,marginTop:10}}><Link className="btn btn-gold btn-block" to="/intelligence">Open SI DJ</Link><Link className="btn btn-ghost btn-block" to="/curate">Open Full Planner</Link></div>
          </section>
        </aside>
      </div>
    </div>
  </div>;
}
