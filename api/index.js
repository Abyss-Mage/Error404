// One Vercel function handles every /api/* and /shots/* request (see vercel.json); server.js runs it locally.
const crypto = require('node:crypto');
const { Redis } = require('@upstash/redis');

const MAX_SHOT = 3 * 1024 * 1024; // base64 makes this ~4 MB, under Vercel's 4.5 MB request limit
const MAX_BODY = 4.4 * 1024 * 1024;
const SHOT_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

// Vercel's Upstash integration sets KV_* names; a direct Upstash setup uses UPSTASH_REDIS_*.
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Only the hash commands below are used, so local dev can swap in this in-memory stand-in.
// shortcut: local data is lost on restart; put Upstash keys in .env to keep it.
function memoryStore() {
  const data = {};
  return {
    hset: async (key, fields) => { Object.assign((data[key] ||= {}), fields); },
    hget: async (key, field) => data[key]?.[field] ?? null,
    hgetall: async (key) => (data[key] ? { ...data[key] } : null),
    hincrby: async (key, field, by) => ((data[key] ||= {})[field] = Number(data[key][field] || 0) + by),
    expire: async () => {},
  };
}

const store = redisUrl
  ? new Redis({ url: redisUrl, token: redisToken, automaticDeserialization: false })
  : memoryStore();

// Keys: "workspaces" token -> workspace JSON, "issues:<token>" id -> issue JSON, "shots:<token>" name -> base64 image.
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

const MIN_KEY_LENGTH = 16;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_FAILED_LOGINS = 10;

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

// The cookie is a hash of the key: any key is cookie-safe, the key itself never leaves the server,
// and removing a key from the env signs that person out everywhere.
const cookieFor = (key) => sha256(`error404-session:${key}`).toString('hex');

function currentAdmin(req) {
  const cookie = /(?:^|;\s*)admin=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  return (cookie && admins().find((a) => safeEqual(cookie[1], cookieFor(a.key)))) || fail(401, 'Sign in required');
}

function sessionCookie(req, value, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `admin=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

async function workspaceFor(workspaceToken) {
  const json = await store.hget('workspaces', workspaceToken);
  return json ? JSON.parse(json) : fail(404, 'Workspace not found');
}

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

const routes = [
  ['POST', /^\/api\/login$/, async (req, res) => {
    // Vercel sets x-real-ip to the caller's address; locally it falls back to the socket.
    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
    const bucket = `login-fails:${Math.floor(Date.now() / 1000 / LOGIN_WINDOW_SECONDS)}`;
    if (Number(await store.hget(bucket, ip)) >= MAX_FAILED_LOGINS) {
      fail(429, 'Too many wrong keys from this connection. Wait 15 minutes and try again.');
    }
    const { key } = await readJson(req);
    const admin = typeof key === 'string' && admins().find((a) => safeEqual(key.trim(), a.key));
    if (!admin) {
      await store.hincrby(bucket, ip, 1);
      await store.expire(bucket, LOGIN_WINDOW_SECONDS * 2);
      fail(401, 'That key isn’t right. Check for extra spaces and try again.');
    }
    res.setHeader('Set-Cookie', sessionCookie(req, cookieFor(admin.key), 30 * 24 * 3600));
    send(res, 200, { name: admin.name });
  }],

  ['POST', /^\/api\/logout$/, (req, res) => {
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
    send(res, 200, { ok: true });
  }],

  ['GET', /^\/api\/workspaces$/, async (req, res) => {
    const admin = currentAdmin(req);
    const workspaces = parseAll(await store.hgetall('workspaces')).sort((a, b) => a.createdAt - b.createdAt);
    await Promise.all(workspaces.map(async (w) => { w.issues = parseAll(await store.hgetall(`issues:${w.token}`)); }));
    send(res, 200, { admin: admin.name, workspaces });
  }],

  ['POST', /^\/api\/workspaces$/, async (req, res) => {
    currentAdmin(req);
    const body = await readJson(req);
    const name = text(body.name, 100);
    const envName = text(body.envName, 50);
    const envUrl = text(body.envUrl, 500);
    if (!name || !envName) fail(400, 'Name and environment are required');
    let protocol;
    try { protocol = new URL(envUrl).protocol; } catch {}
    // The URL becomes a link on the tester page, so block javascript: and friends.
    if (protocol !== 'http:' && protocol !== 'https:') fail(400, 'Environment URL must start with http:// or https://');
    const workspace = { token: token(), name, envName, envUrl, createdAt: Date.now() };
    await store.hset('workspaces', { [workspace.token]: JSON.stringify(workspace) });
    send(res, 201, { ...workspace, issues: [] });
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

  ['GET', /^\/api\/w\/([\w-]+)$/, async (req, res, workspaceToken) => {
    const { name, envName, envUrl } = await workspaceFor(workspaceToken);
    const issues = parseAll(await store.hgetall(`issues:${workspaceToken}`));
    send(res, 200, { name, envName, envUrl, issues });
  }],

  ['POST', /^\/api\/w\/([\w-]+)\/issues$/, async (req, res, workspaceToken) => {
    await workspaceFor(workspaceToken);
    const body = await readJson(req);
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

  // Screenshots are stored per workspace, so a link only ever reaches its own workspace's images.
  ['GET', /^\/shots\/([\w-]+)\/([\w-]+\.(png|jpg|webp))$/, async (req, res, workspaceToken, name, ext) => {
    const base64 = (await store.hget(`shots:${workspaceToken}`, name)) || fail(404, 'Not found');
    res.writeHead(200, { 'Content-Type': SHOT_TYPES[ext], 'Cache-Control': 'private, max-age=31536000, immutable' });
    res.end(Buffer.from(base64, 'base64'));
  }],
];

module.exports = async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer'); // keeps the private workspace link out of Referer headers
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
