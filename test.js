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
  const fromClient = await fetch(issuesUrl, json('POST', { title: 'From client', reporter: 'Someone else', project: other.token }, clientCookie));
  assert.equal(fromClient.status, 201, 'clients report into any of their projects');
  assert.equal((await fromClient.json()).reporter, 'Acme', 'client reports are signed with the client name');

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

  // MCP: an agent token reaches one project only
  const mcpUrl = `${base}/api/mcp`;
  const rpc = async (agentToken, method, params, id = 1) => {
    const r = await fetch(mcpUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${agentToken}` }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
    return { status: r.status, body: r.status === 200 ? await r.json() : null };
  };
  assert.equal((await fetch(`${base}/api/workspaces/${ws.token}/agent-token`, json('POST', {}, reporter))).status, 401, 'only admins create agent tokens');
  const { agentToken } = await (await fetch(`${base}/api/workspaces/${ws.token}/agent-token`, json('POST', {}, admin))).json();
  assert.match(agentToken, /^e404_[\w-]{32}$/);
  assert.equal((await rpc('e404_wrong', 'tools/list')).status, 401, 'bad token is refused');
  assert.equal((await fetch(mcpUrl, json('POST', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, admin))).status, 401, 'admin cookie is not an agent token');
  const init = (await rpc(agentToken, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).body;
  assert.equal(init.result.serverInfo.name, 'error404');
  assert.match(init.result.instructions, /App/);
  const note = await fetch(mcpUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agentToken}` }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
  assert.equal(note.status, 202, 'notifications get an empty 202');
  assert.deepEqual((await rpc(agentToken, 'tools/list')).body.result.tools.map((t) => t.name), ['list_problems', 'get_problem', 'mark_fixed']);
  const call = async (name, args) => (await rpc(agentToken, 'tools/call', { name, arguments: args })).body.result;
  const open = JSON.parse((await call('list_problems', {})).content[0].text);
  assert.equal(open.project, 'App');
  assert.deepEqual(open.problems.map((p) => p.number), [1], 'only open problems by default (#2 was fixed)');
  const two = await call('get_problem', { number: 2 });
  assert.equal(JSON.parse(two.content[0].text).status, 'fixed');
  assert.deepEqual(two.content[1], { type: 'image', data: PNG.toString('base64'), mimeType: 'image/png' }, 'screenshot comes back as an image');
  assert.equal((await call('mark_fixed', { number: 1 })).content[0].text, '#1 is now fixed.');
  assert.equal(JSON.parse((await call('list_problems', { status: 'all' })).content[0].text).problems.find((p) => p.number === 1).fixedBy, 'AI agent');
  assert.equal((await call('get_problem', { number: 99 })).isError, true, 'unknown number is a tool error, not a crash');
  const otherIssue = JSON.parse((await call('list_problems', { status: 'all' })).content[0].text).problems.find((p) => p.title === 'From client');
  assert.equal(otherIssue, undefined, 'problems from other projects are invisible');
  assert.equal((await rpc(agentToken, 'resources/list')).body.error.code, -32601);
  const { agentToken: newAgentToken } = await (await fetch(`${base}/api/workspaces/${ws.token}/agent-token`, json('POST', {}, admin))).json();
  assert.equal((await rpc(agentToken, 'tools/list')).status, 401, 'a new token cuts off the old one');
  assert.equal((await rpc(newAgentToken, 'tools/list')).status, 200);
  const view2 = await (await fetch(`${base}/api/reporter`, { headers: { cookie: (await fetch(`${base}/api/reporter/login`, json('POST', { key: newKey }))).headers.get('set-cookie').split(';')[0] } })).json();
  assert.ok(!JSON.stringify(view2).includes('e404_'), 'reporters never see agent tokens');

  // Sign-out clears both cookies
  assert.match((await fetch(`${base}/api/logout`, json('POST', {}, admin))).headers.get('set-cookie'), /^admin=; .*Max-Age=0/);
  assert.match((await fetch(`${base}/api/reporter/logout`, json('POST', {}))).headers.get('set-cookie'), /^reporter=; .*Max-Age=0/);

  // Admin and reporter guesses share one limit: 4 wrong so far (nope, short, AAAA…, old key), 6 more locks it.
  for (let i = 0; i < 6; i++) await fetch(`${base}/api/reporter/login`, json('POST', { key: 'ZZZZ-ZZZZ-ZZZZ' }));
  assert.equal((await fetch(`${base}/api/login`, json('POST', { key: 'sam-key-0123456789abcdef' }))).status, 429, 'brute force is rate limited');
  assert.equal((await fetch(`${base}/api/reporter/login`, json('POST', { key: newKey }))).status, 429, 'also for project keys');
});
