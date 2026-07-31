export default function handler(_req, res) {
  const VERSION = 6;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CocoInbox MCP</title>
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" href="/icon.png" sizes="32x32" />
  <link rel="icon" type="image/png" href="/icon.png" sizes="192x192" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="shortcut icon" href="/favicon.ico" />
  <link rel="manifest" href="/site.webmanifest" />
  <meta property="og:title" content="CocoInbox MCP" />
  <meta property="og:image" content="https://cocoinbox-mcp.vercel.app/icon.png" />
  <meta name="theme-color" content="#14212b" />
  <style>
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: radial-gradient(1200px 600px at 10% 0%, #dce9f5, #f4f1eb 55%, #efe8dc);
      color: #14212b;
    }
    main {
      text-align: center; padding: 2rem;
      background: rgba(255,255,255,0.9);
      border: 1px solid rgba(20,33,43,0.08);
      width: min(420px, 92vw);
    }
    img.logo { width: 96px; height: 96px; object-fit: contain; margin-bottom: 1rem; }
    h1 { margin: 0 0 0.35rem; font-size: 1.6rem; letter-spacing: -0.02em; }
    p { margin: 0.35rem 0; color: #4a5a66; }
    a { color: #1f6f8b; }
  </style>
</head>
<body>
  <main>
    <img class="logo" src="/icon.png" alt="CocoInbox logo" width="96" height="96" />
    <h1>CocoInbox MCP</h1>
    <p>Hello World</p>
    <p>version ${VERSION}</p>
    <p><a href="/login">Login</a> · <a href="/mcp">MCP</a> · <a href="/version">Version</a></p>
  </main>
</body>
</html>`);
}
