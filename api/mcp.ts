import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * MCP Streamable HTTP on Vercel.
 * Native Node req/res only (no Express helpers on Rust runtime).
 */
export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
) {
  try {
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
