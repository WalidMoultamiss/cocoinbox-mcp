/**
 * Single Vercel serverless function for all non-MCP HTTP routes.
 * Keeps the Hobby plan under the 12-function limit (only gateway + mcp).
 */
import home from '../handlers/home.js';
import health from '../handlers/health.js';
import version from '../handlers/version.js';
import login from '../handlers/login.js';
import authForm from '../handlers/auth-form.js';
import oauthAuthorize from '../handlers/oauth-authorize.js';
import oauthToken from '../handlers/oauth-token.js';
import oauthRegister from '../handlers/oauth-register.js';
import oauthProtectedResource from '../handlers/oauth-protected-resource.js';
import oauthAuthorizationServer from '../handlers/oauth-authorization-server.js';
import icon from '../handlers/icon.js';
import favicon from '../handlers/favicon.js';
import appleTouchIcon from '../handlers/apple-touch-icon.js';
import manifest from '../handlers/manifest.js';

export default async function handler(req, res) {
  const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/\/$/, '') || '/';

  try {
    if (path === '/' || path === '') return home(req, res);
    if (path === '/health') return health(req, res);
    if (path === '/version') return version(req, res);
    if (path === '/login' || path === '/api/login') return login(req, res);
    if (path === '/authorize' || path === '/oauth/authorize') return oauthAuthorize(req, res);
    if (path === '/token' || path === '/oauth/token') return oauthToken(req, res);
    if (path === '/register' || path === '/oauth/register') return oauthRegister(req, res);
    if (
      path === '/.well-known/oauth-protected-resource' ||
      path === '/.well-known/oauth-protected-resource/mcp'
    ) {
      return oauthProtectedResource(req, res);
    }
    if (
      path === '/.well-known/oauth-authorization-server' ||
      path === '/.well-known/openid-configuration'
    ) {
      return oauthAuthorizationServer(req, res);
    }
    if (path === '/api/auth-form') return authForm(req, res);
    if (path === '/icon.png') return icon(req, res);
    if (path === '/favicon.ico' || path === '/favicon.png') return favicon(req, res);
    if (path === '/apple-touch-icon.png') return appleTouchIcon(req, res);
    if (path === '/site.webmanifest' || path === '/manifest.webmanifest') {
      return manifest(req, res);
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: 'Not found',
        hint: 'Use /, /login, /authorize, /token, /register, /mcp, /version',
      })
    );
  } catch (err) {
    console.error('Gateway error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error: 'Internal gateway error',
          message: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }
}
