import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { searchSiDjKnowledge } from '../lib/siDjKnowledge.js';
import { newToken, tokenHash } from '../server/security.js';

const key = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

test('SI DJ recommendations learn from only this DJ’s library, event plays, and guest requests', async t => {
  process.env.DB_DRIVER = 'sqlite';
  delete process.env.SQLITE_FILE;
  const db = await createDb();
  const handle = createApp(db);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!await handle(req, res, url)) { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const originalFetch = globalThis.fetch;
  const candidate = searchSiDjKnowledge({ limit: 1 })[0];
  assert.ok(candidate, 'offline SI DJ knowledge fixture is available');
  t.after(async () => { globalThis.fetch = originalFetch; await new Promise(resolve => server.close(resolve)); await db.close(); });

  const djs = [];
  for (const [email, slug] of [['one@example.test', 'dj-one'], ['two@example.test', 'dj-two']]) {
    const user = await db.run(`INSERT INTO users (email,password_hash,dj_name,slug,tagline,genres,min_tip,pay_json,design_json,photos_json,is_live,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [email,'x',slug,slug,'','',0,'{}','{}','[]',1,Date.now()]);
    const token = newToken();
    await db.run('INSERT INTO sessions (user_id,token_hash,expires_at) VALUES (?,?,?)', [user.insertId, tokenHash(token), Date.now() + 60000]);
    djs.push({ id: user.insertId, token });
  }
  for (const dj of djs) {
    const scan = await db.run('INSERT INTO library_scans (user_id,track_count,created_at) VALUES (?,?,?)', [dj.id,1,Date.now()]);
    await db.run(`INSERT INTO library_tracks
      (user_id,scan_id,artist,title,file_path,artist_key,title_key,path_hash)
      VALUES (?,?,?,?,?,?,?,?)`, [dj.id,scan.insertId,candidate.artist,candidate.title,'/private/'+dj.id+'.mp3',key(candidate.artist),key(candidate.title),'path-'+dj.id]);
  }

  async function recordPlays(dj, count) {
    for (let i = 0; i < count; i++) {
      const response = await originalFetch(`${origin}/api/si-dj/plays`, {
        method: 'POST', headers: { Cookie: `rl_session=${dj.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_key: `${String(dj.id).padStart(3, '0')}${String(i).padStart(61, '0')}`, artist: candidate.artist, title: candidate.title, played_at: Date.now() + i, event_type: 'Wedding', event_moment: 'Open Dance' }),
      });
      assert.equal(response.status, 200);
    }
  }
  await recordPlays(djs[0], 2);
  await recordPlays(djs[1], 7);

  async function addCompletedEvent(dj, { played, requested, planned }) {
    const now = Date.now();
    const memory = await db.run(`INSERT INTO si_dj_event_memory
      (user_id,event_key,event_type,event_name,venue,event_date,closed_at,planned_track_count,played_track_count,unique_played_count,planned_played_count,unplanned_played_count,completion_pct,repeat_request_count,summary_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [dj.id, `memory-${dj.id}`, 'Wedding', 'Reception', '', null, now, planned, played, 1, played, 0, 100, requested, '{}', now, now]);
    await db.run(`INSERT INTO si_dj_event_memory_tracks
      (memory_id,artist_key,title_key,artist,title,moments_json,planned_count,played_count,request_count,first_played,last_played)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [memory.insertId, key(candidate.artist), key(candidate.title), candidate.artist, candidate.title, JSON.stringify(['Open Dance']), planned, played, requested, now, now]);
  }
  await addCompletedEvent(djs[0], { played: 2, requested: 3, planned: 4 });
  await addCompletedEvent(djs[1], { played: 7, requested: 0, planned: 7 });

  const correctionResponse = await originalFetch(`${origin}/api/library/genre-overrides`, {
    method: 'POST', headers: { Cookie: `rl_session=${djs[0].token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ artist: candidate.artist, title: candidate.title, genre: 'Country' }),
  });
  assert.equal(correctionResponse.status, 200);
  const ownerOverrides = await originalFetch(`${origin}/api/library/genre-overrides`, { headers: { Cookie: `rl_session=${djs[0].token}` } });
  const otherOverrides = await originalFetch(`${origin}/api/library/genre-overrides`, { headers: { Cookie: `rl_session=${djs[1].token}` } });
  assert.equal((await ownerOverrides.json()).overrides.length, 1);
  assert.equal((await otherOverrides.json()).overrides.length, 0, 'genre corrections stay private to the DJ');

  const requestUrl = new URL(`${origin}/api/si-dj/knowledge`);
  requestUrl.searchParams.set('q', candidate.title);
  requestUrl.searchParams.set('event_type', 'Wedding');
  requestUrl.searchParams.set('event_moment', 'Open Dance');
  requestUrl.searchParams.set('limit', '20');
  for (const [index, expected] of [[0, { plays: 2, requests: 3 }], [1, { plays: 7, requests: 0 }]]) {
    const response = await originalFetch(requestUrl, { headers: { Cookie: `rl_session=${djs[index].token}` } });
    assert.equal(response.status, 200);
    const { tracks } = await response.json();
    const learned = tracks.find(track => key(track.artist) === key(candidate.artist) && key(track.title) === key(candidate.title));
    assert.ok(learned, 'the matching catalog candidate is returned');
    assert.equal(learned.live_play_count, expected.plays);
    assert.equal(learned.event_memory_play_count, expected.plays);
    assert.equal(learned.event_memory_request_count, expected.requests);
    assert.equal(learned.event_memory_planned_count, index === 0 ? 4 : 7);
  }

  for (const [index, expected] of [[0, { plays: 2, requests: 3 }], [1, { plays: 7, requests: 0 }]]) {
    const response = await originalFetch(`${origin}/api/library/search?limit=1&offset=0`, { headers: { Cookie: `rl_session=${djs[index].token}` } });
    assert.equal(response.status, 200);
    const { tracks } = await response.json();
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].live_play_count, expected.plays);
    assert.equal(tracks[0].event_memory_play_count, expected.plays);
    assert.equal(tracks[0].event_memory_request_count, expected.requests);
    assert.equal(tracks[0].event_memory_planned_count, index === 0 ? 4 : 7);
  }

  const allEventsUrl = new URL(`${origin}/api/si-dj/knowledge`);
  allEventsUrl.searchParams.set('q', candidate.title);
  const allEventsResponse = await originalFetch(allEventsUrl, { headers: { Cookie: `rl_session=${djs[0].token}` } });
  assert.equal(allEventsResponse.status, 200);
  const allEvents = await allEventsResponse.json();
  const allEventsTrack = allEvents.tracks.find(track => key(track.artist) === key(candidate.artist) && key(track.title) === key(candidate.title));
  assert.equal(allEventsTrack.event_memory_request_count, 3, 'all event history is included when no event type is selected');
});
