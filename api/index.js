// One Vercel function handles every /api/* and /shots/* request (see vercel.json); dev-server.js runs it locally.
const crypto = require('node:crypto');
const { Redis } = require('@upstash/redis');

const MAX_SHOT = 3 * 1024 * 1024; // base64 makes this ~4 MB, under Vercel's 4.5 MB request limit
const MAX_BODY = 4.4 * 1024 * 1024;
const SHOT_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

// Vercel's Upstash integration sets KV_* names; a direct Upstash setup uses UPSTASH_REDIS_*.
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Redis HGETALL replies with a flat [field, value, field, value, ...] list; turn it into an object.
function pairsToObject(flat) {
  if (!flat) return null;
  if (!Array.isArray(flat)) return flat;
  if (!flat.length) return null;
  const out = {};
  for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1];
  return out;
}

// Only these hash commands are used. Values stay raw strings (we JSON.parse them ourselves),
// which is why automatic deserialization is off and hgetall needs pairsToObject.
function upstashStore() {
  const redis = new Redis({ url: redisUrl, token: redisToken, automaticDeserialization: false });
  return {
    hset: (key, fields) => redis.hset(key, fields),
    hget: (key, field) => redis.hget(key, field),
    hgetall: async (key) => pairsToObject(await redis.hgetall(key)),
    hdel: (key, field) => redis.hdel(key, field),
    hincrby: async (key, field, by) => Number(await redis.hincrby(key, field, by)),
    expire: (key, seconds) => redis.expire(key, seconds),
  };
}

// shortcut: local data is lost on restart; put Upstash keys in .env to keep it.
function memoryStore() {
  const data = {};
  return {
    hset: async (key, fields) => { Object.assign((data[key] ||= {}), fields); },
    hget: async (key, field) => data[key]?.[field] ?? null,
    hgetall: async (key) => (data[key] && Object.keys(data[key]).length ? { ...data[key] } : null),
    hdel: async (key, field) => { delete data[key]?.[field]; },
    hincrby: async (key, field, by) => ((data[key] ||= {})[field] = Number(data[key][field] || 0) + by),
    expire: async () => {},
  };
}

const store = redisUrl ? upstashStore() : memoryStore();

// Keys: "workspaces" token -> workspace JSON, "issues:<token>" id -> issue JSON,
// "shots:<token>" name -> base64 image, "reporter-keys" hash of project key -> token.
const parseAll = (hash) => Object.values(hash || {}).map((v) => JSON.parse(v));

const token = () => crypto.randomBytes(24).toString('base64url');

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Upload is too large'), { status: 413 }));
        req.removeAllListeners('data');
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks));
        if (body && typeof body === 'object') return resolve(body);
      } catch {}
      reject(Object.assign(new Error('Invalid request'), { status: 400 }));
    });
    req.on('error', reject);
  });
}

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha256(a), sha256(b));

/* ---------- Sessions and brute-force protection ---------- */

const MIN_KEY_LENGTH = 16;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_FAILED_LOGINS = 10;
const SESSION_SECONDS = 30 * 24 * 3600;

function readCookie(req, name) {
  const match = new RegExp(`(?:^|;\\s*)${name}=([a-f0-9]{64})`).exec(req.headers.cookie || '');
  return match && match[1];
}

function setCookie(req, res, name, value, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`);
}

// Admin and reporter sign-ins share one counter per connection, so guessing either kind of key is capped.
const failBucket = () => `login-fails:${Math.floor(Date.now() / 1000 / LOGIN_WINDOW_SECONDS)}`;
const clientIp = (req) => req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown'; // Vercel sets x-real-ip

async function assertNotLockedOut(req) {
  if (Number(await store.hget(failBucket(), clientIp(req))) >= MAX_FAILED_LOGINS) {
    fail(429, 'Too many wrong keys from this connection. Wait 15 minutes and try again.');
  }
}

async function recordFailedLogin(req) {
  const bucket = failBucket();
  await store.hincrby(bucket, clientIp(req), 1);
  await store.expire(bucket, LOGIN_WINDOW_SECONDS * 2);
}

/* ---------- Admins ---------- */

// ADMIN_KEYS="Sam:key1,Alex:key2" gives each teammate their own key, so one can be revoked without
// touching the others. ADMIN_KEY alone is a single admin called "Admin". Short keys are ignored.
function admins() {
  const list = (process.env.ADMIN_KEYS || '').split(',').map((entry) => {
    const at = entry.indexOf(':');
    return { name: entry.slice(0, at).trim(), key: entry.slice(at + 1).trim() };
  });
  if (process.env.ADMIN_KEY) list.push({ name: 'Admin', key: process.env.ADMIN_KEY.trim() });
  const valid = list.filter((a) => a.name && a.key.length >= MIN_KEY_LENGTH);
  return valid.length ? valid : fail(500, `No admin keys of at least ${MIN_KEY_LENGTH} characters are set on the server`);
}

// The cookie is a hash of the key: the key itself never leaves the server,
// and removing a key from the env signs that person out everywhere.
const adminCookieFor = (key) => sha256(`error404-session:${key}`).toString('hex');

function findAdmin(req) {
  const cookie = readCookie(req, 'admin');
  return cookie && admins().find((a) => safeEqual(cookie, adminCookieFor(a.key)));
}

const currentAdmin = (req) => findAdmin(req) || fail(401, 'Sign in required');

/* ---------- Reporters: one key per project ---------- */

// No 0/O, 1/I/L: clients type these keys by hand. 12 chars from 31 symbols is about 59 bits,
// and sign-in attempts are rate limited.
const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const normalizeKey = (key) => String(key).toUpperCase().replace(/[^A-Z0-9]/g, '');
const newReporterKey = () => Array.from({ length: 12 }, () => KEY_ALPHABET[crypto.randomInt(KEY_ALPHABET.length)])
  .join('').replace(/(.{4})(?=.)/g, '$1-');
// The reporter cookie and the lookup index both use this hash, so regenerating a key signs out its old sessions.
const reporterHash = (key) => sha256(`error404-reporter:${normalizeKey(key)}`).toString('hex');

async function workspaceFor(workspaceToken) {
  const json = await store.hget('workspaces', workspaceToken);
  return json ? JSON.parse(json) : fail(404, 'Workspace not found');
}

async function saveWorkspace(workspace) {
  await store.hset('workspaces', { [workspace.token]: JSON.stringify(workspace) });
}

// "reporter-keys" maps a key hash to a project token, or to "client:<id>" for a client key.
async function issueKey(record, target) {
  if (record.reporterKey) await store.hdel('reporter-keys', reporterHash(record.reporterKey));
  record.reporterKey = newReporterKey();
  await store.hset('reporter-keys', { [reporterHash(record.reporterKey)]: target });
}

async function setReporterKey(workspace) {
  await issueKey(workspace, workspace.token);
  await saveWorkspace(workspace);
}

const saveClient = (client) => store.hset('clients', { [client.id]: JSON.stringify(client) });

async function clientFor(id) {
  const json = await store.hget('clients', id);
  return json ? JSON.parse(json) : fail(404, 'Client not found');
}

// Which projects the signed-in reporter may see: one for a project key, the client's list for a client key.
async function reporterAccess(req) {
  const cookie = readCookie(req, 'reporter');
  const target = cookie && (await store.hget('reporter-keys', cookie));
  if (!target) fail(401, 'Enter your key to continue');
  if (!target.startsWith('client:')) return { tokens: [target], client: null };
  const json = await store.hget('clients', target.slice('client:'.length));
  if (!json) fail(401, 'Enter your key to continue');
  const client = JSON.parse(json);
  return { tokens: client.projects, client: client.name };
}

// Shared by create and edit; the URL becomes a link on the reporter page, so block javascript: and friends.
function projectFields(body) {
  const name = text(body.name, 100);
  const envName = text(body.envName, 50);
  const envUrl = text(body.envUrl, 500);
  if (!name || !envName) fail(400, 'Name and environment are required');
  let protocol;
  try { protocol = new URL(envUrl).protocol; } catch {}
  if (protocol !== 'http:' && protocol !== 'https:') fail(400, 'Environment URL must start with http:// or https://');
  return { name, envName, envUrl };
}

// Clients may only be linked to projects that exist.
async function clientProjects(list) {
  if (!Array.isArray(list)) fail(400, 'Invalid request');
  const existing = await store.hgetall('workspaces');
  return [...new Set(list)].filter((t) => typeof t === 'string' && existing && existing[t]);
}

const publicIssues = async (workspaceToken) => parseAll(await store.hgetall(`issues:${workspaceToken}`));

/* ---------- Screenshots ---------- */

// Trust the bytes, not the client's content type; this also rules out SVG, which can carry scripts.
function imageExtension(buf) {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

async function saveScreenshot(workspaceToken, base64) {
  if (!base64) return null;
  if (typeof base64 !== 'string') fail(400, 'Invalid screenshot');
  const buf = Buffer.from(base64, 'base64');
  if (buf.length > MAX_SHOT) fail(413, 'Screenshot must be 3 MB or smaller');
  const ext = imageExtension(buf) || fail(400, 'Screenshot must be a PNG, JPEG or WebP image');
  const name = `${crypto.randomUUID()}.${ext}`;
  await store.hset(`shots:${workspaceToken}`, { [name]: buf.toString('base64') });
  return name;
}

/* ---------- Routes ---------- */

const routes = [
  ['POST', /^\/api\/login$/, async (req, res) => {
    await assertNotLockedOut(req);
    const { key } = await readJson(req);
    const admin = typeof key === 'string' && admins().find((a) => safeEqual(key.trim(), a.key));
    if (!admin) {
      await recordFailedLogin(req);
      fail(401, 'That key isn’t right. Check for extra spaces and try again.');
    }
    setCookie(req, res, 'admin', adminCookieFor(admin.key), SESSION_SECONDS);
    send(res, 200, { name: admin.name });
  }],

  ['POST', /^\/api\/logout$/, (req, res) => {
    setCookie(req, res, 'admin', '', 0);
    send(res, 200, { ok: true });
  }],

  ['GET', /^\/api\/workspaces$/, async (req, res) => {
    const admin = currentAdmin(req);
    const workspaces = parseAll(await store.hgetall('workspaces')).sort((a, b) => a.createdAt - b.createdAt);
    await Promise.all(workspaces.map(async (w) => {
      if (!w.reporterKey) await setReporterKey(w); // workspaces made before project keys existed
      w.issues = await publicIssues(w.token);
    }));
    const clients = parseAll(await store.hgetall('clients')).sort((a, b) => a.createdAt - b.createdAt);
    send(res, 200, { admin: admin.name, workspaces, clients });
  }],

  ['POST', /^\/api\/workspaces$/, async (req, res) => {
    currentAdmin(req);
    const workspace = { token: token(), ...projectFields(await readJson(req)), createdAt: Date.now() };
    await setReporterKey(workspace);
    send(res, 201, { ...workspace, issues: [] });
  }],

  ['PATCH', /^\/api\/workspaces\/([\w-]+)$/, async (req, res, workspaceToken) => {
    currentAdmin(req);
    const workspace = Object.assign(await workspaceFor(workspaceToken), projectFields(await readJson(req)));
    await saveWorkspace(workspace);
    send(res, 200, workspace);
  }],

  ['POST', /^\/api\/clients$/, async (req, res) => {
    currentAdmin(req);
    const body = await readJson(req);
    const name = text(body.name, 100) || fail(400, 'A client name is required');
    const client = { id: crypto.randomUUID(), name, projects: await clientProjects(body.projects || []), createdAt: Date.now() };
    await issueKey(client, `client:${client.id}`);
    await saveClient(client);
    send(res, 201, client);
  }],

  ['PATCH', /^\/api\/clients\/([\w-]+)$/, async (req, res, id) => {
    currentAdmin(req);
    const client = await clientFor(id);
    const body = await readJson(req);
    if (body.name !== undefined) client.name = text(body.name, 100) || fail(400, 'A client name is required');
    if (body.projects !== undefined) client.projects = await clientProjects(body.projects);
    await saveClient(client);
    send(res, 200, client);
  }],

  ['POST', /^\/api\/clients\/([\w-]+)\/key$/, async (req, res, id) => {
    currentAdmin(req);
    const client = await clientFor(id);
    await issueKey(client, `client:${client.id}`);
    await saveClient(client);
    send(res, 200, { reporterKey: client.reporterKey });
  }],

  ['POST', /^\/api\/workspaces\/([\w-]+)\/key$/, async (req, res, workspaceToken) => {
    currentAdmin(req);
    const workspace = await workspaceFor(workspaceToken);
    await setReporterKey(workspace);
    send(res, 200, { reporterKey: workspace.reporterKey });
  }],

  ['PATCH', /^\/api\/workspaces\/([\w-]+)\/issues\/([\w-]+)$/, async (req, res, workspaceToken, id) => {
    const admin = currentAdmin(req);
    const body = await readJson(req);
    if (typeof body.done !== 'boolean') fail(400, 'Invalid request');
    const key = `issues:${workspaceToken}`;
    const issue = JSON.parse((await store.hget(key, id)) || fail(404, 'Issue not found'));
    issue.done = body.done;
    issue.doneBy = body.done ? admin.name : null;
    await store.hset(key, { [id]: JSON.stringify(issue) });
    send(res, 200, issue);
  }],

  ['POST', /^\/api\/reporter\/login$/, async (req, res) => {
    await assertNotLockedOut(req);
    const { key } = await readJson(req);
    const hash = typeof key === 'string' && normalizeKey(key).length === 12 && reporterHash(key);
    const target = hash && (await store.hget('reporter-keys', hash));
    if (!target) {
      await recordFailedLogin(req);
      fail(401, 'That key isn’t right. Check it with the person who sent it.');
    }
    setCookie(req, res, 'reporter', hash, SESSION_SECONDS);
    send(res, 200, { ok: true });
  }],

  ['POST', /^\/api\/reporter\/logout$/, (req, res) => {
    setCookie(req, res, 'reporter', '', 0);
    send(res, 200, { ok: true });
  }],

  ['GET', /^\/api\/reporter$/, async (req, res) => {
    const { tokens, client } = await reporterAccess(req);
    const projects = await Promise.all(tokens.map(async (t) => {
      const json = await store.hget('workspaces', t);
      if (!json) return null;
      const { name, envName, envUrl } = JSON.parse(json);
      return { token: t, name, envName, envUrl, issues: await publicIssues(t) };
    }));
    send(res, 200, { client, projects: projects.filter(Boolean) });
  }],

  ['POST', /^\/api\/reporter\/issues$/, async (req, res) => {
    const { tokens } = await reporterAccess(req);
    const body = await readJson(req);
    const workspaceToken = body.project;
    if (!tokens.includes(workspaceToken)) fail(404, 'Project not found');
    const title = text(body.title, 200);
    if (!title) fail(400, 'A title is required');
    const issue = {
      id: crypto.randomUUID(),
      title,
      details: text(body.details, 5000),
      reporter: text(body.reporter, 100),
      shot: await saveScreenshot(workspaceToken, body.shot),
      done: false,
      createdAt: Date.now(),
      number: await store.hincrby('issue-numbers', workspaceToken, 1), // atomic, so two reports never share a number
    };
    await store.hset(`issues:${workspaceToken}`, { [issue.id]: JSON.stringify(issue) });
    send(res, 201, issue);
  }],

  // Only admins, or reporters signed in to this project, can see its screenshots.
  ['GET', /^\/shots\/([\w-]+)\/([\w-]+\.(png|jpg|webp))$/, async (req, res, workspaceToken, name, ext) => {
    if (!findAdmin(req)) {
      const { tokens } = await reporterAccess(req).catch(() => fail(404, 'Not found'));
      if (!tokens.includes(workspaceToken)) fail(404, 'Not found');
    }
    const base64 = (await store.hget(`shots:${workspaceToken}`, name)) || fail(404, 'Not found');
    res.writeHead(200, { 'Content-Type': SHOT_TYPES[ext], 'Cache-Control': 'private, max-age=31536000, immutable' });
    res.end(Buffer.from(base64, 'base64'));
  }],
];

module.exports = async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex');
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    for (const [method, pattern, handler] of routes) {
      const match = req.method === method && pattern.exec(pathname);
      if (match) return await handler(req, res, ...match.slice(1));
    }
    fail(404, 'Not found');
  } catch (error) {
    if (!error.status) console.error(error);
    send(res, error.status || 500, { error: error.status ? error.message : 'Something went wrong' });
  }
};

module.exports.pairsToObject = pairsToObject;
