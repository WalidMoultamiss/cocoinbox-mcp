import {
  apiBase,
  corsPreflight,
  createRefreshToken,
  readBody,
  sendJson,
  verifyPayload,
  verifyPkceS256,
} from '../lib/oauth.js';

async function validateAccessToken(token) {
  const meRes = await fetch(`${apiBase()}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!meRes.ok) return null;
  const me = await meRes.json().catch(() => null);
  if (!me) return null;
  return {
    id: String(me.id || me._id || ''),
    email: String(me.email || ''),
    name: me.name ? String(me.name) : undefined,
    roles: Array.isArray(me.roles) ? me.roles : undefined,
    plan_id: me.plan_id ? String(me.plan_id) : undefined,
  };
}

export default async function handler(req, res) {
  if (corsPreflight(req, res)) return;
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  try {
    const body = readBody(req);
    const grantType = String(body.grant_type || '');

    if (grantType === 'authorization_code') {
      const code = String(body.code || '');
      const redirectUri = String(body.redirect_uri || '');
      const codeVerifier = String(body.code_verifier || '');
      if (!code || !redirectUri || !codeVerifier) {
        sendJson(res, 400, {
          error: 'invalid_request',
          error_description: 'code, redirect_uri, and code_verifier are required',
        });
        return;
      }

      let payload;
      try {
        payload = verifyPayload(code);
      } catch {
        sendJson(res, 400, { error: 'invalid_grant', error_description: 'Invalid or expired code' });
        return;
      }

      if (payload.kind !== 'oauth_code') {
        sendJson(res, 400, { error: 'invalid_grant', error_description: 'Not an OAuth authorization code' });
        return;
      }
      if (String(payload.redirect_uri) !== redirectUri) {
        sendJson(res, 400, { error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
        return;
      }
      if (!verifyPkceS256(codeVerifier, payload.code_challenge)) {
        sendJson(res, 400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
        return;
      }
      if (!payload.token || !payload.user?.id) {
        sendJson(res, 400, { error: 'invalid_grant', error_description: 'Code missing credentials' });
        return;
      }

      const refresh = createRefreshToken(payload.token, payload.user);
      sendJson(res, 200, {
        access_token: payload.token,
        token_type: 'Bearer',
        expires_in: 30 * 60,
        refresh_token: refresh,
        scope: payload.scope || 'mcp',
      });
      return;
    }

    if (grantType === 'refresh_token') {
      const refreshToken = String(body.refresh_token || '');
      let payload;
      try {
        payload = verifyPayload(refreshToken);
      } catch {
        sendJson(res, 400, { error: 'invalid_grant', error_description: 'Invalid or expired refresh token' });
        return;
      }
      if (payload.kind !== 'refresh' || !payload.token) {
        sendJson(res, 400, { error: 'invalid_grant', error_description: 'Not a refresh token' });
        return;
      }

      const user = await validateAccessToken(payload.token);
      if (!user) {
        sendJson(res, 400, {
          error: 'invalid_grant',
          error_description: 'Access token no longer valid — reconnect the connector',
        });
        return;
      }

      const refresh = createRefreshToken(payload.token, user);
      sendJson(res, 200, {
        access_token: payload.token,
        token_type: 'Bearer',
        expires_in: 30 * 60,
        refresh_token: refresh,
        scope: 'mcp',
      });
      return;
    }

    sendJson(res, 400, {
      error: 'unsupported_grant_type',
      error_description: 'Use authorization_code or refresh_token',
    });
  } catch (err) {
    sendJson(res, 500, {
      error: 'server_error',
      error_description: err instanceof Error ? err.message : String(err),
    });
  }
}
