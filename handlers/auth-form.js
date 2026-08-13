import { createAuthCode, apiBase } from '../lib/auth-code.js';
import { createOAuthAuthCode } from '../lib/oauth.js';

function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') {
    try {
      if (req.body.trim().startsWith('{')) return JSON.parse(req.body);
    } catch {
      /* form */
    }
    return Object.fromEntries(new URLSearchParams(req.body));
  }
  return {};
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:"Segoe UI",system-ui,sans-serif;background:#f4f1eb;color:#14212b}
  main{width:min(520px,92vw);padding:2rem;background:#fff;border:1px solid #e4ddd2}
  h1{margin:0 0 .5rem;font-size:1.4rem} p{color:#4a5a66;line-height:1.45}
  code,textarea{font-family:ui-monospace,Consolas,monospace;font-size:.8rem}
  textarea{width:100%;min-height:7rem;padding:.75rem;border:1px solid #c9d3db;resize:vertical}
  .err{color:#9b1c1c}
</style></head><body><main>${bodyHtml}</main></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    res.end('Method Not Allowed');
    return;
  }

  try {
    const body = readBody(req);
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    const isOauth = String(body.oauth || '') === '1';

    if (!email || !password) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(
        page(
          'Login failed',
          `<h1 class="err">Missing fields</h1><p><a href="${isOauth ? '/authorize' : '/login'}">Back to login</a></p>`
        )
      );
      return;
    }

    const loginRes = await fetch(`${apiBase()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginData = await loginRes.json().catch(() => ({}));
    if (!loginRes.ok || !loginData.token) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(
        page(
          'Login failed',
          `<h1 class="err">Login failed</h1><p>${escapeHtml(loginData.error || loginData.message || 'Invalid credentials')}</p><p><a href="${isOauth ? '/authorize' : '/login'}">Try again</a></p>`
        )
      );
      return;
    }

    const meRes = await fetch(`${apiBase()}/api/auth/me`, {
      headers: { Authorization: `Bearer ${loginData.token}`, Accept: 'application/json' },
    });
    const me = await meRes.json();
    if (!meRes.ok) {
      throw new Error(me.error || 'Failed to load profile');
    }

    const user = {
      id: String(me.id || me._id || ''),
      email: String(me.email || email),
      name: me.name ? String(me.name) : undefined,
      roles: Array.isArray(me.roles) ? me.roles : loginData.roles,
      plan_id: me.plan_id ? String(me.plan_id) : undefined,
    };

    // Claude / OAuth connector flow → redirect back with authorization code
    if (isOauth) {
      const redirectUri = String(body.redirect_uri || '');
      const state = String(body.state || '');
      const clientId = String(body.client_id || '');
      const codeChallenge = String(body.code_challenge || '');
      const codeChallengeMethod = String(body.code_challenge_method || 'S256');
      const scope = String(body.scope || 'mcp');

      if (!redirectUri || !codeChallenge) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(page('OAuth error', `<h1 class="err">Missing OAuth fields</h1>`));
        return;
      }

      const oauthCode = createOAuthAuthCode({
        token: loginData.token,
        user,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        scope,
      });

      const target = new URL(redirectUri);
      target.searchParams.set('code', oauthCode);
      if (state) target.searchParams.set('state', state);

      res.statusCode = 302;
      res.setHeader('Location', target.toString());
      res.setHeader('Cache-Control', 'no-store');
      res.end('');
      return;
    }

    // Cursor / agent flow → success page with one-click copy (fallback to paste in chat)
    const code = createAuthCode(loginData.token, user);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Connected — CocoInbox</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:"Segoe UI",system-ui,sans-serif;background:radial-gradient(1200px 600px at 10% 0%,#dce9f5,#f4f1eb 55%,#efe8dc);color:#14212b}
  main{width:min(440px,92vw);padding:2rem;background:rgba(255,255,255,.92);border:1px solid rgba(20,33,43,.08);box-shadow:0 18px 50px rgba(20,33,43,.08)}
  h1{margin:0 0 .5rem;font-size:1.45rem;letter-spacing:-.02em}
  p{color:#4a5a66;line-height:1.45;margin:0 0 1rem}
  .ok{display:inline-flex;align-items:center;gap:.4rem;font-size:.8rem;font-weight:700;color:#0f6b4c;background:#e6f6ef;padding:.35rem .65rem;border-radius:999px;margin-bottom:1rem}
  textarea{width:100%;min-height:5.5rem;padding:.75rem;border:1px solid #c9d3db;font-family:ui-monospace,Consolas,monospace;font-size:.72rem;resize:vertical}
  button{margin-top:.75rem;width:100%;padding:.85rem 1rem;border:0;background:#14212b;color:#fff;font-weight:600;cursor:pointer}
  button:hover{background:#1f6f8b}
  .hint{margin-top:1rem;font-size:.8rem;color:#6a7a86}
</style></head><body><main>
  <div class="ok">Connected</div>
  <h1>You're signed in</h1>
  <p>Signed in as <strong>${escapeHtml(user.name || user.email)}</strong>.</p>
  <p>If Cursor/Claude did not connect automatically, copy this one-time code and paste it in the chat:</p>
  <textarea id="code" readonly>${escapeHtml(code)}</textarea>
  <button type="button" id="copy">Copy code</button>
  <p class="hint">You can close this window after copying. Code expires in 10 minutes.</p>
  <script>
    const ta = document.getElementById('code');
    const btn = document.getElementById('copy');
    btn.addEventListener('click', async () => {
      ta.select();
      try {
        await navigator.clipboard.writeText(ta.value);
        btn.textContent = 'Copied';
      } catch {
        document.execCommand('copy');
        btn.textContent = 'Copied';
      }
    });
    ta.focus(); ta.select();
  </script>
</main></body></html>`);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      page(
        'Login error',
        `<h1 class="err">Something went wrong</h1><p>${escapeHtml(err instanceof Error ? err.message : String(err))}</p><p><a href="/login">Back</a></p>`
      )
    );
  }
}
