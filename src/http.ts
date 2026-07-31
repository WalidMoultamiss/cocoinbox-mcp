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
  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js'
  );
  const { createServer } = await import('./server.js');

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
}

async function main() {
  const httpServer = createHttpServer((req, res) => {
    const path = req.url?.split('?')[0];

    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Hello World\nversion ${VERSION}`);
      return;
    }

    if (req.method === 'GET' && path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'cocoinbox-mcp', version: VERSION }));
      return;
    }

    if (req.method === 'GET' && path === '/version') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ version: VERSION, service: 'cocoinbox-mcp' }));
      return;
    }

    if (req.method === 'GET' && (path === '/login' || path === '/api/login')) {
      void import('../api/login.js').then((m) => m.default(req, res));
      return;
    }

    if (path === '/api/auth-form') {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        (req as { body?: unknown }).body = raw;
        void import('../api/auth-form.js').then((m) => m.default(req as never, res));
      });
      return;
    }

    if (path === '/mcp') {
      void handleMcp(req, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. Use /, /login, /version, or /mcp' }));
  });

  httpServer.listen(PORT, HOST, () => {
    console.log(`CocoInbox MCP HTTP v${VERSION} listening on http://127.0.0.1:${PORT}/`);
  });
}

main().catch((err) => {
  console.error('CocoInbox MCP HTTP server failed:', err);
  process.exit(1);
});
