/**
 * Streamable HTTP MCP entry — for a public MCP URL.
 * Stateless mode (one request / one short-lived transport).
 *
 *   npm run start:http
 *   → http://127.0.0.1:3100/mcp
 */
import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';

const PORT = Number(process.env.MCP_HTTP_PORT || 3100);
const HOST = process.env.MCP_HTTP_HOST || '127.0.0.1';

async function main() {
  const httpServer = createHttpServer(async (req, res) => {
    const path = req.url?.split('?')[0];

    if (req.method === 'GET' && path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'cocoinbox-mcp' }));
      return;
    }

    if (path !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. Use /mcp' }));
      return;
    }

    // Stateless: fresh server + transport per HTTP request
    const mcp = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      void transport.close();
      void mcp.close();
    });

    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error('MCP HTTP request error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal MCP error' }));
      }
    }
  });

  httpServer.listen(PORT, HOST, () => {
    console.error(
      `CocoInbox MCP HTTP listening on http://${HOST}:${PORT}/mcp (session ${randomUUID().slice(0, 8)}…)`
    );
  });
}

main().catch((err) => {
  console.error('CocoInbox MCP HTTP server failed:', err);
  process.exit(1);
});
