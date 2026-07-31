import { createHmac, timingSafeEqual } from 'node:crypto';

function secret() {
  return (
    process.env.MCP_AUTH_SECRET ||
    process.env.COCOINBOX_MCP_SECRET ||
    'cocoinbox-mcp-dev-secret-change-me'
  );
}

export function createAuthCode(token, user, ttlMs = 10 * 60 * 1000) {
  const payload = {
    token,
    user,
    exp: Date.now() + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyAuthCode(code) {
  const trimmed = String(code || '').trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot <= 0) throw new Error('Invalid auth code format');
  const body = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  const expected = createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Invalid auth code signature');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload?.token || !payload?.user?.id) throw new Error('Auth code missing user/token');
  if (payload.exp < Date.now()) throw new Error('Auth code expired');
  return payload;
}

export function apiBase() {
  return (
    process.env.COCOINBOX_API_URL || 'https://coco-inbox-backend-eight.vercel.app'
  ).replace(/\/$/, '');
}
