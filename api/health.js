export default function handler(_req, res) {
  const VERSION = 6;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: true, service: 'cocoinbox-mcp', version: VERSION }));
}
