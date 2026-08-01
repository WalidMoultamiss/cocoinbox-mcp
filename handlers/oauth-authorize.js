import { isAllowedRedirectUri, verifyPayload } from '../lib/oauth.js';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseQuery(req) {
  try {
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `https://${host}`);
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

function clientRedirects(clientId) {
  try {
    const payload = verifyPayload(clientId);
    if (payload.kind === 'oauth_client' && Array.isArray(payload.redirect_uris)) {
      return payload.redirect_uris.map(String);
    }
  } catch {
    /* client_id may be opaque / CIMD URL / pasted value — fall through */
  }
  return [];
}

function redirectAllowed(redirectUri, clientId) {
  if (isAllowedRedirectUri(redirectUri)) return true;
  const registered = clientRedirects(clientId);
  return registered.includes(String(redirectUri));
}

/**
 * OAuth 2.1 authorization endpoint for Claude MCP connectors.
 * Shows CocoInbox login; after success redirects to redirect_uri with ?code=&state=
 */
export default function handler(req, res) {
  if (req.method && req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    res.end('Method Not Allowed');
    return;
  }

  const q = parseQuery(req);
  const responseType = String(q.response_type || '');
  const clientId = String(q.client_id || '');
  const redirectUri = String(q.redirect_uri || '');
  const state = String(q.state || '');
  const codeChallenge = String(q.code_challenge || '');
  const codeChallengeMethod = String(q.code_challenge_method || '');
  const scope = String(q.scope || 'mcp');

  const failHtml = (msg) => {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!DOCTYPE html><html><body style="font-family:system-ui;padding:2rem">
      <h1>Authorization error</h1><p>${escapeHtml(msg)}</p>
      <p><a href="https://www.cocoinbox.com">CocoInbox</a></p>
    </body></html>`);
  };

  if (responseType !== 'code') {
    failHtml('response_type must be "code"');
    return;
  }
  if (!clientId || !redirectUri) {
    failHtml('client_id and redirect_uri are required');
    return;
  }
  if (!redirectAllowed(redirectUri, clientId)) {
    failHtml(`redirect_uri not allowed: ${redirectUri}`);
    return;
  }
  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    failHtml('PKCE S256 code_challenge is required');
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connect CocoInbox to Claude</title>
  <link rel="icon" href="/favicon.ico" />
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
      width: min(440px, 92vw); padding: 2rem;
      background: rgba(255,255,255,0.9);
      border: 1px solid rgba(20,33,43,0.08);
      box-shadow: 0 18px 50px rgba(20,33,43,0.08);
    }
    .brand { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
    .brand img { width: 48px; height: 48px; object-fit: contain; }
    h1 { margin: 0; font-size: 1.4rem; letter-spacing: -0.02em; }
    p { margin: 0 0 1.2rem; color: #4a5a66; font-size: 0.95rem; line-height: 1.45; }
    label { display: block; font-size: 0.8rem; font-weight: 600; margin: 0.85rem 0 0.35rem; }
    input {
      width: 100%; padding: 0.75rem 0.85rem; border: 1px solid #c9d3db;
      background: #fff; font-size: 1rem;
    }
    button {
      margin-top: 1.25rem; width: 100%; padding: 0.85rem 1rem;
      border: 0; background: #14212b; color: #fff; font-weight: 600; cursor: pointer;
    }
    button:hover { background: #1f6f8b; }
    .hint { margin-top: 1rem; font-size: 0.78rem; color: #6a7a86; }
  </style>
</head>
<body>
  <main>
    <div class="brand">
      <img src="/icon.png" alt="CocoInbox" width="48" height="48" />
      <h1>Connect to Claude</h1>
    </div>
    <p>Sign in with your CocoInbox account to authorize this MCP connector. Your password stays on this page.</p>
    <form method="POST" action="/api/auth-form">
      <input type="hidden" name="oauth" value="1" />
      <input type="hidden" name="client_id" value="${escapeHtml(clientId)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
      <input type="hidden" name="state" value="${escapeHtml(state)}" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}" />
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(codeChallengeMethod)}" />
      <input type="hidden" name="scope" value="${escapeHtml(scope)}" />
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit">Authorize Claude</button>
    </form>
    <p class="hint">After you sign in, you’ll be redirected back to Claude automatically.</p>
  </main>
</body>
</html>`;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(html);
}
