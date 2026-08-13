/**
 * Semantic presentation payloads for MCP tools (see doc.md).
 * Shape data for AI clients to render as tables/cards — not raw API dumps.
 */

export type PresentColumn = { key: string; label: string };

export type PresentTable = {
  content: {
    type: 'table';
    title: string;
    columns: PresentColumn[];
    rows: Record<string, string | number | boolean | null>[];
    empty?: string;
  };
  meta?: Record<string, unknown>;
};

export type PresentCard = {
  content: {
    type: 'card' | 'details';
    title: string;
    fields: { label: string; value: string | number | boolean | null }[];
  };
  meta?: Record<string, unknown>;
};

const PRESENT_HINT =
  'Present as a Markdown table using content.columns and content.rows. Do not dump raw JSON unless the user asks. If rows are empty, show content.empty.';

export function tablePayload(input: {
  title: string;
  columns: PresentColumn[];
  rows: Record<string, string | number | boolean | null>[];
  empty?: string;
  meta?: Record<string, unknown>;
}): PresentTable & { _present: string } {
  return {
    content: {
      type: 'table',
      title: input.title,
      columns: input.columns,
      rows: input.rows,
      empty: input.empty ?? 'Nothing to show.',
    },
    meta: input.meta,
    _present: PRESENT_HINT,
  };
}

const LOGIN_PRESENT =
  'Show a short connect card (title + one sentence + the login link/button). ' +
  'Do NOT paste multi-step instructions. Do NOT ask for email/password in chat. ' +
  'If content.portal_opened is true, say the secure login window should already be open. ' +
  'Only if the user pastes an auth code, call complete_login({ code }).';

/** Claude/Cursor-friendly connect card instead of long paste-the-code instructions */
export function loginPortalPayload(input: {
  loginUrl: string;
  portalOpened?: boolean;
  reason?: string;
}) {
  return {
    authenticated: false,
    content: {
      type: 'login_portal',
      title: 'Connect CocoInbox',
      body: 'Sign in once in the secure window. Passwords never go in chat.',
      url: input.loginUrl,
      portal_opened: !!input.portalOpened,
      primary_action: { label: 'Open secure login', url: input.loginUrl },
    },
    meta: {
      reason: input.reason || 'not_authenticated',
      oauth_hint:
        'Clients with MCP OAuth (Claude / Cursor Authenticate) can connect without pasting a code.',
      if_code_shown:
        'After sign-in, if a one-time code appears, the user can paste it once — then call complete_login.',
    },
    _present: LOGIN_PRESENT,
  };
}

export function clip(s: unknown, max = 120): string {
  const t = String(s ?? '').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function asList<T>(raw: unknown, key: string): T[] {
  if (!raw || typeof raw !== 'object') return [];
  const v = (raw as Record<string, unknown>)[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

export function isAuthError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /not authenticated|auth session|call the login|login tool|auth code/i.test(
    message
  );
}
