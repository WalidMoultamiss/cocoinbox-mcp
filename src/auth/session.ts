/**
 * In-memory session for one MCP process.
 * Cursor/Claude spawn this server as a subprocess; credentials live only
 * for that process lifetime (never written to disk).
 */

export type SessionUser = {
  id: string;
  email: string;
  name?: string;
  roles?: string[];
  plan_id?: string;
};

export type SessionState = {
  token: string | null;
  user: SessionUser | null;
  /** Selected ephemeral email id (or "fixed") used as send-from default */
  selectedEmailId: string | null;
  selectedEmailAddress: string | null;
};

const session: SessionState = {
  token: process.env.COCOINBOX_TOKEN || null,
  user: null,
  selectedEmailId: null,
  selectedEmailAddress: null,
};

export function getSession(): SessionState {
  return session;
}

export function setAuth(token: string, user: SessionUser): void {
  session.token = token;
  session.user = user;
}

export function clearAuth(): void {
  session.token = null;
  session.user = null;
  session.selectedEmailId = null;
  session.selectedEmailAddress = null;
}

export function selectEmail(emailId: string, emailAddress?: string | null): void {
  session.selectedEmailId = emailId;
  session.selectedEmailAddress = emailAddress ?? null;
}

export function requireAuth(): { token: string; user: SessionUser } {
  if (!session.token) {
    throw new Error(
      'Not authenticated. Call the login tool first with email and password.'
    );
  }
  if (!session.user) {
    throw new Error(
      'Authenticated but user profile missing. Call get_current_user (or login again).'
    );
  }
  return { token: session.token, user: session.user };
}
