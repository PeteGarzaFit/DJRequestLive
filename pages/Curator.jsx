import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { songRows } from '../lib/songLibrary.js';
import { Mark } from '../components/Logo.jsx';

const EVENT_TYPES = ['Wedding','Birthday','Corporate','Quinceañera','Bar / Club','Festival','Private Party'];
const WEDDING_SECTIONS = [
  ['CEREMONY','Processional','Bride Entrance','Recessional'],
  ['COCKTAIL HOUR','Cocktail'],
  ['DINNER','Dinner'],
  ['FORMALITIES','Grand Entrance','First Dance','Father–Daughter Dance','Mother–Son Dance','Anniversary Dance'],
  ['RECEPTION','Cake Cutting','Bouquet Toss','Garter / Bouquet Alternative','Open Dance Floor'],
  ['SPECIAL MOMENTS','Last Dance','Do Not Play','Must Play'],
];

function key(s){ return String(s.title||'')+'|'+String(s.artist||''); }

export default function Curator(){
  const [eventType,setEventType]=useState('Wedding');
  const [name,setName]=useState('');
  const [search,setSearch]=useState('');
  const [active,setActive]=useState('Processional');
  const [selections,setSelections]=useState({});
  const [notes,setNotes]=useState({});
  const [guestIdeas,setGuestIdeas]=useState([]);
  const [idea,setIdea]=useState('');
  const [saved,setSaved]=useState(false);

  const sections=eventType==='Wedding'
    ? WEDDING_SECTIONS.flatMap(([group,...items])=>items.map(item=>({group,item})))
    : [
      {group:'EVENT MUSIC',item:'Must Play'},
      {group:'EVENT MUSIC',item:'Cocktail / Arrival'},
      {group:'EVENT MUSIC',item:'Dinner / Background'},
      {group:'EVENT MUSIC',item:'Main Event'},
      {group:'EVENT MUSIC',item:'Last Songs'},
      {group:'EVENT MUSIC',item:'Do Not Play'},
    ];

  const activeSection=sections.find(x=>x.item===active) || sections[0];
  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return songRows().filter(s=>!q || [s.title,s.artist,s.genre,s.tags].join(' ').toLowerCase().includes(q)).slice(0,80);
  },[search]);

  function addSong(song){
    setSelections(prev=>({...prev,[active]:[...(prev[active]||[]).filter(x=>key(x)!==key(song)),song]}));
  }
  function removeSong(song){
    setSelections(prev=>({...prev,[active]:(prev[active]||[]).filter(x=>key(x)!==key(song))}));
  }
  function addIdea(){
    const v=idea.trim();
    if(!v)return;
    setGuestIdeas(x=>[...x,{text:v,section:active,from:'Family / Bridal Party'}]);
    setIdea('');
  }
  function save(){
    localStorage.setItem('djrl_event_curator',JSON.stringify({eventType,name,selections,notes,guestIdeas}));
    setSaved(true); setTimeout(()=>setSaved(false),1600);
  }

  const selected=selections[active]||[];
  const total=Object.values(selections).reduce((n,x)=>n+x.length,0);
  return <div className="rl rl-app">
    <div className="wrap wide">
      <div className="shead" style={{marginBottom:14}}>
        <Link to="/studio" className="brand" style={{textDecoration:'none',color:'inherit'}}><Mark size={28} badge/>DJ Request Live</Link>
        <div className="shead-r"><Link className="mini" to="/intelligence">SI DJ</Link><Link className="mini" to="/studio">Studio</Link></div>
      </div>

      <section className="panel" style={{marginBottom:18}}>
        <div className="eyebrow">DJ REQUEST LIVE · EVENT MUSIC CURATOR</div>
        <h1 style={{fontSize:34,margin:'6px 0'}}>Build the music plan together.</h1>
        <p className="hint" style={{maxWidth:820,fontSize:15}}>No five-page music planning sheet. Choose the event, work through the moments that matter, and let the host, family and bridal party help build the music plan.</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:18}}>
          {EVENT_TYPES.map(t=><button key={t} className={eventType===t?'btn btn-gold btn-sm':'btn btn-ghost btn-sm'} onClick={()=>{setEventType(t);setActive(t==='Wedding'?'Processional':'Must Play')}}>{t}</button>)}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,marginTop:14}}>
          <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder={eventType==='Wedding'?'Couple / event name':'Host / event name'} />
          <button className="btn btn-gold" onClick={save}>{saved?'Saved ✓':'Save Plan'}</button>
        </div>
      </section>

      <div style={{display:'grid',gridTemplateColumns:'minmax(220px,280px) minmax(0,1fr) minmax(280px,390px)',gap:16,alignItems:'start'}}>
        <aside className="panel" style={{position:'sticky',top:12}}>
          <div className="eyebrow">PLAN SECTIONS</div>
          {eventType==='Wedding' && <p className="hint" style={{fontSize:12}}>The wedding flow is built around the actual moments: ceremony, cocktail hour, dinner, formalities, reception and special songs.</p>}
          <div style={{display:'grid',gap:5,marginTop:12}}>
            {sections.map((s,i)=><button key={s.item} onClick={()=>setActive(s.item)} style={{textAlign:'left',padding:'10px 11px',borderRadius:9,border:active===s.item?'1px solid var(--accent)':'1px solid rgba(255,255,255,.08)',background:active===s.item?'rgba(255,255,255,.08)':'transparent',color:'var(--fg)',cursor:'pointer'}}>
              <small style={{display:'block',opacity:.55,fontWeight:800}}>{s.group}</small><strong>{s.item}</strong><span style={{float:'right',opacity:.6}}>{(selections[s.item]||[]).length}</span>
            </button>)}
          </div>
        </aside>

        <main className="panel">
          <div className="shead">
            <div><div className="eyebrow">{activeSection?.group}</div><h2 style={{margin:'5px 0'}}>Music for {active}</h2><p className="hint">Search the DJ library and add the songs you want for this moment.</p></div>
            <span className="ai-pill">{selected.length} SELECTED</span>
          </div>
          <div className="field" style={{marginTop:14}}><input className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search song or artist…" /></div>
          <div style={{display:'grid',gap:7,maxHeight:600,overflowY:'auto',marginTop:12}}>
            {filtered.map(s=>{
              const picked=selected.some(x=>key(x)===key(s));
              return <div key={key(s)} style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:10,alignItems:'center',padding:'11px 12px',border:'1px solid '+(picked?'rgba(233,187,95,.45)':'rgba(255,255,255,.08)'),borderRadius:10,background:picked?'rgba(233,187,95,.08)':'rgba(255,255,255,.02)'}}>
                <div><b>{s.title}</b><span style={{display:'block'}}>{s.artist}</span><small>{s.genre} · {s.era}{s.bpm?' · '+s.bpm+' BPM':''}</small></div>
                <button className={picked?'btn btn-ghost btn-sm':'btn btn-gold btn-sm'} onClick={()=>picked?removeSong(s):addSong(s)}>{picked?'Remove':'Add'}</button>
              </div>
            })}
          </div>
        </main>

        <aside>
          <section className="panel">
            <div className="eyebrow">YOUR PICKS</div>
            <h2 style={{margin:'5px 0'}}>This moment</h2>
            <div style={{display:'grid',gap:7}}>
              {selected.map((s,i)=><div key={key(s)} style={{padding:'10px 11px',border:'1px solid rgba(255,255,255,.08)',borderRadius:9}}><strong>{i+1}. {s.title}</strong><span style={{display:'block',fontSize:12,opacity:.7}}>{s.artist}</span></div>)}
              {!selected.length && <p className="hint">Nothing selected yet.</p>}
            </div>
            <div className="field" style={{marginTop:12}}><label>Notes</label><textarea className="input" rows="4" value={notes[active]||''} onChange={e=>setNotes(x=>({...x,[active]:e.target.value}))} placeholder="Example: No slow songs here. Couple wants this section upbeat." /></div>
          </section>

          <section className="panel" style={{marginTop:16}}>
            <div className="eyebrow">COLLABORATE</div>
            <h2 style={{margin:'5px 0'}}>Family & bridal party</h2>
            <p className="hint">Give everyone one place to suggest songs instead of collecting texts, emails and five-page spreadsheets.</p>
            <div className="field"><label>Suggestion for {active}</label><input className="input" value={idea} onChange={e=>setIdea(e.target.value)} placeholder="Artist — Song" onKeyDown={e=>e.key==='Enter'&&addIdea()} /></div>
            <button className="btn btn-ghost btn-block" onClick={addIdea}>Add family suggestion</button>
            <div style={{display:'grid',gap:7,marginTop:10}}>
              {guestIdeas.filter(x=>x.section===active).map((x,i)=><div key={i} style={{padding:'9px 10px',borderRadius:9,background:'rgba(255,255,255,.035)'}}><b>{x.text}</b><small style={{display:'block',opacity:.6}}>Family / Bridal Party</small></div>)}
            </div>
          </section>

          <section className="panel" style={{marginTop:16}}>
            <div className="eyebrow">PLAN PROGRESS</div>
            <div style={{fontSize:30,fontWeight:900,marginTop:4}}>{total}</div>
            <p className="hint">songs selected across this event.</p>
            <button className="btn btn-gold btn-block" onClick={save}>Save Event Plan</button>
            <p className="hint" style={{fontSize:11,marginBottom:0}}>Next layer: a hosted event link so the couple and invited family can curate together from their own phones.</p>
          </section>
        </aside>
      </div>
    </div>
  </div>;
}
