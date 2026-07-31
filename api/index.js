export default function handler(_req, res) {
  // VERSION bump: keep in sync with api/version-number.js and src/version.ts
  const VERSION = 2;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Hello World\nversion ' + VERSION);
}
