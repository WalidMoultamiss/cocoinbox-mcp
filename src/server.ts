import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools/register.js';
import { VERSION } from './version.js';

const ICON_URL = 'https://cocoinbox-mcp.vercel.app/icon.png';
const SITE_LOGO = 'https://www.cocoinbox.com/imgForLandingPage/Logo.png';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'cocoinbox-mcp',
    version: `${VERSION}.0.0`,
    title: 'CocoInbox',
    description: 'CocoInbox MCP — secure ephemeral email, privacy score, and dark web tools',
    websiteUrl: 'https://www.cocoinbox.com/',
    icons: [
      {
        src: ICON_URL,
        mimeType: 'image/png',
        sizes: ['any'],
      },
      {
        src: SITE_LOGO,
        mimeType: 'image/png',
        sizes: ['any'],
      },
    ],
  });
  registerTools(server);
  return server;
}
