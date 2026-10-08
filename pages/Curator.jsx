import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { songRows } from '../lib/songLibrary.js';
import { Mark } from '../components/Logo.jsx';

const EVENT_TYPES = ['Wedding','Birthday','Corporate','Quinceañera','Bar / Club','Festival','Private Party'];
const WEDDING_MOMENTS = [
  ['CEREMONY','Pre-Ceremony','Processional','Bride Entrance','Unity / Special Ceremony Song','Recessional'],
  ['COCKTAIL HOUR','Cocktail'],
  ['DINNER','Dinner / Background'],
  ['FORMALITIES','Grand Entrance','Bridal Party Entrance','First Dance','Father–Daughter Dance','Mother–Son Dance','Anniversary Dance'],
  ['RECEPTION','Open Dance Floor','Cake Cutting','Bouquet Toss','Garter / Alternative'],
  ['TOASTS & SPECIALS','Toasts / Speeches','Last Dance','Must Play','Do Not Play'],
];
const WEDDING_STYLES = ['Country','Pop','Oldies / 50s–60s','Classic Rock / 60s–70s','80s Rock / Pop','Rap / Hip-Hop','R&B','Heavy Metal','Classical','Latin Pop','Bachata','Tejano','Cumbia','Zapateado','Norteño','Conjunto','Huapango','Salsa / Merengue','Reggaeton','Folk','Jazz','Alternative Rock','Big Band','Christian','Disco / Funk','Reggae','Punk','Techno'];
const BEHAVIORS = ['Encourage guests to participate','Single out guests who are not dancing','Joke / laugh / talk during open dance','Be humorous when announcing events','Be serious / professional when announcing events','Take guest requests','Take bridal-party requests'];

function key(s){ return String(s.title||'')+'|'+String(s.artist||''); }
function blankMap(items){ return Object.fromEntries(items.map(x=>[x,''])); }

export default function Curator(){
  const [eventType,setEventType]=useState('Wedding');
  const [tab,setTab]=useState('OVERVIEW');
  const [name,setName]=useState('');
  const [search,setSearch]=useState('');
  const [active,setActive]=useState('Pre-Ceremony');
  const [selections,setSelections]=useState({});
  const [notes,setNotes]=useState({});
  const [guestIdeas,setGuestIdeas]=useState([]);
  const [idea,setIdea]=useState('');
  const [saved,setSaved]=useState(false);
  const [details,setDetails]=useState({
    primaryContact:'', phone:'', email:'', venue:'', address:'', eventDate:'', ceremonyTime:'', receptionTime:'', endTime:'',
    ceremonyMusic:true, ceremonyMics:true, preCeremonyMusic:'', vows:'', reader:'', readerSide:'', specialCeremonySong:'',
    cocktailLocation:'', cocktailSpeaker:false, receptionRoom:'', djLocation:'', extraSpeakers:false,
    dinnerStyle:'', firstCourse:'', toastPeople:'', cakeVendor:'', exitLocation:'', exitPerson:'', specialNotes:''
  });
  const [specialSongs,setSpecialSongs]=useState(blankMap(['Grand Entrance','Bridal Party Entrance','First Dance','Father–Daughter Dance','Mother–Son Dance','Last Dance']));
  const [styles,setStyles]=useState({});
  const [artists,setArtists]=useState('');
  const [behavior,setBehavior]=useState({});
  const [bridalParty,setBridalParty]=useState('');
  const [timeline,setTimeline]=useState('');
  const [spotifyUrl,setSpotifyUrl]=useState('');

  const moments=eventType==='Wedding'
    ? WEDDING_MOMENTS.flatMap(([group,...items])=>items.map(item=>({group,item})))
    : [
      {group:'EVENT MUSIC',item:'Arrival / Cocktail'},
      {group:'EVENT MUSIC',item:'Dinner / Background'},
      {group:'EVENT MUSIC',item:'Main Event'},
      {group:'EVENT MUSIC',item:'Must Play'},
      {group:'EVENT MUSIC',item:'Do Not Play'},
      {group:'EVENT MUSIC',item:'Last Songs'},
    ];

  const activeMoment=moments.find(x=>x.item===active)||moments[0];
  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return songRows().filter(s=>!q || [s.title,s.artist,s.genre,s.tags].join(' ').toLowerCase().includes(q)).slice(0,100);
  },[search]);

  function setDetail(k,v){ setDetails(x=>({...x,[k]:v})); }
  function addSong(song){ setSelections(x=>({...x,[active]:[...(x[active]||[]).filter(s=>key(s)!==key(song)),song]})); }
  function removeSong(song){ setSelections(x=>({...x,[active]:(x[active]||[]).filter(s=>key(s)!==key(song))})); }
  function addIdea(){ const v=idea.trim(); if(!v)return; setGuestIdeas(x=>[...x,{text:v,section:active,from:'Family / Bridal Party'}]); setIdea(''); }
  function save(){
    localStorage.setItem('djrl_event_curator',JSON.stringify({eventType,name,details,selections,notes,guestIdeas,specialSongs,styles,artists,behavior,bridalParty,timeline,spotifyUrl}));
    setSaved(true); setTimeout(()=>setSaved(false),1600);
  }
  function toggleStyle(s){ setStyles(x=>({...x,[s]:x[s]==='like'?'dislike':x[s]==='dislike'?undefined:'like'})); }
  function toggleBehavior(s){ setBehavior(x=>({...x,[s]:x[s]==='do'?'dont':x[s]==='dont'?undefined:'do'})); }

  const selected=selections[active]||[];
  const total=Object.values(selections).reduce((n,x)=>n+x.length,0);
  const tabs=eventType==='Wedding'?['OVERVIEW','WEDDING FLOW','MUSIC','PREFERENCES','COLLABORATE']:['OVERVIEW','MUSIC','PREFERENCES','COLLABORATE'];

  return <div className="rl rl-app">
    <div className="wrap wide">
      <div className="shead" style={{marginBottom:14}}>
        <Link to="/studio" className="brand" style={{textDecoration:'none',color:'inherit'}}><Mark size={28} badge/>DJ Request Live</Link>
        <div className="shead-r"><Link className="mini" to="/intelligence">SI DJ</Link><Link className="mini" to="/studio">Studio</Link></div>
      </div>

      <section className="panel" style={{marginBottom:16}}>
        <div className="eyebrow">DJ REQUEST LIVE · EVENT MUSIC CURATOR</div>
        <div className="shead" style={{alignItems:'end',gap:16}}>
          <div><h1 style={{fontSize:34,margin:'6px 0'}}>Build the event together.</h1><p className="hint" style={{maxWidth:850,fontSize:15}}>Replace the five-page planning sheet with one guided workspace. The host chooses the event, selects the important moments, curates music, and invites the people who should have a voice.</p></div>
          <span className="ai-pill">{total} SONGS CURATED</span>
        </div>
        <div style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:16}}>
          {EVENT_TYPES.map(t=><button key={t} className={eventType===t?'btn btn-gold btn-sm':'btn btn-ghost btn-sm'} onClick={()=>{setEventType(t);setTab('OVERVIEW');setActive(t==='Wedding'?'Pre-Ceremony':'Arrival / Cocktail')}}>{t}</button>)}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:10,marginTop:12}}>
          <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder={eventType==='Wedding'?'Couple / event name':'Host / event name'} />
          <button className="btn btn-gold" onClick={save}>{saved?'Saved ✓':'Save Plan'}</button>
        </div>
        <div style={{display:'flex',gap:5,overflowX:'auto',marginTop:14,paddingBottom:2}}>
          {tabs.map(t=><button key={t} className={tab===t?'btn btn-gold btn-sm':'btn btn-ghost btn-sm'} onClick={()=>setTab(t)}>{t}</button>)}
        </div>
      </section>

      {tab==='OVERVIEW' && <section className="panel">
        <div className="eyebrow">START HERE</div>
        <h2 style={{margin:'6px 0 4px'}}>Tell us about the event.</h2>
        <p className="hint">We only ask the questions that matter for the event type you selected.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:12,marginTop:16}}>
          {[
            ['primaryContact','Primary contact'],['phone','Contact phone'],['email','Contact email'],['venue','Venue'],['address','Location / directions'],['eventDate','Event date'],['ceremonyTime','Ceremony time'],['receptionTime','Reception start'],['endTime','Reception end']
          ].map(([k,l])=><div className="field" key={k}><label>{l}</label><input className="input" value={details[k]} onChange={e=>setDetail(k,e.target.value)} placeholder={l}/></div>)}
        </div>
        {eventType==='Wedding' && <div className="panel" style={{marginTop:16,background:'rgba(255,255,255,.025)'}}>
          <div className="eyebrow">WEDDING CONTACTS</div>
          <p className="hint">The original DJ planning form collected key family contacts and identified one primary person who knows the couple's wishes.</p>
          <textarea className="input" rows="5" value={timeline} onChange={e=>setTimeline(e.target.value)} placeholder="Bride / Groom / parents / coordinator names and phone numbers…" />
        </div>}
        <div className="panel" style={{marginTop:16,background:'rgba(255,255,255,.025)'}}>
          <div className="eyebrow">STARTING PLAYLIST</div>
          <h3 style={{margin:'5px 0'}}>Already have a Spotify playlist?</h3>
          <p className="hint">Paste the playlist link here. It can become the couple's starting point while SI DJ checks the songs against the DJ's actual library.</p>
          <input className="input" value={spotifyUrl} onChange={e=>setSpotifyUrl(e.target.value)} placeholder="Paste Spotify playlist link…" />
          {spotifyUrl && <p className="hint" style={{fontSize:11,marginBottom:0}}>Playlist linked to this event. Later, SI DJ can reconcile it against the available DJ files and flag anything missing.</p>}
        </div>
        <div className="field" style={{marginTop:16}}><label>Anything the DJ should know?</label><textarea className="input" rows="4" value={details.specialNotes} onChange={e=>setDetail('specialNotes',e.target.value)} placeholder="Accessibility, venue restrictions, family dynamics, cultural details, surprises, etc." /></div>
      </section>}

      {tab==='WEDDING FLOW' && eventType==='Wedding' && <section className="panel">
        <div className="eyebrow">WEDDING FLOW</div>
        <h2 style={{margin:'6px 0'}}>Plan the moments, not a spreadsheet.</h2>
        <p className="hint">The planning form calls for an order of reception events while leaving exact timing flexible for the DJ.</p>
        <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(280px,420px)',gap:16,marginTop:16}}>
          <div style={{display:'grid',gap:7}}>
            {moments.map((m,i)=><button key={m.item} onClick={()=>{setActive(m.item);setTab('MUSIC')}} style={{textAlign:'left',padding:13,borderRadius:10,border:active===m.item?'1px solid var(--accent)':'1px solid rgba(255,255,255,.08)',background:active===m.item?'rgba(255,255,255,.07)':'rgba(255,255,255,.02)',color:'var(--fg)',cursor:'pointer'}}>
              <small style={{opacity:.55,fontWeight:800}}>{m.group}</small><strong style={{display:'block',marginTop:3}}>{i+1}. {m.item}</strong><span style={{fontSize:12,opacity:.6}}>{(selections[m.item]||[]).length} library picks</span>
            </button>)}
          </div>
          <div>
            <div className="panel" style={{background:'rgba(255,255,255,.025)'}}>
              <div className="eyebrow">VENUE / PRODUCTION</div>
              {[
                ['receptionRoom','Reception room'],['djLocation','DJ setup location'],['cocktailLocation','Cocktail location'],['exitLocation','Exit location']
              ].map(([k,l])=><div className="field" key={k} style={{marginTop:10}}><label>{l}</label><input className="input" value={details[k]} onChange={e=>setDetail(k,e.target.value)} /></div>)}
              <label style={{display:'flex',gap:8,alignItems:'center',marginTop:12}}><input type="checkbox" checked={details.extraSpeakers} onChange={e=>setDetail('extraSpeakers',e.target.checked)}/> Extra speakers needed</label>
              <label style={{display:'flex',gap:8,alignItems:'center',marginTop:8}}><input type="checkbox" checked={details.cocktailSpeaker} onChange={e=>setDetail('cocktailSpeaker',e.target.checked)}/> Separate cocktail speaker</label>
            </div>
            <div className="panel" style={{marginTop:12,background:'rgba(255,255,255,.025)'}}>
              <div className="eyebrow">CEREMONY</div>
              <label style={{display:'flex',gap:8,alignItems:'center',marginTop:8}}><input type="checkbox" checked={details.ceremonyMusic} onChange={e=>setDetail('ceremonyMusic',e.target.checked)}/> DJ provides ceremony music</label>
              <label style={{display:'flex',gap:8,alignItems:'center',marginTop:8}}><input type="checkbox" checked={details.ceremonyMics} onChange={e=>setDetail('ceremonyMics',e.target.checked)}/> DJ provides ceremony microphones</label>
              <div className="field" style={{marginTop:10}}><label>Pre-ceremony music</label><input className="input" value={details.preCeremonyMusic} onChange={e=>setDetail('preCeremonyMusic',e.target.value)} /></div>
              <div className="field" style={{marginTop:10}}><label>Vows: reading or repeating officiant?</label><input className="input" value={details.vows} onChange={e=>setDetail('vows',e.target.value)} /></div>
              <div className="field" style={{marginTop:10}}><label>Reader / microphone side</label><input className="input" value={details.reader+' '+details.readerSide} onChange={e=>setDetail('reader',e.target.value)} /></div>
              <div className="field" style={{marginTop:10}}><label>Unity / candle / sand ceremony song</label><input className="input" value={details.specialCeremonySong} onChange={e=>setDetail('specialCeremonySong',e.target.value)} /></div>
            </div>
          </div>
        </div>
        <div className="panel" style={{marginTop:16,background:'rgba(255,255,255,.025)'}}>
          <div className="eyebrow">RECEPTION DETAILS</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:12}}>
            <div className="field"><label>Dinner service</label><select className="input" value={details.dinnerStyle} onChange={e=>setDetail('dinnerStyle',e.target.value)}><option value="">Select…</option><option>Served</option><option>Buffet</option><option>Stations</option></select></div>
            <div className="field"><label>First course / dinner note</label><input className="input" value={details.firstCourse} onChange={e=>setDetail('firstCourse',e.target.value)} /></div>
            <div className="field"><label>Toast / speech participants</label><input className="input" value={details.toastPeople} onChange={e=>setDetail('toastPeople',e.target.value)} /></div>
            <div className="field"><label>Cake vendor</label><input className="input" value={details.cakeVendor} onChange={e=>setDetail('cakeVendor',e.target.value)} /></div>
            <div className="field"><label>Exit coordinator</label><input className="input" value={details.exitPerson} onChange={e=>setDetail('exitPerson',e.target.value)} /></div>
          </div>
          <div className="field" style={{marginTop:10}}><label>Bridal party names / pronunciation notes</label><textarea className="input" rows="4" value={bridalParty} onChange={e=>setBridalParty(e.target.value)} placeholder="Enter names exactly as they should be announced." /></div>
        </div>
      </section>}

      {tab==='MUSIC' && <div style={{display:'grid',gridTemplateColumns:'minmax(220px,280px) minmax(0,1fr) minmax(280px,390px)',gap:16,alignItems:'start'}}>
        <aside className="panel" style={{position:'sticky',top:12}}>
          <div className="eyebrow">MUSIC MOMENTS</div>
          {eventType==='Wedding' && <p className="hint" style={{fontSize:12}}>Choose a moment, then curate it from the DJ's actual library.</p>}
          <div style={{display:'grid',gap:5,marginTop:10}}>
            {moments.map(s=><button key={s.item} onClick={()=>setActive(s.item)} style={{textAlign:'left',padding:'9px 10px',borderRadius:9,border:active===s.item?'1px solid var(--accent)':'1px solid rgba(255,255,255,.08)',background:active===s.item?'rgba(255,255,255,.08)':'transparent',color:'var(--fg)',cursor:'pointer'}}><small style={{display:'block',opacity:.5,fontWeight:800}}>{s.group}</small><strong>{s.item}</strong><span style={{float:'right',opacity:.6}}>{(selections[s.item]||[]).length}</span></button>)}
          </div>
        </aside>
        <main className="panel">
          <div className="shead"><div><div className="eyebrow">{activeMoment?.group}</div><h2 style={{margin:'5px 0'}}>Music for {active}</h2><p className="hint">Pick from the DJ's library. No more sending a list of songs that may not actually exist on the DJ's drive.</p></div><span className="ai-pill">{selected.length} SELECTED</span></div>
          <div className="field" style={{marginTop:14}}><input className="input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search song or artist…" /></div>
          <div style={{display:'grid',gap:7,maxHeight:620,overflowY:'auto',marginTop:12}}>
            {filtered.map(s=>{const picked=selected.some(x=>key(x)===key(s));return <div key={key(s)} style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:10,alignItems:'center',padding:'11px 12px',border:'1px solid '+(picked?'rgba(233,187,95,.45)':'rgba(255,255,255,.08)'),borderRadius:10,background:picked?'rgba(233,187,95,.08)':'rgba(255,255,255,.02)'}}><div><b>{s.title}</b><span style={{display:'block'}}>{s.artist}</span><small>{s.genre} · {s.era}{s.bpm?' · '+s.bpm+' BPM':''}</small></div><button className={picked?'btn btn-ghost btn-sm':'btn btn-gold btn-sm'} onClick={()=>picked?removeSong(s):addSong(s)}>{picked?'Remove':'Add'}</button></div>})}
          </div>
        </main>
        <aside>
          <section className="panel"><div className="eyebrow">THIS MOMENT</div><h2 style={{margin:'5px 0'}}>Your picks</h2><div style={{display:'grid',gap:7}}>{selected.map((s,i)=><div key={key(s)} style={{padding:'10px 11px',border:'1px solid rgba(255,255,255,.08)',borderRadius:9}}><strong>{i+1}. {s.title}</strong><span style={{display:'block',fontSize:12,opacity:.7}}>{s.artist}</span></div>)}{!selected.length&&<p className="hint">Nothing selected yet.</p>}</div><div className="field" style={{marginTop:12}}><label>Notes</label><textarea className="input" rows="4" value={notes[active]||''} onChange={e=>setNotes(x=>({...x,[active]:e.target.value}))} placeholder="Whole song, edited version, special cue, or DJ note." /></div></section>
          {eventType==='Wedding' && <section className="panel" style={{marginTop:12}}><div className="eyebrow">SPECIAL SONGS</div><p className="hint">The original planning form specifically called out grand entrance, bridal-party entrance, first dance and parent dances.</p>{Object.keys(specialSongs).map(k=><div className="field" key={k} style={{marginTop:9}}><label>{k}</label><input className="input" value={specialSongs[k]} onChange={e=>setSpecialSongs(x=>({...x,[k]:e.target.value}))} placeholder="Song — Artist" /></div>)}</section>}
        </aside>
      </div>}

      {tab==='PREFERENCES' && <section className="panel">
        <div className="eyebrow">MUSIC DNA</div><h2 style={{margin:'6px 0'}}>Tell the DJ what you like — and what you don't.</h2>
        <p className="hint">The old form used explicit like/dislike choices for music styles and artists. This keeps that information but makes it much faster to complete.</p>
        <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(280px,420px)',gap:16,marginTop:16}}>
          <div><div className="eyebrow">MUSIC STYLES</div><div style={{display:'flex',flexWrap:'wrap',gap:7,marginTop:10}}>{WEDDING_STYLES.map(s=><button key={s} onClick={()=>toggleStyle(s)} className={styles[s]==='like'?'btn btn-gold btn-sm':styles[s]==='dislike'?'btn btn-ghost btn-sm':'btn btn-ghost btn-sm'} style={styles[s]==='dislike'?{borderColor:'rgba(255,90,90,.5)',textDecoration:'line-through'}:{}}>{s}</button>)}</div><p className="hint" style={{fontSize:11,marginTop:10}}>Tap once = like · twice = dislike · third = clear.</p></div>
          <div><div className="eyebrow">ARTISTS / GROUPS</div><textarea className="input" rows="8" value={artists} onChange={e=>setArtists(e.target.value)} placeholder="Artists you love or dislike — one per line, optionally add LIKE or DISLIKE." /></div>
        </div>
        <div className="panel" style={{marginTop:18,background:'rgba(255,255,255,.025)'}}><div className="eyebrow">DJ / MC PREFERENCES</div><p className="hint">Set the behavior you want from the DJ during the event.</p><div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,marginTop:10}}>{BEHAVIORS.map(s=><button key={s} onClick={()=>toggleBehavior(s)} style={{textAlign:'left',padding:11,borderRadius:9,border:behavior[s]==='do'?'1px solid var(--accent)':behavior[s]==='dont'?'1px solid rgba(255,90,90,.5)':'1px solid rgba(255,255,255,.08)',background:behavior[s]==='do'?'rgba(233,187,95,.08)':behavior[s]==='dont'?'rgba(255,90,90,.06)':'transparent',color:'var(--fg)'}}><strong>{behavior[s]==='do'?'DO · ':behavior[s]==='dont'?'DON’T · ':''}</strong>{s}</button>)}</div></div>
      </section>}

      {tab==='COLLABORATE' && <section className="panel">
        <div className="eyebrow">COLLABORATIVE CURATION</div><h2 style={{margin:'6px 0'}}>Let the right people help build the music.</h2>
        <p className="hint">This is the foundation for the hosted event link: the host will eventually invite family, bridal party or other collaborators to contribute from their phones.</p>
        <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(260px,360px)',gap:16,marginTop:16}}>
          <div><div className="field"><label>Suggestion for {active}</label><input className="input" value={idea} onChange={e=>setIdea(e.target.value)} placeholder="Artist — Song" onKeyDown={e=>e.key==='Enter'&&addIdea()} /></div><button className="btn btn-gold" onClick={addIdea}>Add suggestion</button><div style={{display:'grid',gap:7,marginTop:12}}>{guestIdeas.map((x,i)=><div key={i} style={{padding:'11px 12px',border:'1px solid rgba(255,255,255,.08)',borderRadius:9}}><b>{x.text}</b><small style={{display:'block',opacity:.6}}>{x.section} · {x.from}</small></div>)}{!guestIdeas.length&&<p className="hint">No suggestions yet.</p>}</div></div>
          <div className="panel" style={{background:'rgba(255,255,255,.025)'}}><div className="eyebrow">WHAT THE DJ GETS</div><p className="hint">One event plan containing the timeline, special songs, must-play and do-not-play lists, style preferences, family input, operational notes{spotifyUrl ? ' and a linked Spotify starting playlist.' : '.'}</p><button className="btn btn-gold btn-block" onClick={save}>{saved?'Plan Saved ✓':'Save Event Plan'}</button><p className="hint" style={{fontSize:11}}>Hosted invitations, permissions and a shareable event URL are the next persistence layer.</p></div>
        </div>
      </section>}
    </div>
  </div>;
}
