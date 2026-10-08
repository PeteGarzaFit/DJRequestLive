import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../lib/api.js';
import { songRows } from '../lib/songLibrary.js';
import { Mark } from '../components/Logo.jsx';
import { toast } from '../lib/toast.js';

const GENRES = [
  ['Country','#2f8fce'],['Texas Country','#2b74d6'],['Red Dirt','#2e9b73'],['Pop','#8b5cf6'],
  ['Hip-Hop','#d946ef'],['R&B','#ec4899'],['Rock','#e05252'],['Dance / EDM','#f59e0b'],
  ['Disco / Funk','#eab308'],['Latin','#8b5cf6'],['Reggaeton','#c026d3'],['Regional Mexican','#dc2626'],
  ['Tejano','#16a34a'],['Conjunto','#65a30d'],['Norteño','#ca8a04'],['Cumbia','#f97316'],['West Coast Swing','#0ea5e9']
];
const VIBES = [
  ['KEEP VIBE','#64748b'],['RAISE ENERGY','#ef4444'],['DANCE','#f59e0b'],['PARTY','#ec4899'],
  ['SINGALONG','#22c55e'],['CHILL','#38bdf8'],['PEAK TIME','#a855f7'],['WILD CARD','#14b8a6']
];
const ERAS = ['ALL','CURRENT','2020s','2010s','2000s','90s','80s','70s','CLASSICS'];

function normalizeText(value){
  return String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

function normalizeArtist(value){
  return normalizeText(value).replace(/\\b(the|band|and the|the departed)\\b/g,' ').replace(/\\s+/g,' ').trim();
}

function haystack(s){ return [s.genre,s.tags,s.era,s.title,s.artist].join(' ').toLowerCase(); }

function artistMatches(artist, query){
  const a = normalizeArtist(artist);
  const q = normalizeArtist(query);
  if(!q) return false;
  if(a === q || a.startsWith(q+' ')) return true;
  const artistWords = a.split(' ').filter(Boolean);
  const queryWords = q.split(' ').filter(Boolean);
  return queryWords.length > 0 && queryWords.every(word => artistWords.includes(word));
}

function genreMatches(s, selected){
  const g = normalizeText(s.genre);
  const tags = normalizeText(s.tags);
  const wanted = normalizeText(selected);
  if(!wanted) return true;
  if(wanted === 'texas country') return g.includes('texas country') || tags.includes('texascountry');
  if(wanted === 'red dirt') return g.includes('red dirt') || tags.includes('red dirt');
  if(wanted === 'hip hop') return g.includes('hip hop') || tags.includes('hiphop');
  if(wanted === 'r b') return g.includes('r b') || tags.includes('rnb');
  if(wanted === 'dance edm') return g.includes('dance') || g.includes('edm') || tags.includes('dance');
  if(wanted === 'disco funk') return g.includes('disco') || g.includes('funk') || tags.includes('disco') || tags.includes('funk');
  if(wanted === 'regional mexican') return g.includes('regional mexican') || tags.includes('regionalmexican');
  if(wanted === 'norteno') return g.includes('norteno') || tags.includes('norteno');
  if(wanted === 'west coast swing') return g.includes('west coast swing') || g === 'wcs' || tags.includes('westcoastswing') || tags.includes('wcs');
  if(wanted === 'latin') return g.includes('latin') || tags.includes('latin');
  return g.includes(wanted) || tags.includes(wanted);
}

function eraMatches(s, selected){
  if(!selected || selected === 'ALL') return true;
  if(selected === 'CURRENT') return String(s.tags || '').toLowerCase().split(',').map(x=>x.trim()).includes('current');
  return s.era === selected;
}

function songKey(s){
  return normalizeText(s.title)+'|'+normalizeText(s.artist);
}

function diversityScore(s, nonce){
  const input = songKey(s)+'|'+String(nonce);
  let hash = 0;
  for(let i=0;i<input.length;i++) hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  return Math.abs(hash % 1000);
}

function scoreSong(s, filters, now){
  let score = Number(s.energy || 0) + Number(s.dancefloor || 0) + Number(s.singalong || 0) + Number(s.crossgen || 0);
  const hay = haystack(s);
  const genre = String(filters.genre || '').toLowerCase();
  const vibe = String(filters.vibe || '').toLowerCase();
  if (genre && hay.includes(genre)) score += 24;
  if (filters.era && (s.era === filters.era || (filters.era === 'CURRENT' && hay.includes('current')))) score += 18;
  if (vibe.includes('raise') || vibe === 'peak time') score += Number(s.energy || 0) * 2;
  if (vibe === 'dance' || vibe === 'party') score += Number(s.dancefloor || 0) * 2;
  if (vibe === 'singalong') score += Number(s.singalong || 0) * 2;
  if (vibe === 'chill') score += Math.max(0, 12 - Number(s.energy || 0));
  if (vibe === 'keep vibe' && now?.genre && hay.includes(String(now.genre).toLowerCase())) score += 20;
  if (now?.bpm && s.bpm) {
    const diff = Math.abs(Number(s.bpm) - Number(now.bpm));
    score += Math.max(0, 18 - diff);
    if (diff <= 8) score += 12;
  }
  if (now?.title && s.title.toLowerCase() === String(now.title).toLowerCase()) score -= 100;
  return score;
}

export default function Intelligence(){
  const [bridge,setBridge]=useState({connected:false,source:null,nowPlaying:null,error:'Checking SI DJ Bridge…'});
  const [genre,setGenre]=useState('Country');
  const [vibe,setVibe]=useState('KEEP VIBE');
  const [era,setEra]=useState('ALL');
  const [visibleCount,setVisibleCount]=useState(10);
  const [refreshNonce,setRefreshNonce]=useState(0);
  const [query,setQuery]=useState('');
  const [ai,setAi]=useState([]);
  const [aiBusy,setAiBusy]=useState(false);
  const [librarySummary,setLibrarySummary]=useState(null);
  const [libraryTracks,setLibraryTracks]=useState([]);
  const [libraryBusy,setLibraryBusy]=useState(true);

  const loadBridge=useCallback(async()=>{
    try{
      const r=await fetch('http://127.0.0.1:8765/now-playing',{cache:'no-store'});
      if(!r.ok) throw new Error();
      setBridge(await r.json());
    }catch{
      setBridge({connected:false,source:null,nowPlaying:null,error:'Bridge offline'});
    }
  },[]);
  useEffect(()=>{ loadBridge(); const t=setInterval(loadBridge,2000); return()=>clearInterval(t); },[loadBridge]);

  const loadLibrary = useCallback(async()=>{
    setLibraryBusy(true);
    try{
      const summary = await api.librarySummary();
      setLibrarySummary(summary?.inventory || null);
      if(Number(summary?.inventory?.tracks || 0) > 0){
        const result = await api.librarySearch({ genre: genre === 'West Coast Swing' ? 'West Coast Swing' : genre, limit: 100 });
        setLibraryTracks((result?.tracks || []).map(t=>({
          ...t,
          era: t.year ? (Number(t.year)>=2020?'2020s':Number(t.year)>=2010?'2010s':Number(t.year)>=2000?'2000s':Number(t.year)>=1990?'90s':Number(t.year)>=1980?'80s':Number(t.year)>=1970?'70s':'CLASSICS') : 'CLASSICS',
          tags: genre === 'West Coast Swing' ? 'westcoastswing,wcs' : '',
        })));
      }else setLibraryTracks([]);
    }catch(e){
      setLibrarySummary(null);
      setLibraryTracks([]);
      toast(errorText(e));
    }finally{ setLibraryBusy(false); }
  },[genre]);
  useEffect(()=>{ loadLibrary(); },[loadLibrary]);

  const filters={genre,vibe,era};
  const artistFilter = useMemo(()=>{
    const q = query.trim();
    if(!q) return '';
    const artists = [...new Set(songRows().map(s=>s.artist))];
    return artists.find(name=>artistMatches(name,q)) || '';
  },[query]);

  const local=useMemo(()=>{
    if(libraryBusy || !Number(librarySummary?.tracks || 0)) return [];
    let rows=libraryTracks;
    if(artistFilter){
      rows=rows.filter(s=>normalizeArtist(s.artist)===normalizeArtist(artistFilter));
    }else if(query.trim()){
      const q=normalizeText(query);
      rows=rows.filter(s=>normalizeText(haystack(s)).includes(q));
    }
    rows=rows.filter(s=>genreMatches(s,genre) && eraMatches(s,era));
    return rows.map(s=>({...s,_score:scoreSong(s,filters,bridge.nowPlaying)}))
      .sort((a,b)=>b._score-a._score || diversityScore(a,refreshNonce)-diversityScore(b,refreshNonce));
  },[query,artistFilter,genre,vibe,era,bridge.nowPlaying,refreshNonce,libraryBusy,librarySummary,libraryTracks]);

  useEffect(()=>{
    setVisibleCount(10);
    setAi([]);
  },[query,artistFilter,genre,vibe,era]);

  const askAI=useCallback(async()=>{
    setAiBusy(true);
    try{
      const now=bridge.nowPlaying;
      const candidates=local.slice(0,40).map(s=>({title:s.title,artist:s.artist,genre:s.genre,era:s.era,bpm:s.bpm,tags:s.tags}));
      const hardFilter = [
        artistFilter ? 'ARTIST HARD FILTER: '+artistFilter : '',
        genre ? 'GENRE HARD FILTER: '+genre : '',
        era && era !== 'ALL' ? 'ERA HARD FILTER: '+era : '',
        query.trim() ? 'SEARCH: '+query.trim() : ''
      ].filter(Boolean).join(' | ');
      const prompt=[
        'SUPER INTELLIGENCE DJ TRACK FINDER.',
        'The DJ is choosing the NEXT track, not planning an event.',
        'Current track:', now ? JSON.stringify(now) : 'No current track available.',
        'DJ controls:', JSON.stringify(filters),
        hardFilter ? 'NON-NEGOTIABLE FILTERS: '+hardFilter : 'NON-NEGOTIABLE FILTERS: none',
        'Candidate library:', JSON.stringify(candidates),
        'Return JSON with recommendations: [{title,artist,reason,move}] and no more than 8 recommendations.',
        'Rank the best practical next-track choices first. Favor smooth BPM/genre/energy transitions. Do not invent tracks; use only candidates. Never violate a hard artist, genre, era, or search filter.'
      ].join('\n');
      const {plan}=await api.aiEventPlan(prompt);
      const recs=(plan?.recommendations||[]).flatMap(g=>g.songs||[]).slice(0,8);
      setAi(recs);
      if(!recs.length) toast('SI DJ did not return recommendations. The local ranked library is still ready.');
    }catch(e){ toast(errorText(e)); }
    finally{setAiBusy(false);}
  },[bridge.nowPlaying,filters,local,artistFilter,query]);

  const aiMap = useMemo(()=>{
    const map = new Map();
    ai.forEach(s=>map.set(songKey(s),s));
    return map;
  },[ai]);

  const displayPool = useMemo(()=>{
    if(!ai.length) return local;
    const aiFirst = [];
    const rest = [];
    local.forEach(s=>{
      const key=songKey(s);
      if(aiMap.has(key)) aiFirst.push({...s,...aiMap.get(key)});
      else rest.push(s);
    });
    return [...aiFirst,...rest];
  },[ai,aiMap,local]);

  const display = displayPool.slice(0,visibleCount);
  return <div className="rl rl-app"><div className="wrap wide">
    <div className="shead" style={{marginBottom:12}}>
      <Link to="/studio" className="brand" style={{textDecoration:'none',color:'inherit'}}><Mark size={28} badge/>DJ Request Live</Link>
      <div className="shead-r"><Link className="mini" to="/studio">Studio</Link><Link className="mini" to="/bridge">Bridge</Link></div>
    </div>

    <section className="panel" style={{position:'sticky',top:10,zIndex:20,backdropFilter:'blur(18px)',background:'rgba(14,17,24,.94)',borderColor:bridge.connected?'rgba(34,197,94,.45)':'rgba(255,255,255,.12)'}}>
      <div className="eyebrow">{bridge.connected ? '● NOW PLAYING · BRIDGE CONNECTED' : 'NOW PLAYING · BRIDGE OFFLINE'}</div>
      <div style={{display:'flex',justifyContent:'space-between',gap:18,alignItems:'center',marginTop:7,flexWrap:'wrap'}}>
        <div><h1 style={{fontSize:26,margin:'0 0 4px'}}>{bridge.nowPlaying?.title || 'Waiting for current track'}</h1><div className="hint" style={{fontSize:15}}>{bridge.nowPlaying ? [bridge.nowPlaying.artist,bridge.nowPlaying.genre,bridge.nowPlaying.bpm ? bridge.nowPlaying.bpm+' BPM':'',bridge.nowPlaying.key].filter(Boolean).join(' · ') : bridge.error}</div></div>
        <div className="eyebrow">SOURCE<br/><strong style={{fontSize:13}}>{bridge.source || '—'}</strong></div>
      </div>
    </section>

    <div style={{display:'grid',gridTemplateColumns:'minmax(330px,390px) minmax(0,1fr)',gap:18,alignItems:'start',marginTop:18}}>
      <aside className="panel" style={{position:'sticky',top:128}}>
        <div className="eyebrow">SUPER INTELLIGENCE DJ</div>
        <h2 style={{margin:'6px 0 4px'}}>Steer the next track</h2>
        <p className="hint" style={{marginTop:0}}>Choose a lane. SI DJ narrows the library so you don't dig through crates.</p>
        <div className="eyebrow" style={{marginTop:20}}>GENRE</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
          {GENRES.map(([g,c])=><button key={g} onClick={()=>{setGenre(current=>current===g?'':g);setAi([])}} style={{minHeight:48,textAlign:'left',padding:'10px 12px',borderRadius:9,border:genre===g?'2px solid '+c:'1px solid '+c+'66',background:genre===g?c+'30':'rgba(255,255,255,.035)',color:'var(--fg)',boxShadow:genre===g?'0 0 18px '+c+'38':'none',fontWeight:800,cursor:'pointer'}}>{g}</button>)}
        </div>
        <div className="eyebrow" style={{marginTop:22}}>VIBE / MOVE</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
          {VIBES.map(([v,c])=><button key={v} onClick={()=>{setVibe(v);setAi([])}} style={{minHeight:44,padding:'9px 10px',borderRadius:9,border:vibe===v?'2px solid '+c:'1px solid '+c+'55',background:vibe===v?c+'28':'rgba(255,255,255,.035)',color:'var(--fg)',boxShadow:vibe===v?'0 0 16px '+c+'35':'none',fontWeight:800,cursor:'pointer'}}>{v}</button>)}
        </div>
        <div className="eyebrow" style={{marginTop:22}}>ERA</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginTop:8}}>
          {ERAS.map(e=><button key={e} onClick={()=>{setEra(e);setAi([])}} style={{padding:'10px 5px',borderRadius:8,border:era===e?'2px solid var(--accent)':'1px solid rgba(255,255,255,.12)',background:era===e?'rgba(255,255,255,.10)':'rgba(255,255,255,.03)',color:'var(--fg)',fontSize:11,fontWeight:800,cursor:'pointer'}}>{e}</button>)}
        </div>
        <button className="btn btn-gold btn-block" style={{marginTop:18}} onClick={askAI} disabled={aiBusy}>{aiBusy?'SI DJ is finding the best moves…':'Ask SI DJ for the best next tracks →'}</button>
      </aside>

      <main>
        <section className="panel">
          <div className="shead"><div><div className="eyebrow">SUPER INTELLIGENCE TRACK LIST</div><h2 style={{margin:'5px 0 0'}}>Your next-track shortlist</h2><p className="hint" style={{marginTop:4}}>{genre} · {vibe} · {era} · ranked against the current track</p>{artistFilter && <div className="ai-pill" style={{display:'inline-flex',marginTop:7}}>ARTIST FILTER · {artistFilter}</div>}</div><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><span className="ai-pill">{ai.length?'AI RANKED':'LIBRARY RANKED'}</span><button className="btn btn-ghost btn-sm" onClick={()=>{setAi([]);setVisibleCount(10);setRefreshNonce(n=>n+1)}}>REFRESH LIST ↻</button></div></div>
          <div className="field" style={{marginTop:14}}><input className="input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search artist or song…" /></div>
          <div style={{display:'grid',gap:9,marginTop:12}}>
            {display.map((s,i)=><article key={(s.title||'')+'|'+(s.artist||'')+'|'+i} style={{display:'grid',gridTemplateColumns:'44px minmax(0,1fr) auto',gap:12,alignItems:'center',padding:'13px 14px',border:'1px solid rgba(255,255,255,.09)',borderRadius:12,background:'rgba(255,255,255,.025)'}}>
              <strong style={{fontSize:18,opacity:.65}}>{String(i+1).padStart(2,'0')}</strong>
              <div><strong style={{display:'block'}}>{s.title}</strong><span>{s.artist}</span><small style={{display:'block',marginTop:3}}>{s.reason || [s.genre,s.era,s.bpm?s.bpm+' BPM':''].filter(Boolean).join(' · ')}</small></div>
              <div style={{textAlign:'right'}}><b>{s.bpm ? s.bpm+' BPM' : ''}</b>{s.move && <small style={{display:'block'}}>{s.move}</small>}<button className="btn btn-ghost btn-sm" style={{marginTop:5}} onClick={()=>navigator.clipboard?.writeText((s.title||'')+' — '+(s.artist||''))}>Copy</button></div>
            </article>)}
          </div>
          {!display.length && libraryBusy && <p className="hint">Checking your private SI DJ library…</p>}
          {!display.length && !libraryBusy && Number(librarySummary?.tracks || 0) === 0 && <div className="ai-pill" style={{marginTop:12}}>SI DJ LIBRARY EMPTY — connect the SI DJ Bridge and scan your music library to populate this list.</div>}
          {!display.length && !libraryBusy && Number(librarySummary?.tracks || 0) > 0 && <p className="hint">{artistFilter ? 'No '+artistFilter+' tracks match the current hard filters. Remove an era or genre control to widen the search.' : 'No matches. Change one hard filter or search term to widen the shortlist.'}</p>}
          {display.length < displayPool.length && <button className="btn btn-ghost btn-block" style={{marginTop:12}} onClick={()=>setVisibleCount(n=>Math.min(n+10,displayPool.length))}>MORE TRACKS →</button>}
          {display.length >= displayPool.length && displayPool.length > 0 && <p className="hint" style={{marginTop:10}}>Showing all {displayPool.length} matching tracks — no unrelated songs added.</p>}
        </section>
        <section className="panel" style={{marginTop:18}}>
          <div className="eyebrow">WHY THIS WORKS</div>
          <h2 style={{margin:'5px 0'}}>Stop digging through crates.</h2>
          <p className="hint">The current track is the anchor. Genre, vibe and era are your performance controls. SI DJ ranks a small set of practical next-track choices so the DJ can make the final call quickly.</p>
        </section>
      </main>
    </div>
    </div>
  </div>
}
