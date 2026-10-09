import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { newToken, tokenHash } from '../server/security.js';

test('Spotify candidates reconcile only against the signed-in DJ library', async (t) => {
  process.env.DB_DRIVER = 'sqlite';
  delete process.env.SQLITE_FILE;
  const db = await createDb();
  const handle = createApp(db);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!await handle(req, res, url)) { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const origin = `http://127.0.0.1:${addr.port}`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    if (url.hostname !== 'api.spotify.com') return originalFetch(input, init);
    assert.equal(url.pathname, '/v1/search');
    assert.equal(url.searchParams.get('q'), 'Sweet Caroline');
    return Response.json({ tracks: { items: [{
      id: 'spotify-track-1', name: 'Sweet Caroline', artists: [{ name: 'Neil Diamond' }],
      album: { name: 'Brother Love’s Travelling Salvation Show', release_date: '1969' },
      duration_ms: 203000, popularity: 80, uri: 'spotify:track:1', external_urls: { spotify: 'https://open.spotify.com/track/1' },
    }] } });
  };
  t.after(async () => {
    globalThis.fetch = originalFetch;
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });

  const token = newToken();
  const user = await db.run(`INSERT INTO users (email,password_hash,dj_name,slug,tagline,genres,min_tip,pay_json,design_json,photos_json,is_live,spotify_access_token,spotify_expires_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ['dj@example.test','x','DJ One','dj-one','','',0,'{}','{}','[]',1,'test-access-token',Date.now()+3600000,Date.now()]);
  await db.run('INSERT INTO sessions (user_id,token_hash,expires_at) VALUES (?,?,?)', [user.insertId, tokenHash(token), Date.now()+60000]);

  const imported = await originalFetch(`${origin}/api/library/import`, {
    method: 'POST', headers: { Cookie: `rl_session=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tracks: [{ title: 'Sweet Caroline', artist: 'Neil Diamond', album: 'Hot August Night', file_type: 'mp3', bpm: 126, file_path: '/Music/Neil Diamond/Sweet Caroline.mp3' }] }),
  });
  assert.equal(imported.status, 201);
  assert.equal((await imported.json()).imported, 1);

  const search = await originalFetch(`${origin}/api/spotify/search?q=Sweet%20Caroline`, { headers: { Cookie: `rl_session=${token}` } });
  assert.equal(search.status, 200);
  const payload = await search.json();
  assert.equal(payload.source, 'spotify_live');
  assert.equal(payload.tracks[0].owned, true);
  assert.equal(payload.tracks[0].versions.length, 1);
  assert.equal(payload.tracks[0].versions[0].file_type, 'mp3');
  assert.equal('file_path' in payload.tracks[0].versions[0], false);

  const otherToken = newToken();
  const otherUser = await db.run(`INSERT INTO users (email,password_hash,dj_name,slug,tagline,genres,min_tip,pay_json,design_json,photos_json,is_live,spotify_access_token,spotify_expires_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ['other@example.test','x','DJ Two','dj-two','','',0,'{}','{}','[]',1,'test-access-token',Date.now()+3600000,Date.now()]);
  await db.run('INSERT INTO sessions (user_id,token_hash,expires_at) VALUES (?,?,?)', [otherUser.insertId, tokenHash(otherToken), Date.now()+60000]);
  const otherSearch = await originalFetch(`${origin}/api/spotify/search?q=Sweet%20Caroline`, { headers: { Cookie: `rl_session=${otherToken}` } });
  assert.equal(otherSearch.status, 200);
  assert.equal((await otherSearch.json()).tracks[0].owned, false);

  const publicRoute = await originalFetch(`${origin}/api/library/summary`);
  assert.equal(publicRoute.status, 401);
});
