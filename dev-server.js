// Local stand-in for Vercel (not named server.js, which Vercel would auto-deploy as the whole backend): serves index.html for pages and hands everything else to the API function.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const generatedKey = !process.env.ADMIN_KEY && !process.env.ADMIN_KEYS && crypto.randomBytes(24).toString('base64url');
if (generatedKey) process.env.ADMIN_KEY = generatedKey;
const handler = require('./api');
const PORT = process.env.PORT || 3456;

http.createServer((req, res) => {
  if (req.method === 'GET' && /^\/(admin|w\/[\w-]+)?$/.test(req.url.split('?')[0])) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'no-referrer' });
    return fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
  }
  handler(req, res);
}).listen(PORT, () => {
  console.log(`Admin page: http://localhost:${PORT}/admin`);
  console.log(generatedKey ? `Admin key:  ${generatedKey} (temporary; set ADMIN_KEY in .env to keep one)` : 'Admin keys: from .env');
  console.log(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL ? 'Storage:    Upstash Redis' : 'Storage:    in memory (lost on restart)');
});
