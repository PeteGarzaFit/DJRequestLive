import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mark } from '../components/Logo.jsx';

const WEDDING_MOMENTS = [
  ['CEREMONY','Pre-Ceremony','Processional','Bride Entrance','Unity / Special Ceremony Song','Recessional'],
  ['COCKTAIL HOUR','Cocktail'],
  ['DINNER','Dinner / Background'],
  ['FORMALITIES','Grand Entrance','Bridal Party Entrance','First Dance','Father–Daughter Dance','Mother–Son Dance','Anniversary Dance'],
  ['RECEPTION','Open Dance Floor','Cake Cutting','Bouquet Toss','Garter / Alternative'],
  ['TOASTS & SPECIALS','Toasts / Speeches','Last Dance','Must Play','Do Not Play'],
];

function loadPlan() { try { return JSON.parse(localStorage.getItem('djrl_event_curator') || '{}'); } catch { return {}; } }
function songKey(s) { return String(s?.title || '') + '|' + String(s?.artist || ''); }

export default function NightOf() {
  const [plan] = useState(loadPlan);
  const [done, setDone] = useState(() => { try { return JSON.parse(localStorage.getItem('djrl_event_night_done') || '{}'); } catch { return {}; } });
  const [nowPlaying, setNowPlaying] = useState(null);
  const [bridge, setBridge] = useState(false);

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

  function toggle(key) {
    setDone(x => {
      const next = { ...x, [key]: !x[key] };
      localStorage.setItem('djrl_event_night_done', JSON.stringify(next));
      return next;
    });
  }
  function resetNight() { setDone({}); localStorage.removeItem('djrl_event_night_done'); }

  const totalItems = moments.reduce((n, m) => n + ((plan.selections || {})[m.item] || []).length, 0);
  const completed = Object.values(done).filter(Boolean).length;
  const progress = totalItems ? Math.min(100, Math.round(completed / totalItems * 100)) : 0;
  const currentText = nowPlaying ? songKey(nowPlaying).toLowerCase() : '';
  const nextMoment = moments.find(m => (plan.selections?.[m.item] || []).some(s => !done[m.item + '|' + songKey(s)])) || moments.find(m => (plan.selections?.[m.item] || []).length);

  return <div className="rl rl-app">
    <div className="wrap wide">
      <div className="shead" style={{marginBottom:14}}>
        <Link to="/studio" className="brand" style={{textDecoration:'none',color:'inherit'}}><Mark size={28} badge/>DJ Request Live</Link>
        <div className="shead-r"><Link className="mini" to="/curate">Planner</Link><Link className="mini" to="/intelligence">SI DJ</Link><button className="btn btn-ghost btn-sm" onClick={resetNight}>Reset Night</button></div>
      </div>

      <section className="panel" style={{marginBottom:16}}>
        <div className="eyebrow">DJ EVENT MODE</div>
        <div className="shead" style={{alignItems:'end',gap:16}}>
          <div><h1 style={{fontSize:34,margin:'6px 0'}}>{plan.name || 'Tonight’s Event'}</h1><p className="hint" style={{margin:0}}>{plan.details?.venue || 'Event venue'}{plan.details?.eventDate ? ' · ' + plan.details.eventDate : ''}</p></div>
          <div style={{textAlign:'right'}}><div className="ai-pill">{completed} / {totalItems} COMPLETED</div><div className="hint" style={{fontSize:11,marginTop:5}}>{progress}% through planned music</div></div>
        </div>
        <div style={{height:7,borderRadius:99,background:'rgba(255,255,255,.08)',marginTop:15,overflow:'hidden'}}><div style={{height:'100%',width:progress+'%',background:'var(--accent)',transition:'width .2s'}} /></div>
      </section>

      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(280px,360px)',gap:16,alignItems:'start'}}>
        <main>
          {moments.map((m, idx) => {
            const songs = (plan.selections || {})[m.item] || [];
            if (!songs.length && m.item !== 'Must Play' && m.item !== 'Do Not Play') return null;
            const sectionDone = songs.length > 0 && songs.every(s => done[m.item + '|' + songKey(s)]);
            return <section className="panel" key={m.item} style={{marginBottom:10,opacity:sectionDone ? .7 : 1}}>
              <div className="shead" style={{alignItems:'center'}}><div><div className="eyebrow">{m.group}</div><h2 style={{margin:'4px 0'}}>{idx + 1}. {m.item}</h2></div>{sectionDone && <span className="ai-pill">COMPLETE ✓</span>}</div>
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
          <section className="panel"><div className="eyebrow">LIVE CONTROL</div><div style={{marginTop:8,padding:13,borderRadius:10,border:'1px solid '+(bridge?'rgba(120,220,150,.35)':'rgba(255,255,255,.08)'),background:'rgba(255,255,255,.025)'}}><div style={{fontSize:11,fontWeight:800,opacity:.55}}>VIRTUALDJ BRIDGE</div><strong>{bridge?'CONNECTED':'NOT CONNECTED'}</strong>{nowPlaying ? <div style={{marginTop:9}}><div style={{fontSize:11,opacity:.55}}>CURRENTLY PLAYING</div><b>{nowPlaying.title}</b><span style={{display:'block',fontSize:12,opacity:.65}}>{nowPlaying.artist}</span></div> : <p className="hint" style={{fontSize:12,marginBottom:0}}>Connect the DJ Request Live Bridge to see the live track.</p>}</div></section>
          <section className="panel"><div className="eyebrow">NEXT UP</div>{nextMoment ? <><h2 style={{margin:'5px 0'}}>{nextMoment.item}</h2><p className="hint">{(plan.selections?.[nextMoment.item] || []).length} planned song{(plan.selections?.[nextMoment.item] || []).length===1?'':'s'} remaining.</p></> : <p className="hint">The planned music is complete.</p>}</section>
          <section className="panel"><div className="eyebrow">EVENT QUICK ACCESS</div><div style={{display:'grid',gap:7,marginTop:10}}><Link className="btn btn-gold btn-block" to="/intelligence">Open SI DJ</Link><Link className="btn btn-ghost btn-block" to="/curate">Open Full Planner</Link></div></section>
        </aside>
      </div>
    </div>
  </div>;
}
