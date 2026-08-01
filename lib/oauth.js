import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

function secret() {
  return (
    process.env.MCP_AUTH_SECRET ||
    process.env.COCOINBOX_MCP_SECRET ||
    'cocoinbox-mcp-dev-secret-change-me'
  );
}

export function apiBase() {
  return (
    process.env.COCOINBOX_API_URL || 'https://coco-inbox-backend-eight.vercel.app'
  ).replace(/\/$/, '');
}

export function publicBase(req) {
  const env = (process.env.MCP_PUBLIC_URL || '').replace(/\/$/, '');
  if (env) return env;
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'cocoinbox-mcp.vercel.app')
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}

export function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyPayload(code) {
  const trimmed = String(code || '').trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot <= 0) throw new Error('Invalid signed payload');
  const body = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  const expected = createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Invalid signature');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.exp && payload.exp < Date.now()) {
    throw new Error('Expired');
  }
  return payload;
}

/** Cursor one-time auth code (existing) */
export function createAuthCode(token, user, ttlMs = 10 * 60 * 1000) {
  return signPayload({ token, user, exp: Date.now() + ttlMs, kind: 'cursor_code' });
}

export function verifyAuthCode(code) {
  const payload = verifyPayload(code);
  if (!payload?.token || !payload?.user?.id) throw new Error('Auth code missing user/token');
  return payload;
}

export function createOAuthAuthCode(data, ttlMs = 10 * 60 * 1000) {
  return signPayload({
    kind: 'oauth_code',
    exp: Date.now() + ttlMs,
    ...data,
  });
}

export function createRefreshToken(token, user, ttlMs = 30 * 24 * 60 * 60 * 1000) {
  return signPayload({
    kind: 'refresh',
    token,
    user,
    exp: Date.now() + ttlMs,
  });
}

export function verifyPkceS256(codeVerifier, codeChallenge) {
  const hash = createHash('sha256').update(String(codeVerifier), 'utf8').digest('base64url');
  return hash === String(codeChallenge);
}

export function isAllowedRedirectUri(uri) {
  try {
    const u = new URL(String(uri || ''));
    if (u.href === 'https://claude.ai/api/mcp/auth_callback') return true;
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
      return u.pathname === '/callback' || u.pathname.endsWith('/callback');
    }
    if (u.protocol === 'https:' && u.hostname.endsWith('.claude.ai')) return true;
    return false;
  } catch {
    return false;
  }
}

export function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') {
    const raw = req.body;
    try {
      if (raw.trim().startsWith('{')) return JSON.parse(raw);
    } catch {
      /* form */
    }
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return {};
}

export function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(data));
}

export function corsPreflight(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.end('');
    return true;
  }
  return false;
}
