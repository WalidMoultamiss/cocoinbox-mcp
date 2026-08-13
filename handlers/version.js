export default function handler(_req, res) {
  const VERSION = 15;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ version: VERSION, service: 'cocoinbox-mcp' }));
}
