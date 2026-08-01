import { publicBase, sendJson, corsPreflight } from './lib/oauth.js';

/** RFC 8414 Authorization Server Metadata */
export default function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }
  const base = publicBase(req);
  sendJson(res, 200, {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp', 'openid', 'offline_access'],
    client_id_metadata_document_supported: true,
  });
}
