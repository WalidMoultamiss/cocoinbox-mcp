const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CocoInbox MCP Login</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: radial-gradient(1200px 600px at 10% 0%, #dce9f5, #f4f1eb 55%, #efe8dc);
      color: #14212b;
    }
    main {
      width: min(420px, 92vw);
      padding: 2rem;
      background: rgba(255,255,255,0.86);
      border: 1px solid rgba(20,33,43,0.08);
      box-shadow: 0 18px 50px rgba(20,33,43,0.08);
    }
    h1 { margin: 0 0 0.35rem; font-size: 1.55rem; letter-spacing: -0.02em; }
    p { margin: 0 0 1.4rem; color: #4a5a66; font-size: 0.95rem; line-height: 1.45; }
    label { display: block; font-size: 0.8rem; font-weight: 600; margin: 0.85rem 0 0.35rem; }
    input {
      width: 100%; padding: 0.75rem 0.85rem; border: 1px solid #c9d3db;
      background: #fff; font-size: 1rem;
    }
    input:focus { outline: 2px solid #1f6f8b; outline-offset: 1px; }
    button {
      margin-top: 1.25rem; width: 100%; padding: 0.85rem 1rem;
      border: 0; background: #14212b; color: #fff; font-weight: 600; cursor: pointer;
    }
    button:hover { background: #1f6f8b; }
    .hint { margin-top: 1rem; font-size: 0.8rem; color: #6a7a86; }
  </style>
</head>
<body>
  <main>
    <h1>CocoInbox</h1>
    <p>Sign in to connect this MCP session. Your password stays in this form — not in the AI chat.</p>
    <form method="POST" action="/api/auth-form">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit">Sign in</button>
    </form>
    <p class="hint">After login you’ll get a one-time auth code to paste into Cursor via <code>complete_login</code>.</p>
  </main>
</body>
</html>`;

export default function handler(req, res) {
  if (req.method && req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    res.end('Method Not Allowed');
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(LOGIN_HTML);
}
