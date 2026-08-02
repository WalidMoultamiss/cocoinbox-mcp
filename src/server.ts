import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ICON_DATA_URI,
  ICON_PNG_URL,
  SITE_LOGO_URL,
  WEBSITE_URL,
} from './brand-icon.js';
import { registerTools } from './tools/register.js';
import { VERSION } from './version.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'cocoinbox-mcp',
    version: `${VERSION}.0.0`,
    title: 'CocoInbox',
    description:
      'CocoInbox MCP — secure ephemeral email, privacy score, dark web tools, and submit/list ideas (title + description)',
    websiteUrl: WEBSITE_URL,
    icons: [
      {
        src: ICON_DATA_URI,
        mimeType: 'image/png',
        sizes: ['any'],
      },
      {
        src: ICON_PNG_URL,
        mimeType: 'image/png',
        sizes: ['48x48', '96x96', '192x192', '512x512'],
      },
      {
        src: SITE_LOGO_URL,
        mimeType: 'image/png',
        sizes: ['any'],
      },
    ],
  });
  registerTools(server);
  return server;
}
