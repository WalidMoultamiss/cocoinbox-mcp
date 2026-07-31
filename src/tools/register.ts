import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as api from '../api/client.js';
import {
  clearAuth,
  getSession,
  requireAuth,
  selectEmail,
  setAuth,
} from '../auth/session.js';

function ok(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: message }],
  };
}

function normalizeUser(raw: Record<string, unknown>) {
  const id = String(raw.id ?? raw._id ?? '');
  return {
    id,
    email: String(raw.email ?? ''),
    name: raw.name ? String(raw.name) : undefined,
    roles: Array.isArray(raw.roles) ? (raw.roles as string[]) : undefined,
    plan_id: raw.plan_id ? String(raw.plan_id) : undefined,
  };
}

export function registerTools(server: McpServer): void {
  server.tool(
    'login',
    'Authenticate against CocoInbox. Stores a Bearer token in this MCP process session. Call this before any mailbox tools.',
    {
      email: z.string().email().describe('CocoInbox account email'),
      password: z.string().min(1).describe('Account password'),
    },
    async ({ email, password }) => {
      try {
        const { token, roles } = await api.login(email, password);
        const me = normalizeUser(
          (await api.getMe(token)) as unknown as Record<string, unknown>
        );
        setAuth(token, { ...me, roles: roles ?? me.roles });
        return ok({
          authenticated: true,
          user: getSession().user,
          apiBaseUrl: api.getApiBaseUrl(),
          hint: 'Next: list_emails, create_email, select_email, then send_email.',
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'logout',
    'Clear the in-memory auth session and selected sender email.',
    {},
    async () => {
      clearAuth();
      return ok({ authenticated: false });
    }
  );

  server.tool(
    'get_current_user',
    'Return the authenticated user profile from GET /api/auth/me. Refreshes local session user.',
    {},
    async () => {
      try {
        const { token } = requireAuth();
        const me = normalizeUser(
          (await api.getMe(token)) as unknown as Record<string, unknown>
        );
        setAuth(token, me);
        return ok({
          user: me,
          selectedEmailId: getSession().selectedEmailId,
          selectedEmailAddress: getSession().selectedEmailAddress,
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'list_emails',
    'List ephemeral email addresses for the logged-in user (GET /api/emails/user/:userId). Use select_email with an id from this list before sending.',
    {},
    async () => {
      try {
        const { user } = requireAuth();
        const emails = await api.listUserEmails(user.id);
        const session = getSession();
        return ok({
          count: emails.length,
          selectedEmailId: session.selectedEmailId,
          selectedEmailAddress: session.selectedEmailAddress,
          emails: emails.map((e) => ({
            id: e.id,
            email_address: e.email_address,
            alias_name: e.alias_name,
            is_active: e.is_active,
            expires_at: e.expires_at,
            is_blackbox: e.is_blackbox,
          })),
          tip: 'Call select_email({ emailId }) to choose the From address for send_email.',
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'create_email',
    'Create a new ephemeral CocoInbox address (POST /api/emails/create). Optionally auto-select it as the send-from address.',
    {
      aliasName: z
        .string()
        .optional()
        .describe('Optional local-part / alias label'),
      durationMinutes: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Lifetime in minutes (plan limits apply). Default is backend default.'),
      isBlackbox: z
        .boolean()
        .optional()
        .describe('Create as blackbox address if plan allows'),
      selectAfterCreate: z
        .boolean()
        .optional()
        .describe('If true (default), select this email for subsequent send_email calls'),
    },
    async ({ aliasName, durationMinutes, isBlackbox, selectAfterCreate }) => {
      try {
        requireAuth();
        const email = await api.createEphemeralEmail({
          aliasName,
          durationMinutes,
          isBlackbox,
        });
        const shouldSelect = selectAfterCreate !== false;
        if (shouldSelect && email?.id) {
          selectEmail(email.id, email.email_address);
        }
        return ok({
          email,
          selected: shouldSelect,
          selectedEmailId: getSession().selectedEmailId,
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'select_email',
    'Select which mailbox address to send from. Pass an id from list_emails, or "fixed" for the user fixed @cocoinbox.com address.',
    {
      emailId: z
        .string()
        .min(1)
        .describe('Ephemeral email id from list_emails, or "fixed"'),
      emailAddress: z
        .string()
        .optional()
        .describe('Optional address string for display in session state'),
    },
    async ({ emailId, emailAddress }) => {
      try {
        const { user } = requireAuth();

        if (emailId === 'fixed') {
          const localPart = (user.email || 'user')
            .split('@')[0]
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
          const address = emailAddress || `${localPart}@cocoinbox.com`;
          selectEmail('fixed', address);
          return ok({
            selectedEmailId: 'fixed',
            selectedEmailAddress: address,
          });
        }

        const emails = await api.listUserEmails(user.id);
        const match = emails.find((e) => e.id === emailId);
        if (!match) {
          return fail(
            new Error(
              `Email id "${emailId}" not found for this user. Call list_emails first.`
            )
          );
        }
        selectEmail(match.id, emailAddress || match.email_address);
        return ok({
          selectedEmailId: match.id,
          selectedEmailAddress: match.email_address,
          alias_name: match.alias_name,
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'get_email',
    'Fetch the message thread for one mailbox address (GET /api/emails/:emailId/messages).',
    {
      emailId: z
        .string()
        .min(1)
        .optional()
        .describe('Ephemeral email id, or "fixed". Defaults to currently selected email.'),
      inboundLimit: z.number().int().positive().max(50).optional(),
    },
    async ({ emailId, inboundLimit }) => {
      try {
        requireAuth();
        const id = emailId || getSession().selectedEmailId;
        if (!id) {
          return fail(
            new Error('No emailId provided and no email selected. Call select_email first.')
          );
        }
        const thread = await api.getEmailThread(id, {
          inboundLimit: inboundLimit ?? 10,
        });
        return ok(thread);
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'send_email',
    'Send an email via POST /api/mail/send. Uses the selected From address unless fromEmailId is passed. Premium/trial required by backend.',
    {
      to: z.string().min(1).describe('Recipient email address'),
      subject: z.string().min(1).describe('Subject line'),
      body: z
        .string()
        .optional()
        .describe('Plain-text body (mapped to text). Prefer this or html.'),
      text: z.string().optional().describe('Plain-text body'),
      html: z.string().optional().describe('HTML body'),
      fromEmailId: z
        .string()
        .optional()
        .describe('Override From: ephemeral email id or "fixed". Falls back to select_email.'),
      isGhostMode: z.boolean().optional(),
      isTrackingEnabled: z.boolean().optional(),
    },
    async (args) => {
      try {
        requireAuth();
        const fromEmailId =
          args.fromEmailId || getSession().selectedEmailId || undefined;
        if (!fromEmailId) {
          return fail(
            new Error(
              'No From address. Call list_emails → select_email (or create_email), then send_email.'
            )
          );
        }
        const text = args.text ?? args.body;
        const result = await api.sendMail({
          to: args.to,
          subject: args.subject,
          text,
          html: args.html,
          fromEmailId,
          isGhostMode: args.isGhostMode,
          isTrackingEnabled: args.isTrackingEnabled,
        });
        return ok({
          sent: true,
          fromEmailId,
          selectedEmailAddress: getSession().selectedEmailAddress,
          result,
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'auth_status',
    'Show whether this MCP process is authenticated and which From address is selected.',
    {},
    async () => {
      const s = getSession();
      return ok({
        authenticated: Boolean(s.token && s.user),
        apiBaseUrl: api.getApiBaseUrl(),
        user: s.user
          ? { id: s.user.id, email: s.user.email, name: s.user.name, plan_id: s.user.plan_id }
          : null,
        selectedEmailId: s.selectedEmailId,
        selectedEmailAddress: s.selectedEmailAddress,
      });
    }
  );
}
