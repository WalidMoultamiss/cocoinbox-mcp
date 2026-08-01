import { publicBase, sendJson, corsPreflight } from '../lib/oauth.js';

/** RFC 9728 Protected Resource Metadata */
export default function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }
  const base = publicBase(req);
  sendJson(res, 200, {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp', 'openid', 'offline_access'],
  });
}
