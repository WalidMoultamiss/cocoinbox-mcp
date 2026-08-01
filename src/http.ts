/**
 * Streamable HTTP MCP entry — for a public MCP URL.
 *
 *   npm run start:http
 *   → http://127.0.0.1:3100/
 *   → http://127.0.0.1:3100/mcp
 */
import { createServer as createHttpServer } from 'node:http';
import { VERSION } from './version.js';

const PORT = Number(process.env.MCP_HTTP_PORT || 3100);
const HOST = process.env.MCP_HTTP_HOST || '0.0.0.0';

async function handleMcp(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse
) {
  const { default: mcpHandler } = await import('../api/mcp.js');
  await mcpHandler(req as never, res);
}

async function main() {
  const httpServer = createHttpServer((req, res) => {
    const path = req.url?.split('?')[0];

    if (path === '/mcp') {
      void handleMcp(req, res);
      return;
    }

    // Everything else goes through the same gateway as Vercel
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw) (req as { body?: unknown }).body = raw;
      void import('../api/gateway.js').then((m) => m.default(req as never, res));
    });
  });

  httpServer.listen(PORT, HOST, () => {
    console.log(`CocoInbox MCP HTTP v${VERSION} listening on http://127.0.0.1:${PORT}/`);
  });
}

main().catch((err) => {
  console.error('CocoInbox MCP HTTP server failed:', err);
  process.exit(1);
});
