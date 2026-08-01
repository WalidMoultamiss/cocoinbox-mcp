import type { IncomingMessage, ServerResponse } from 'node:http';
import { apiBase } from './lib/auth-code.js';

function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return v;
}

function publicBase(req: IncomingMessage): string {
  const env = (process.env.MCP_PUBLIC_URL || '').replace(/\/$/, '');
  if (env) return env;
  const proto = String(header(req, 'x-forwarded-proto') || 'https').split(',')[0].trim();
  const host = String(header(req, 'x-forwarded-host') || header(req, 'host') || 'cocoinbox-mcp.vercel.app')
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}

async function applyBearerAuth(req: IncomingMessage): Promise<boolean> {
  const auth = header(req, 'authorization');
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) return false;
  const token = auth.slice(7).trim();
  if (!token) return false;

  try {
    const meRes = await fetch(`${apiBase()}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!meRes.ok) return false;
    const me = (await meRes.json()) as Record<string, unknown>;
    const { setAuth } = await import('../src/auth/session.js');
    setAuth(token, {
      id: String(me.id ?? me._id ?? ''),
      email: String(me.email ?? ''),
      name: me.name ? String(me.name) : undefined,
      roles: Array.isArray(me.roles) ? (me.roles as string[]) : undefined,
      plan_id: me.plan_id ? String(me.plan_id) : undefined,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * MCP Streamable HTTP on Vercel.
 * Native Node req/res only (no Express helpers on Rust runtime).
 * Accepts Claude OAuth Bearer tokens via Authorization header.
 */
export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
) {
  try {
    const hasBearer = await applyBearerAuth(req);

    // Claude OAuth discovery: unauthenticated probes get 401 + resource_metadata.
    // Cursor tool-login still works when the client sends a real MCP JSON-RPC body
    // without a bearer (we only 401 empty/probe-style GETs or initialize without auth
    // is too aggressive — allow tool login). Prefer advertising via well-known.
    // If Claude sends Authorization and it's invalid → 401.
    const auth = header(req, 'authorization');
    if (auth && !hasBearer) {
      const base = publicBase(req);
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'WWW-Authenticate',
        `Bearer realm="MCP", resource_metadata="${base}/.well-known/oauth-protected-resource"`
      );
      res.end(JSON.stringify({ error: 'invalid_token' }));
      return;
    }

    const { StreamableHTTPServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/streamableHttp.js'
    );
    const { createServer } = await import('../src/server.js');

    const mcp = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } finally {
      await transport.close().catch(() => undefined);
      await mcp.close().catch(() => undefined);
    }
  } catch (err) {
    console.error('MCP handler error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error: 'Internal MCP error',
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }
}
