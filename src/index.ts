/**
 * Stdio MCP entry — used by Cursor / Claude Desktop (local subprocess).
 * No frontend/backend build required. Talks to COCOINBOX_API_URL.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('CocoInbox MCP server failed to start:', err);
  process.exit(1);
});
