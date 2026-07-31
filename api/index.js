export default function handler(_req, res) {
  const VERSION = 3;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Hello World\nversion ' + VERSION);
}
