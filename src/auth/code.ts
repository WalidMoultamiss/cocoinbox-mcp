import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { SessionUser } from './session.js';

function secret(): string {
  return (
    process.env.MCP_AUTH_SECRET ||
    process.env.COCOINBOX_MCP_SECRET ||
    'cocoinbox-mcp-dev-secret-change-me'
  );
}

export type AuthCodePayload = {
  token: string;
  user: SessionUser;
  exp: number;
};

export function createAuthCode(token: string, user: SessionUser, ttlMs = 10 * 60 * 1000): string {
  const payload: AuthCodePayload = {
    token,
    user,
    exp: Date.now() + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyAuthCode(code: string): AuthCodePayload {
  const trimmed = code.trim();
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
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AuthCodePayload;
  if (!payload?.token || !payload?.user?.id) {
    throw new Error('Auth code missing user/token');
  }
  if (payload.exp < Date.now()) {
    throw new Error('Auth code expired — open the login form again');
  }
  return payload;
}

export function newElicitationId(): string {
  return randomUUID();
}

export function getMcpPublicUrl(): string {
  return (process.env.MCP_PUBLIC_URL || 'https://cocoinbox-mcp.vercel.app').replace(/\/$/, '');
}
