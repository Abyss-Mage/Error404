const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = 34567;
const base = `http://localhost:${PORT}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const json = (method, body, cookie) => ({ method, headers: { 'Content-Type': 'application/json', ...(cookie && { cookie }) }, body: JSON.stringify(body) });

test('workspace flow', async (t) => {
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT, ADMIN_KEY: '', ADMIN_KEYS: 'Sam:sam-key-0123456789abcdef, Alex:alex-key-0123456789abcdef, Weak:short' } });
  await new Promise((resolve) => server.stdout.once('data', resolve));
  t.after(() => server.kill());

  assert.equal((await fetch(`${base}/api/workspaces`)).status, 401, 'admin API needs sign-in');
  assert.equal((await fetch(`${base}/api/login`, json('POST', { key: 'nope' }))).status, 401);
  assert.equal((await fetch(`${base}/api/login`, json('POST', { key: 'short' }))).status, 401, 'keys under 16 chars are ignored');
  const login = await fetch(`${base}/api/login`, json('POST', { key: 'alex-key-0123456789abcdef' }));
  assert.equal((await login.json()).name, 'Alex');
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.ok(!login.headers.get('set-cookie').includes('alex-key'), 'the key itself is never put in the cookie');
  assert.equal((await (await fetch(`${base}/api/workspaces`, { headers: { cookie } })).json()).admin, 'Alex');

  const badUrl = await fetch(`${base}/api/workspaces`, json('POST', { name: 'A', envName: 'B', envUrl: 'javascript:alert(1)' }, cookie));
  assert.equal(badUrl.status, 400, 'non-http environment URLs are rejected');

  const ws = await (await fetch(`${base}/api/workspaces`, json('POST', { name: 'App', envName: 'Staging', envUrl: 'https://staging.example.com' }, cookie))).json();
  const issuesUrl = `${base}/api/w/${ws.token}/issues`;

  assert.equal((await fetch(`${base}/api/w/wrong/issues`, json('POST', { title: 'x' }))).status, 404, 'unknown link');
  assert.equal((await fetch(issuesUrl, json('POST', { title: '  ' }))).status, 400, 'title is required');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
  assert.equal((await fetch(issuesUrl, json('POST', { title: 'x', shot: svg }))).status, 400, 'SVG is rejected');
  const huge = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]).toString('base64');
  assert.equal((await fetch(issuesUrl, json('POST', { title: 'x', shot: huge }))).status, 413, 'oversized screenshot');

  const plain = await (await fetch(issuesUrl, json('POST', { title: 'No screenshot' }))).json();
  assert.equal(plain.shot, null, 'screenshot is optional');
  const issue = await (await fetch(issuesUrl, json('POST', { title: 'Broken', reporter: 'Sam', shot: PNG.toString('base64') }))).json();
  assert.deepEqual([plain.number, issue.number], [1, 2], 'issues are numbered per workspace');

  const shot = await fetch(`${base}/shots/${ws.token}/${issue.shot}`);
  assert.equal(shot.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await shot.arrayBuffer()), PNG);
  assert.equal((await fetch(`${base}/shots/${ws.token}/..%2Fdb.json`)).status, 404, 'no path traversal');

  const patchUrl = `${base}/api/workspaces/${ws.token}/issues/${issue.id}`;
  assert.equal((await fetch(patchUrl, json('PATCH', { done: true }))).status, 401, 'testers cannot check off');
  assert.equal((await fetch(patchUrl, json('PATCH', { done: true }, cookie))).status, 200);

  const view = await (await fetch(`${base}/api/w/${ws.token}`)).json();
  assert.equal(view.issues.length, 2);
  assert.equal(view.issues[1].done, true);
  assert.equal(view.issues[1].doneBy, 'Alex', 'records who fixed it');
  assert.equal(view.envUrl, 'https://staging.example.com');
  assert.equal(view.adminKey, undefined);

  const out = await fetch(`${base}/api/logout`, { method: 'POST', headers: { cookie } });
  assert.match(out.headers.get('set-cookie'), /admin=; .*Max-Age=0/, 'sign-out clears the cookie');

  // 10 wrong keys (one already used above) lock this connection out, even for a right key.
  for (let i = 0; i < 9; i++) await fetch(`${base}/api/login`, json('POST', { key: 'wrong' }));
  assert.equal((await fetch(`${base}/api/login`, json('POST', { key: 'sam-key-0123456789abcdef' }))).status, 429, 'brute force is rate limited');
});
