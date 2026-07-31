import { createAuthCode, apiBase } from './lib/auth-code.js';

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
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
    if (!email || !password) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(
        page(
          'Login failed',
          `<h1 class="err">Missing fields</h1><p><a href="/login">Back to login</a></p>`
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
          `<h1 class="err">Login failed</h1><p>${escapeHtml(loginData.error || loginData.message || 'Invalid credentials')}</p><p><a href="/login">Try again</a></p>`
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

    const code = createAuthCode(loginData.token, user);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      page(
        'Login success',
        `<h1>You're signed in</h1>
         <p>Signed in as <strong>${escapeHtml(user.name || user.email)}</strong>. Copy this auth code and tell Cursor to run <code>complete_login</code> with it:</p>
         <textarea readonly onclick="this.select()">${escapeHtml(code)}</textarea>
         <p>The code expires in 10 minutes. You can close this tab after pasting it.</p>`
      )
    );
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
