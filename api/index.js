export default function handler(_req, res) {
  const VERSION = 5;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>CocoInbox MCP</title>
<link rel="icon" href="/icon.png" type="image/png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
</head><body>
<pre>Hello World
version ${VERSION}</pre>
</body></html>`);
}
