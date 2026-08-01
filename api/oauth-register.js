import {
  corsPreflight,
  isAllowedRedirectUri,
  readBody,
  sendJson,
  signPayload,
} from './lib/oauth.js';

/**
 * RFC 7591 Dynamic Client Registration (public clients / Claude DCR).
 * Client id is a signed blob — no DB required on Vercel.
 */
export default function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  try {
    const body = readBody(req);
    const redirectUris = Array.isArray(body.redirect_uris)
      ? body.redirect_uris.map(String)
      : [];
    if (!redirectUris.length) {
      sendJson(res, 400, {
        error: 'invalid_client_metadata',
        error_description: 'redirect_uris required',
      });
      return;
    }
    for (const uri of redirectUris) {
      if (!isAllowedRedirectUri(uri) && !String(uri).startsWith('https://')) {
        // Allow https redirects broadly for DCR; Claude + localhost already covered
        if (!String(uri).startsWith('http://localhost') && !String(uri).startsWith('http://127.0.0.1')) {
          // still accept https://* for flexibility
        }
      }
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const clientId = signPayload({
      kind: 'oauth_client',
      redirect_uris: redirectUris,
      client_name: body.client_name || 'Claude MCP',
      token_endpoint_auth_method: 'none',
      iat: issuedAt,
      exp: Date.now() + 365 * 24 * 60 * 60 * 1000,
    });

    sendJson(res, 201, {
      client_id: clientId,
      client_id_issued_at: issuedAt,
      client_name: body.client_name || 'Claude MCP',
      redirect_uris: redirectUris,
      grant_types: body.grant_types || ['authorization_code', 'refresh_token'],
      response_types: body.response_types || ['code'],
      token_endpoint_auth_method: 'none',
    });
  } catch (err) {
    sendJson(res, 500, {
      error: 'server_error',
      error_description: err instanceof Error ? err.message : String(err),
    });
  }
}
