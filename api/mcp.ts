import type { VercelRequest, VercelResponse } from '@vercel/node';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from '../src/server.js';

/**
 * MCP Streamable HTTP endpoint for Vercel serverless.
 * Note: in-memory auth session does not survive across cold starts /
 * different instances — prefer COCOINBOX_TOKEN or login per session.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const mcp = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error('MCP handler error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal MCP error' });
    }
  } finally {
    await transport.close().catch(() => undefined);
    await mcp.close().catch(() => undefined);
  }
}
