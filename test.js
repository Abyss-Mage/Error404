const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { pairsToObject } = require('./api');

const PORT = 34567;
const base = `http://localhost:${PORT}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const json = (method, body, cookie) => ({ method, headers: { 'Content-Type': 'application/json', ...(cookie && { cookie }) }, body: JSON.stringify(body) });
const cookieOf = (res) => res.headers.get('set-cookie').split(';')[0];

test('Redis HGETALL replies are turned into objects', () => {
  // Upstash returns a flat [field, value, ...] list when automatic deserialization is off.
  assert.deepEqual(pairsToObject(['a', '{"x":1}', 'b', '{"x":2}']), { a: '{"x":1}', b: '{"x":2}' });
  assert.equal(pairsToObject([]), null);
  assert.equal(pairsToObject(null), null);
  assert.deepEqual(pairsToObject({ a: '1' }), { a: '1' });
});

test('admin and reporter flow', async (t) => {
  const server = spawn(process.execPath, [path.join(__dirname, 'dev-server.js')], { env: { ...process.env, PORT, ADMIN_KEY: '', ADMIN_KEYS: 'Sam:sam-key-0123456789abcdef, Alex:alex-key-0123456789abcdef, Weak:short' } });
  await new Promise((resolve) => server.stdout.once('data', resolve));
  t.after(() => server.kill());

  // Admin sign-in
  assert.equal((await fetch(`${base}/api/workspaces`)).status, 401, 'admin API needs sign-in');
  assert.equal((await fetch(`${base}/api/login`, json('POST', { key: 'nope' }))).status, 401);
  assert.equal((await fetch(`${base}/api/login`, json('POST', { key: 'short' }))).status, 401, 'keys under 16 chars are ignored');
  const login = await fetch(`${base}/api/login`, json('POST', { key: 'alex-key-0123456789abcdef' }));
  assert.equal((await login.json()).name, 'Alex');
  const admin = cookieOf(login);
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.ok(!login.headers.get('set-cookie').includes('alex-key'), 'the key itself is never put in the cookie');

  // Workspaces get a typeable project key
  const badUrl = await fetch(`${base}/api/workspaces`, json('POST', { name: 'A', envName: 'B', envUrl: 'javascript:alert(1)' }, admin));
  assert.equal(badUrl.status, 400, 'non-http environment URLs are rejected');
  const ws = await (await fetch(`${base}/api/workspaces`, json('POST', { name: 'App', envName: 'Staging', envUrl: 'https://staging.example.com' }, admin))).json();
  assert.match(ws.reporterKey, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/, 'project key has no look-alike characters');
  const other = await (await fetch(`${base}/api/workspaces`, json('POST', { name: 'Other', envName: 'Dev', envUrl: 'https://dev.example.com' }, admin))).json();
  const list = await (await fetch(`${base}/api/workspaces`, { headers: { cookie: admin } })).json();
  assert.equal(list.admin, 'Alex');
  assert.equal(list.workspaces.length, 2);

  // Reporter sign-in with the project key
  assert.equal((await fetch(`${base}/api/reporter`)).status, 401, 'reporter page needs a project key');
  assert.equal((await fetch(`${base}/api/reporter/login`, json('POST', { key: 'AAAA-BBBB-CCCC' }))).status, 401, 'wrong project key');
  const typed = ws.reporterKey.toLowerCase().replace(/-/g, ' ');
  const rLogin = await fetch(`${base}/api/reporter/login`, json('POST', { key: typed }));
  assert.equal(rLogin.status, 200, 'key is accepted in any case, with spaces instead of dashes');
  const reporter = cookieOf(rLogin);
  const view = await (await fetch(`${base}/api/reporter`, { headers: { cookie: reporter } })).json();
  assert.deepEqual(view.projects.map((x) => x.name), ['App'], 'a project key sees one project');
  assert.equal(view.client, null);
  assert.equal(view.reporterKey, undefined, 'reporters never see the key in API responses');

  // Reporting
  const issuesUrl = `${base}/api/reporter/issues`;
  assert.equal((await fetch(issuesUrl, json('POST', { title: 'x', project: ws.token }))).status, 401, 'reporting needs the project key');
  assert.equal((await fetch(issuesUrl, json('POST', { title: '  ', project: ws.token }, reporter))).status, 400, 'title is required');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
  assert.equal((await fetch(issuesUrl, json('POST', { title: 'x', shot: svg, project: ws.token }, reporter))).status, 400, 'SVG is rejected');
  const huge = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]).toString('base64');
  assert.equal((await fetch(issuesUrl, json('POST', { title: 'x', shot: huge, project: ws.token }, reporter))).status, 413, 'oversized screenshot');
  const plain = await (await fetch(issuesUrl, json('POST', { title: 'No screenshot', project: ws.token }, reporter))).json();
  assert.equal(plain.shot, null, 'screenshot is optional');
  const issue = await (await fetch(issuesUrl, json('POST', { title: 'Broken', reporter: 'Sam', shot: PNG.toString('base64'), project: ws.token }, reporter))).json();
  assert.deepEqual([plain.number, issue.number], [1, 2], 'issues are numbered per workspace');
  assert.equal((await fetch(issuesUrl, json('POST', { title: 'x', project: other.token }, reporter))).status, 404, 'a project key cannot report into another project');

  // Screenshots: admins and this project's reporters only
  const shotUrl = `${base}/shots/${ws.token}/${issue.shot}`;
  const shot = await fetch(shotUrl, { headers: { cookie: reporter } });
  assert.equal(shot.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await shot.arrayBuffer()), PNG);
  assert.equal((await fetch(shotUrl, { headers: { cookie: admin } })).status, 200, 'admins see screenshots');
  assert.equal((await fetch(shotUrl)).status, 404, 'no key, no screenshot');
  const otherReporter = cookieOf(await fetch(`${base}/api/reporter/login`, json('POST', { key: other.reporterKey })));
  assert.equal((await fetch(shotUrl, { headers: { cookie: otherReporter } })).status, 404, 'other projects cannot see it');
  assert.equal((await fetch(`${base}/shots/${ws.token}/..%2Fdb.json`, { headers: { cookie: admin } })).status, 404, 'no path traversal');

  // Fixing
  const patchUrl = `${base}/api/workspaces/${ws.token}/issues/${issue.id}`;
  assert.equal((await fetch(patchUrl, json('PATCH', { done: true }, reporter))).status, 401, 'reporters cannot check off');
  assert.equal((await fetch(patchUrl, json('PATCH', { done: true }, admin))).status, 200);
  const after = await (await fetch(`${base}/api/reporter`, { headers: { cookie: reporter } })).json();
  const fixed = after.projects[0].issues.find((i) => i.id === issue.id);
  assert.equal(fixed.done, true);
  assert.equal(fixed.doneBy, 'Alex', 'records who fixed it');

  // Regenerating the project key signs out everyone using the old one
  const { reporterKey: newKey } = await (await fetch(`${base}/api/workspaces/${ws.token}/key`, json('POST', {}, admin))).json();
  assert.notEqual(newKey, ws.reporterKey);
  assert.equal((await fetch(`${base}/api/reporter`, { headers: { cookie: reporter } })).status, 401, 'old key session ends');
  assert.equal((await fetch(`${base}/api/reporter/login`, json('POST', { key: ws.reporterKey }))).status, 401, 'old key no longer works');
  assert.equal((await fetch(`${base}/api/reporter/login`, json('POST', { key: newKey }))).status, 200, 'new key works');
  assert.equal((await fetch(`${base}/api/workspaces/${ws.token}/key`, json('POST', {}, reporter))).status, 401, 'only admins regenerate keys');

  // Editing a project
  const editUrl = `${base}/api/workspaces/${other.token}`;
  assert.equal((await fetch(editUrl, json('PATCH', { name: 'Renamed', envName: 'QA', envUrl: 'https://qa.example.com' }, reporter))).status, 401, 'only admins edit projects');
  assert.equal((await fetch(editUrl, json('PATCH', { name: 'Renamed', envName: 'QA', envUrl: 'javascript:alert(1)' }, admin))).status, 400, 'edits are validated');
  const edited = await (await fetch(editUrl, json('PATCH', { name: 'Renamed', envName: 'QA', envUrl: 'https://qa.example.com' }, admin))).json();
  assert.deepEqual([edited.name, edited.envName, edited.envUrl, edited.reporterKey], ['Renamed', 'QA', 'https://qa.example.com', other.reporterKey], 'edit keeps the project key');

  // Clients: one key for several projects
  assert.equal((await fetch(`${base}/api/clients`, json('POST', { name: 'Acme' }, reporter))).status, 401, 'only admins create clients');
  const client = await (await fetch(`${base}/api/clients`, json('POST', { name: 'Acme', projects: [ws.token, other.token, 'made-up'] }, admin))).json();
  assert.deepEqual(client.projects, [ws.token, other.token], 'unknown projects are dropped');
  assert.match(client.reporterKey, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  const clientCookie = cookieOf(await fetch(`${base}/api/reporter/login`, json('POST', { key: client.reporterKey })));
  const clientView = await (await fetch(`${base}/api/reporter`, { headers: { cookie: clientCookie } })).json();
  assert.equal(clientView.client, 'Acme');
  assert.deepEqual(clientView.projects.map((x) => x.name), ['App', 'Renamed'], 'a client key sees all its projects');
  assert.equal((await fetch(shotUrl, { headers: { cookie: clientCookie } })).status, 200, 'clients see screenshots of their projects');
  assert.equal((await fetch(issuesUrl, json('POST', { title: 'From client', project: other.token }, clientCookie))).status, 201, 'clients report into any of their projects');

  // Unlinking a project removes access; a new client key signs out the old one
  await fetch(`${base}/api/clients/${client.id}`, json('PATCH', { projects: [other.token] }, admin));
  assert.deepEqual((await (await fetch(`${base}/api/reporter`, { headers: { cookie: clientCookie } })).json()).projects.map((x) => x.name), ['Renamed']);
  assert.equal((await fetch(shotUrl, { headers: { cookie: clientCookie } })).status, 404, 'unlinked project screenshots are hidden');
  assert.equal((await fetch(issuesUrl, json('POST', { title: 'x', project: ws.token }, clientCookie))).status, 404, 'cannot report into an unlinked project');
  const { reporterKey: newClientKey } = await (await fetch(`${base}/api/clients/${client.id}/key`, json('POST', {}, admin))).json();
  assert.notEqual(newClientKey, client.reporterKey);
  assert.equal((await fetch(`${base}/api/reporter`, { headers: { cookie: clientCookie } })).status, 401, 'old client key session ends');
  const clients = (await (await fetch(`${base}/api/workspaces`, { headers: { cookie: admin } })).json()).clients;
  assert.deepEqual(clients.map((c) => [c.name, c.reporterKey]), [['Acme', newClientKey]], 'admins see clients and their keys');

  // Sign-out clears both cookies
  assert.match((await fetch(`${base}/api/logout`, json('POST', {}, admin))).headers.get('set-cookie'), /^admin=; .*Max-Age=0/);
  assert.match((await fetch(`${base}/api/reporter/logout`, json('POST', {}))).headers.get('set-cookie'), /^reporter=; .*Max-Age=0/);

  // Admin and reporter guesses share one limit: 4 wrong so far (nope, short, AAAA…, old key), 6 more locks it.
  for (let i = 0; i < 6; i++) await fetch(`${base}/api/reporter/login`, json('POST', { key: 'ZZZZ-ZZZZ-ZZZZ' }));
  assert.equal((await fetch(`${base}/api/login`, json('POST', { key: 'sam-key-0123456789abcdef' }))).status, 429, 'brute force is rate limited');
  assert.equal((await fetch(`${base}/api/reporter/login`, json('POST', { key: newKey }))).status, 429, 'also for project keys');
});
