import fs from 'node:fs/promises';
import path from 'node:path';

const BILLBOARD_URL = 'https://raw.githubusercontent.com/mhollingshead/billboard-hot-100/main/all.json';
const T3R_URL = 'https://www.texasregionalradio.com/Top100.asp';
const TIRC_URL = 'https://tirc.online/charts/tirc';
const OUT = path.resolve('data/si-dj-knowledge.json');
const AUDIO_URL = 'https://raw.githubusercontent.com/rfordatascience/tidytuesday/main/data/2021/2021-09-14/audio_features.csv';

const norm = (v) => String(v || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const key = (artist,title) => norm(artist)+'\\u0000'+norm(title);

function clean(v){ return String(v||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').replace(/\\s+/g,' ').trim(); }
function cells(row){ return [...row.matchAll(/<t[dh][^>]*>([\\s\\S]*?)<\\/t[dh]>/gi)].map(m=>clean(m[1])); }
function parseTables(html){
  return [...String(html||'').matchAll(/<tr[^>]*>([\\s\\S]*?)<\\/tr>/gi)].map(m=>cells(m[1])).filter(r=>r.length>=4);
}
function era(year){
  const y=Number(year||0);
  if(y>=2020)return '2020s'; if(y>=2010)return '2010s'; if(y>=2000)return '2000s'; if(y>=1990)return '90s'; if(y>=1980)return '80s'; if(y>=1970)return '70s'; return 'CLASSICS';
}

function parseCsv(text){
  const rows=[]; let row=[], field='', quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"' && text[i+1]==='"'){field+='"';i++;continue;}
      if(ch==='"'){quoted=false;continue;}
      field+=ch;
    }else{
      if(ch==='"'){quoted=true;continue;}
      if(ch===','){row.push(field);field='';continue;}
      if(ch==='\\n'){row.push(field);rows.push(row);row=[];field='';continue;}
      if(ch==='\\r') continue;
      field+=ch;
    }
  }
  if(field.length || row.length){row.push(field);rows.push(row);}
  return rows;
}

async function get(url){
  const r=await fetch(url,{headers:{'User-Agent':'DJRequestLive-SIDJ-Knowledge/1.0'}});
  if(!r.ok) throw new Error(url+' -> '+r.status);
  return r.text();
}

const map = new Map();
function ensure(artist,title){
  if(!artist || !title) return null;
  const k=key(artist,title);
  let s=map.get(k);
  if(!s){ s={artist:artist.trim(),title:title.trim(),first_year:0,last_year:0,billboard_appearances:0,billboard_peak:999,billboard_weeks:0,billboard_score:0,texas_t3r_rank:0,texas_t3r_spins:0,tirc_rank:0,tirc_spins:0,texas_score:0,popularity:0,genre:'',era:'',tags:'',source:'SI DJ GLOBAL'}; map.set(k,s); }
  return s;
}

console.log('SI DJ knowledge: downloading Billboard Hot 100 history…');
const billboard = JSON.parse(await get(BILLBOARD_URL));
for(const chart of Array.isArray(billboard)?billboard:[]){
  const year=Number(String(chart.date||'').slice(0,4));
  for(const r of (chart.data||[])){
    const s=ensure(r.artist,r.song); if(!s) continue;
    s.billboard_appearances++;
    s.billboard_peak=Math.min(s.billboard_peak,Number(r.peak_position)||999);
    s.billboard_weeks=Math.max(s.billboard_weeks,Number(r.weeks_on_chart)||0);
    s.billboard_score += Math.max(0,101-(Number(r.this_week)||101));
    s.popularity += Math.max(0,101-(Number(r.this_week)||101))*0.35;
    if(year){s.first_year=s.first_year?Math.min(s.first_year,year):year;s.last_year=Math.max(s.last_year,year);}
  }
}

async function addTexas(url, source){
  try{
    const html=await get(url);
    const rows=parseTables(html);
    let count=0;
    for(const r of rows){
      const joined=r.join(' | ');
      if(source==='t3r'){
        const rank=Number(r[2]); const artist=r[r.length-1]; const title=String(r[0]||'').split('/')[0].trim();
        const spins=Number(String(r[r.length-3]||'').replace(/,/g,''))||0;
        if(rank>=1 && rank<=115 && artist && title && !/title|artist/i.test(joined)){
          const s=ensure(artist,title); if(s){s.texas_t3r_rank=rank;s.texas_t3r_spins=spins;s.texas_score+=Math.max(0,116-rank)*2+spins*0.03;count++;}
        }
      } else {
        const rank=Number(r[0]); const title=String(r[1]||'').replace(/\\s*TIRC\\s*\\d+$/,'').trim(); const artist=r[2]; const spins=Number(r[3])||0;
        if(rank>=1 && rank<=75 && title && artist && !/song|artist/i.test(joined)){
          const s=ensure(artist,title); if(s){s.tirc_rank=rank;s.tirc_spins=spins;s.texas_score+=Math.max(0,76-rank)*2+spins*0.5;count++;}
        }
      }
    }
    console.log(source,'rows:',count);
  }catch(e){ console.warn('Texas source unavailable:',source,e.message); }
}

console.log('SI DJ knowledge: enriching with Billboard/Spotify audio features…');
try{
  const csv=await get(AUDIO_URL);
  const rows=parseCsv(csv);
  const header=rows.shift();
  const idx=Object.fromEntries(header.map((h,i)=>[h,i]));
  let enriched=0;
  for(const r of rows){
    const artist=r[idx.performer], title=r[idx.song];
    const s=map.get(key(artist,title));
    if(!s) continue;
    const n=(name)=>Number(r[idx[name]]);
    s.bpm=Number.isFinite(n('tempo')) ? n('tempo') : 0;
    s.key=Number.isFinite(n('key')) ? n('key') : null;
    s.mode=Number.isFinite(n('mode')) ? n('mode') : null;
    s.danceability=Number.isFinite(n('danceability')) ? n('danceability') : null;
    s.audio_energy=Number.isFinite(n('energy')) ? n('energy') : null;
    s.valence=Number.isFinite(n('valence')) ? n('valence') : null;
    s.explicit=String(r[idx.spotify_track_explicit]||'').toLowerCase()==='true';
    s.audio_popularity=Number.isFinite(n('spotify_track_popularity')) ? n('spotify_track_popularity') : 0;
    s.audio_genre=r[idx.spotify_genre] || '';
    s.audio_album=r[idx.spotify_track_album] || '';
    s.duration_ms=Number.isFinite(n('spotify_track_duration_ms')) ? n('spotify_track_duration_ms') : 0;
    if(s.audio_genre) enriched++;
  }
  console.log('audio feature matches:',enriched);
}catch(e){ console.warn('Audio feature source unavailable:',e.message); }

console.log('SI DJ knowledge: refreshing Texas regional + internet-radio signals…');
await addTexas(T3R_URL,'t3r');
await addTexas(TIRC_URL,'tirc');

const artistGenre = new Map([
  ['morgan wallen','Country'],['ella langley','Country'],['luke combs','Country'],['chris stapleton','Country'],
  ['george strait','Country'],['cody johnson','Texas Country'],['randy rogers band','Texas Country'],['stoney larue','Texas Country'],
  ['turnpike troubadours','Red Dirt'],['flatland cavalry','Texas Country'],['shane smith and the saints','Texas Country'],
  ['wade bowen','Texas Country'],['josh abbott band','Texas Country'],['william clark green','Texas Country'],['cody jinks','Texas Country'],
  ['aaron watson','Texas Country'],['kevin fowler','Texas Country'],['pat green','Texas Country'],['charlie robison','Texas Country'],
  ['kacey musgraves','Country'],['zach bryan','Country'],['shaboozey','Country'],['jelly roll','Country'],
  ['taylor swift','Pop'],['bruno mars','Pop'],['dua lipa','Pop'],['ariana grande','Pop'],['olivia rodrigo','Pop'],
  ['beyonce','R&B'],['usher','R&B'],['drake','Hip-Hop'],['kendrick lamar','Hip-Hop'],['travis scott','Hip-Hop'],
  ['post malone','Hip-Hop'],['cardi b','Hip-Hop'],['eminem','Hip-Hop'],['snoop dogg','Hip-Hop'],
  ['calvin harris','Dance / EDM'],['david guetta','Dance / EDM'],['avicii','Dance / EDM'],['rihanna','R&B'],['the weeknd','R&B'],
  ['selena','Tejano'],['ram herrera','Tejano']
]);

for(const s of map.values()){
  const a=norm(s.artist);
  const texas=s.texas_score>0;
  const audioGenre=norm(s.audio_genre||'');
  s.genre=artistGenre.get(a) || (texas ? 'Texas Country' : audioGenre.includes('country') ? 'Country' : audioGenre.includes('hip hop') || audioGenre.includes('rap') ? 'Hip-Hop' : audioGenre.includes('r&b') ? 'R&B' : audioGenre.includes('rock') ? 'Rock' : audioGenre.includes('edm') || audioGenre.includes('electronic') ? 'Dance / EDM' : (/dance|edm|house|club/.test(norm(s.title))?'Dance / EDM':'Pop'));
  s.era=era(s.first_year || s.last_year);
  const tags=new Set();
  const g=String(s.genre).toLowerCase();
  if(g.includes('country')) tags.add('country');
  if(g.includes('texas')) tags.add('texascountry');
  if(g.includes('red dirt')) tags.add('reddirt');
  if(g.includes('hip')) tags.add('hiphop');
  if(g.includes('r&b')) tags.add('rnb');
  if(g.includes('dance')||g.includes('edm')) tags.add('dance');
  if(s.billboard_peak<=10) tags.add('top10');
  if(s.billboard_peak===1) tags.add('number1');
  if(s.billboard_weeks>=20) tags.add('longrun');
  if(s.texas_t3r_rank>0) tags.add('texasregional');
  if(s.tirc_rank>0) tags.add('texasinternet');
  if((s.last_year||0)>=new Date().getFullYear()-2) tags.add('current');
  s.tags=[...tags].join(',');
  s.energy = Number.isFinite(Number(s.audio_energy)) ? Math.round(Number(s.audio_energy)*10) : (s.genre==='Dance / EDM'?9:7);
  s.dancefloor = Number.isFinite(Number(s.danceability)) ? Math.round(Number(s.danceability)*10) : (s.genre==='Dance / EDM'?10:7);
  s.singalong = Math.max(1, Math.min(10, Math.round((Number(s.valence)||0.6)*8 + (s.billboard_peak<=20?2:0))));
  s.crossgen = s.billboard_peak<=10 ? 9 : s.billboard_weeks>=20 ? 8 : 6;
  s.popularity=Math.round((s.popularity + s.texas_score + (Number(s.audio_popularity)||0)*0.5)*100)/100;
  s.billboard_score=Math.round(s.billboard_score*100)/100;
  s.texas_score=Math.round(s.texas_score*100)/100;
}

const tracks=[...map.values()]
  .filter(s=>s.artist && s.title)
  .sort((a,b)=>b.popularity-a.popularity);

await fs.mkdir(path.dirname(OUT),{recursive:true});
await fs.writeFile(OUT,JSON.stringify({
  version:1,
  generated_at:new Date().toISOString(),
  sources:{
    billboard_hot_100:{url:BILLBOARD_URL,coverage:'1958-present',kind:'historical_chart_signal'},
    billboard_spotify_audio_features:{url:AUDIO_URL,coverage:'through 2021',kind:'audio_features_and_genre'},
    texas_regional_radio_report:{url:T3R_URL,coverage:'current_public_chart',kind:'texas_radio_signal'},
    texas_internet_radio_chart:{url:TIRC_URL,coverage:'current_public_chart',kind:'texas_internet_radio_signal'}
  },
  methodology:'Aggregated chart signals for recommendation ranking. The source charts remain the authoritative sources; SI DJ stores normalized music identity and derived ranking signals rather than reproducing chart presentation.',
  tracks
},null,2));
console.log('SI DJ knowledge complete:',tracks.length,'tracks ->',OUT);
