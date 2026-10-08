import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(HERE, '..', 'data', 'si-dj-knowledge.json');

const norm = (v) => String(v || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const keyOf = (artist, title) => norm(artist) + '\\u0000' + norm(title);

const ERA = (year) => {
  const y = Number(year || 0);
  if (y >= 2020) return '2020s';
  if (y >= 2010) return '2010s';
  if (y >= 2000) return '2000s';
  if (y >= 1990) return '90s';
  if (y >= 1980) return '80s';
  if (y >= 1970) return '70s';
  return 'CLASSICS';
};

const ARTIST_GENRES = new Map([
  ['morgan wallen','Country'],['ella langley','Country'],['luke combs','Country'],['chris stapleton','Country'],
  ['george strait','Country'],['cody johnson','Texas Country'],['randy rogers band','Texas Country'],
  ['stoney larue','Texas Country'],['turnpike troubadours','Red Dirt'],['flatland cavalry','Texas Country'],
  ['shane smith and the saints','Texas Country'],['wade bowen','Texas Country'],['josh abbott band','Texas Country'],
  ['william clark green','Texas Country'],['cody jinks','Texas Country'],['aaron watson','Texas Country'],
  ['kevin fowler','Texas Country'],['pat green','Texas Country'],['charlie robison','Texas Country'],
  ['kacey musgraves','Country'],['zach bryan','Country'],['shaboozey','Country'],['jelly roll','Country'],
  ['taylor swift','Pop'],['bruno mars','Pop'],['dua lipa','Pop'],['ariana grande','Pop'],
  ['olivia rodrigo','Pop'],['lady gaga','Pop'],['beyonce','R&B'],['usher','R&B'],
  ['drake','Hip-Hop'],['kendrick lamar','Hip-Hop'],['travis scott','Hip-Hop'],['post malone','Hip-Hop'],
  ['cardi b','Hip-Hop'],['50 cent','Hip-Hop'],['eminem','Hip-Hop'],['snoop dogg','Hip-Hop'],
  ['calvin harris','Dance / EDM'],['david guetta','Dance / EDM'],['avicii','Dance / EDM'],
  ['rihanna','R&B'],['the weeknd','R&B'],['usher','R&B'],['mary j blige','R&B'],
  ['selena','Tejano'],['ram herrera','Tejano'],['texas tornado','Tejano']
]);

const TAGS_BY_GENRE = {
  'Country':'country,crossover',
  'Texas Country':'country,texascountry,texas,regional',
  'Red Dirt':'country,reddirt,texas,regional',
  'Pop':'pop,crossover',
  'Hip-Hop':'hiphop,rap,crossover',
  'R&B':'rnb,soul,crossover',
  'Rock':'rock',
  'Dance / EDM':'dance,edm',
  'Latin':'latin,crossover',
  'Tejano':'tejano,texas,latin',
};

function fallbackGenre(artist, title, texas = false) {
  const a = norm(artist);
  const t = norm(title);
  if (texas) return /tex mex|tejano|conjunto|norteno|ram herrera|texas high road/.test(a + ' ' + t) ? 'Tejano' : 'Texas Country';
  if (ARTIST_GENRES.has(a)) return ARTIST_GENRES.get(a);
  if (/remix|club|dance|house|edm|disco/.test(t)) return 'Dance / EDM';
  if (/rap|hip hop|freestyle/.test(t)) return 'Hip-Hop';
  return 'Pop';
}

function enrichRow(row) {
  const texas = Number(row.texas_t3r_rank || 0) > 0 || Number(row.tirc_rank || 0) > 0;
  const genre = row.genre || fallbackGenre(row.artist, row.title, texas);
  const year = Number(row.first_year || 0);
  const tags = new Set(String(row.tags || '').split(',').map(s => s.trim()).filter(Boolean));
  for (const t of String(TAGS_BY_GENRE[genre] || '').split(',')) if (t) tags.add(t);
  if (Number(row.billboard_peak || 999) <= 10) tags.add('top10');
  if (Number(row.billboard_peak || 999) === 1) tags.add('number1');
  if (Number(row.billboard_weeks || 0) >= 20) tags.add('longrun');
  if (Number(row.texas_t3r_rank || 999) <= 25) tags.add('texascurrent');
  if (Number(row.tirc_rank || 999) <= 25) tags.add('texasinternet');
  if (year >= new Date().getFullYear() - 2) tags.add('current');
  return {
    ...row,
    genre,
    era: row.era || ERA(year),
    tags: [...tags].join(','),
    popularity: Number(row.popularity || 0),
    energy: Number(row.energy || (genre === 'Dance / EDM' ? 9 : genre === 'Hip-Hop' ? 8 : 7)),
    dancefloor: Number(row.dancefloor || (genre === 'Dance / EDM' ? 10 : 7)),
    singalong: Number(row.singalong || 6),
    crossgen: Number(row.crossgen || (Number(row.billboard_peak || 999) <= 10 ? 9 : 6)),
    content: row.content || 'Unknown',
    source: row.source || 'SI DJ GLOBAL',
  };
}

async function remoteBootstrap(){
  const out = new Map();
  const add = (artist,title,patch={}) => {
    if(!artist || !title) return;
    const k=keyOf(artist,title);
    const current=out.get(k) || {artist,title,first_year:0,last_year:0,billboard_appearances:0,billboard_peak:999,billboard_weeks:0,billboard_score:0,texas_t3r_rank:0,texas_t3r_spins:0,tirc_rank:0,tirc_spins:0,texas_score:0,popularity:0,genre:'',tags:'',source:'SI DJ GLOBAL'};
    Object.assign(current,patch);
    out.set(k,current);
  };
  try{
    const r=await fetch('https://raw.githubusercontent.com/mhollingshead/billboard-hot-100/main/recent.json',{headers:{'User-Agent':'DJRequestLive-SIDJ/1.0'}});
    if(r.ok){
      const chart=await r.json();
      for(const x of chart.data||[]){
        const rank=Number(x.this_week)||101;
        add(x.artist,x.song,{last_year:Number(String(chart.date||'').slice(0,4)),billboard_appearances:1,billboard_peak:Number(x.peak_position)||999,billboard_weeks:Number(x.weeks_on_chart)||0,billboard_score:Math.max(0,101-rank),popularity:Math.max(0,101-rank)*2});
      }
    }
  }catch{}
  for(const [url,type] of [
    ['https://www.texasregionalradio.com/Top100.asp','t3r'],
    ['https://tirc.online/charts/tirc','tirc']
  ]){
    try{
      const r=await fetch(url,{headers:{'User-Agent':'DJRequestLive-SIDJ/1.0'}});
      if(!r.ok) continue;
      const html=await r.text();
      const rows=[...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>String(x[1]).replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim())).filter(x=>x.length>=4);
      for(const row of rows){
        if(type==='t3r'){
          const rank=Number(row[2]); const artist=row[row.length-1]; const title=String(row[0]||'').split('/')[0].trim(); const spins=Number(String(row[row.length-3]||'').replace(/,/g,''))||0;
          if(rank>=1&&rank<=115&&artist&&title) add(artist,title,{texas_t3r_rank:rank,texas_t3r_spins:spins,texas_score:Math.max(0,116-rank)*2+spins*.03});
        }else{
          const rank=Number(row[0]); const title=String(row[1]||'').replace(/\s*TIRC\s*\d+$/,'').trim(); const artist=row[2]; const spins=Number(row[3])||0;
          if(rank>=1&&rank<=75&&artist&&title) add(artist,title,{tirc_rank:rank,tirc_spins:spins,texas_score:Math.max(0,76-rank)*2+spins*.5});
        }
      }
    }catch{}
  }
  const tracks=[...out.values()].map(enrichRow);
  return {version:1,generated_at:new Date().toISOString(),sources:{runtime:'Billboard recent + Texas Regional Radio Report + Texas Internet Radio Chart'},tracks};
}

let cache = null;
let remotePromise = null;
export function loadSiDjKnowledge() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const tracks = Array.isArray(parsed.tracks) ? parsed.tracks.map(enrichRow) : [];
    cache = { version: parsed.version || 1, generated_at: parsed.generated_at || null, sources: parsed.sources || {}, tracks };
  } catch {
    cache = { version: 0, generated_at: null, sources: {}, tracks: [] };
  }
  return cache;
}

export function searchSiDjKnowledge({ q = '', artist = '', genre = '', era = '', limit = 100 } = {}) {
  const data = loadSiDjKnowledge();
  const nq = norm(q);
  const na = norm(artist);
  const ng = norm(genre);
  const ne = String(era || '').toUpperCase();
  const rows = data.tracks.filter(s => {
    const hay = norm([s.artist, s.title, s.genre, s.tags, s.source].join(' '));
    if (nq && !hay.includes(nq)) return false;
    if (na && !norm(s.artist).includes(na)) return false;
    if (ng && !norm(s.genre).includes(ng) && !norm(s.tags).includes(ng)) return false;
    if (ne && ne !== 'ALL' && String(s.era).toUpperCase() !== ne && !(ne === 'CURRENT' && String(s.tags).includes('current'))) return false;
    return true;
  });
  rows.sort((a,b) =>
    Number(b.popularity || 0) - Number(a.popularity || 0) ||
    Number(b.billboard_score || 0) - Number(a.billboard_score || 0) ||
    Number(b.texas_score || 0) - Number(a.texas_score || 0)
  );
  return rows.slice(0, Math.min(Math.max(Number(limit) || 100, 1), 500));
}

export function enrichTracksWithKnowledge(tracks) {
  const data = loadSiDjKnowledge();
  if (!data.tracks.length) return tracks;
  const index = new Map(data.tracks.map(s => [keyOf(s.artist, s.title), s]));
  return (Array.isArray(tracks) ? tracks : []).map(t => {
    const k = keyOf(t.artist, t.title);
    const g = index.get(k);
    if (!g) return { ...t, knowledge_match: false };
    return {
      ...g,
      ...t,
      genre: t.genre || g.genre,
      era: t.era || g.era,
      tags: [g.tags, t.tags].filter(Boolean).join(','),
      knowledge_match: true,
      billboard_score: g.billboard_score,
      texas_score: g.texas_score,
      popularity: g.popularity,
    };
  });
}

export async function ensureSiDjKnowledge() {
  const local=loadSiDjKnowledge();
  if(local.tracks.length) return local;
  if(!remotePromise){
    remotePromise=remoteBootstrap().then(data=>{cache=data;return data;}).catch(()=>local).finally(()=>{remotePromise=null;});
  }
  return remotePromise;
}

export function siDjKnowledgeSummary() {
  const d = loadSiDjKnowledge();
  return {
    version: d.version,
    generated_at: d.generated_at,
    track_count: d.tracks.length,
    sources: d.sources,
  };
}
