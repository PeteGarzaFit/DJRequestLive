import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { newToken, tokenHash } from '../server/security.js';

test('event plans are private to their DJ and editable through the collaboration link', async t => {
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
  const ownerToken = newToken();
  const owner = await db.run(`INSERT INTO users (email,password_hash,dj_name,slug,tagline,genres,min_tip,pay_json,design_json,photos_json,is_live,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, ['event-owner@example.test','x','DJ Owner','event-owner','','',0,'{}','{}','[]',1,Date.now()]);
  await db.run('INSERT INTO sessions (user_id,token_hash,expires_at) VALUES (?,?,?)', [owner.insertId, tokenHash(ownerToken), Date.now() + 60000]);
  const anotherToken = newToken();
  const another = await db.run(`INSERT INTO users (email,password_hash,dj_name,slug,tagline,genres,min_tip,pay_json,design_json,photos_json,is_live,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, ['other-event-dj@example.test','x','Other DJ','other-event-dj','','',0,'{}','{}','[]',1,Date.now()]);
  await db.run('INSERT INTO sessions (user_id,token_hash,expires_at) VALUES (?,?,?)', [another.insertId, tokenHash(anotherToken), Date.now() + 60000]);
  const originalFetch = globalThis.fetch;
  t.after(async () => { globalThis.fetch = originalFetch; await new Promise(resolve => server.close(resolve)); await db.close(); });

  const plan = { title: 'Company summer party', eventType: 'Company event', venue: { name: 'Riverside Hall' }, music: { clean: true } };
  const createdResponse = await originalFetch(`${origin}/api/event-plans`, {
    method: 'POST', headers: { Cookie: `rl_session=${ownerToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.match(created.share_token, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(created.plan, plan);

  const privateList = await originalFetch(`${origin}/api/event-plans`, { headers: { Cookie: `rl_session=${ownerToken}` } });
  assert.equal((await privateList.json()).plans.length, 1);
  const hiddenPlan = await originalFetch(`${origin}/api/event-plans/${created.id}`, { headers: { Cookie: `rl_session=${anotherToken}` } });
  assert.equal(hiddenPlan.status, 404);

  const collaborativePlan = { ...plan, suggestions: [{ section: 'Open dance', text: 'Play our favorite song', from: 'Team member' }] };
  const sharedSave = await originalFetch(`${origin}/api/event-share/${created.share_token}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: collaborativePlan }),
  });
  assert.equal(sharedSave.status, 200);
  const sharedLoad = await originalFetch(`${origin}/api/event-share/${created.share_token}`);
  assert.deepEqual((await sharedLoad.json()).plan, collaborativePlan);
});
