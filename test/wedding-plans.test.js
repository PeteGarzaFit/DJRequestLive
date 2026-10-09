import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { newToken, tokenHash } from '../server/security.js';

test('wedding plans save privately and collaborate through their share link', async (t) => {
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
  t.after(async () => {
    globalThis.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
    await db.close();
  });

  const ownerToken = newToken();
  const owner = await db.run(`INSERT INTO users (email,password_hash,dj_name,slug,tagline,genres,min_tip,pay_json,design_json,photos_json,is_live,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, ['wedding-owner@example.test','x','DJ Owner','wedding-owner','','',0,'{}','{}','[]',1,Date.now()]);
  await db.run('INSERT INTO sessions (user_id,token_hash,expires_at) VALUES (?,?,?)', [owner.insertId, tokenHash(ownerToken), Date.now()+60000]);

  const plan = { title: 'Garza wedding', couple: { bride: 'Ava', groom: 'Leo' }, doNotPlay: { songs: [{ title: 'Song X', artist: 'Artist Y' }] } };
  const createdResponse = await originalFetch(`${origin}/api/wedding-plans`, {
    method: 'POST', headers: { Cookie: `rl_session=${ownerToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.match(created.share_token, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(created.plan, plan);

  const privateList = await originalFetch(`${origin}/api/wedding-plans`, { headers: { Cookie: `rl_session=${ownerToken}` } });
  assert.equal((await privateList.json()).plans.length, 1);

  const updated = { ...plan, collaboratorName: 'Mia', suggestions: [{ section: 'Open dance', text: 'Add our song', from: 'Mia' }] };
  const sharedSave = await originalFetch(`${origin}/api/wedding-share/${created.share_token}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: updated }),
  });
  assert.equal(sharedSave.status, 200);
  const sharedLoad = await originalFetch(`${origin}/api/wedding-share/${created.share_token}`);
  assert.deepEqual((await sharedLoad.json()).plan, updated);

  const secondToken = newToken();
  const second = await db.run(`INSERT INTO users (email,password_hash,dj_name,slug,tagline,genres,min_tip,pay_json,design_json,photos_json,is_live,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, ['another-dj@example.test','x','Other DJ','another-dj','','',0,'{}','{}','[]',1,Date.now()]);
  await db.run('INSERT INTO sessions (user_id,token_hash,expires_at) VALUES (?,?,?)', [second.insertId, tokenHash(secondToken), Date.now()+60000]);
  const forbidden = await originalFetch(`${origin}/api/wedding-plans/${created.id}`, { headers: { Cookie: `rl_session=${secondToken}` } });
  assert.equal(forbidden.status, 404);
});
