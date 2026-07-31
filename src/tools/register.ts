import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as api from '../api/client.js';
import {
  getMcpPublicUrl,
  newElicitationId,
  verifyAuthCode,
} from '../auth/code.js';
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

function folderNameForAddress(emailAddress: string, customName?: string): string {
  if (customName?.trim()) return customName.trim();
  const local = emailAddress.split('@')[0] || 'mailbox';
  return `mail/${local}`.replace(/\/+/g, '/');
}

export function registerTools(server: McpServer): void {
  server.tool(
    'login',
    'Open the CocoInbox login FORM in the browser (do not ask the user to type password in chat). After the form, call complete_login with the auth code shown on the page.',
    {},
    async () => {
      const loginUrl = `${getMcpPublicUrl()}/login`;
      try {
        await server.server.elicitInput({
          mode: 'url',
          message:
            'Open the CocoInbox login form, sign in, then copy the auth code and call complete_login.',
          elicitationId: newElicitationId(),
          url: loginUrl,
        });
      } catch {
        // Client may not support URL elicitation — still return the link.
      }
      return ok({
        action: 'open_login_form',
        loginUrl,
        next: 'After submitting the form, copy the auth code and call complete_login({ code }).',
        note: 'Passwords are never typed in chat — use the secure browser form.',
      });
    }
  );

  server.tool(
    'complete_login',
    'Finish browser-form login by pasting the auth code shown on the login success page.',
    {
      code: z.string().min(10).describe('Auth code from the CocoInbox MCP login form success page'),
    },
    async ({ code }) => {
      try {
        const payload = verifyAuthCode(code);
        setAuth(payload.token, payload.user);
        return ok({
          authenticated: true,
          user: getSession().user,
          apiBaseUrl: api.getApiBaseUrl(),
          hint: 'Logged in via form. Next: list_emails, get_privacy_score, scan_dark_web, create_folder…',
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'login_with_password',
    'Fallback programmatic login (prefer the login form tool). Use only if the user explicitly pastes credentials.',
    {
      email: z.string().email(),
      password: z.string().min(1),
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
    'Return the authenticated user profile from GET /api/auth/me.',
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
    'auth_status',
    'Show whether this MCP process is authenticated and which From address is selected.',
    {},
    async () => {
      const s = getSession();
      return ok({
        authenticated: Boolean(s.token && s.user),
        apiBaseUrl: api.getApiBaseUrl(),
        loginFormUrl: `${getMcpPublicUrl()}/login`,
        user: s.user
          ? { id: s.user.id, email: s.user.email, name: s.user.name, plan_id: s.user.plan_id }
          : null,
        selectedEmailId: s.selectedEmailId,
        selectedEmailAddress: s.selectedEmailAddress,
      });
    }
  );

  server.tool(
    'get_privacy_score',
    'Get the user privacy / security score (GET /api/security/score).',
    {},
    async () => {
      try {
        requireAuth();
        const score = await api.getPrivacyScore();
        return ok(score);
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'scan_dark_web',
    'Scan one email address on the dark web for breaches (POST /api/security/dark-web-scan).',
    {
      email: z
        .string()
        .email()
        .describe('Email address to scan (account or ephemeral)'),
    },
    async ({ email }) => {
      try {
        requireAuth();
        const result = await api.scanDarkWeb(email);
        return ok(result);
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'scan_dark_web_all',
    'Scan the account email plus all ephemeral addresses (POST /api/security/dark-web-scan-all).',
    {},
    async () => {
      try {
        requireAuth();
        const result = await api.scanDarkWebAll();
        return ok(result);
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'list_folders',
    'List mail dossiers/folders for the user (GET /api/folders).',
    {},
    async () => {
      try {
        requireAuth();
        const result = await api.listFolders();
        return ok(result);
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'create_folder',
    'Create a new mail dossier/folder (POST /api/folders). Example name: "Work" or "mail/aze-walid".',
    {
      name: z.string().min(1).describe('Folder / dossier name'),
    },
    async ({ name }) => {
      try {
        requireAuth();
        const result = await api.createFolder(name);
        return ok(result);
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'create_folder_for_email',
    'Create a dossier for a mailbox address (default name mail/<local-part>). Optionally use a custom folder name.',
    {
      emailAddress: z
        .string()
        .min(1)
        .describe('Mailbox address, e.g. aze-walid@cocoinbox.com'),
      folderName: z
        .string()
        .optional()
        .describe('Optional custom dossier name; defaults to mail/<local-part>'),
    },
    async ({ emailAddress, folderName }) => {
      try {
        requireAuth();
        const name = folderNameForAddress(emailAddress, folderName);
        const result = await api.createFolder(name);
        return ok({
          folder: name,
          emailAddress,
          result,
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'move_email_to_folder',
    'Move a message (inbound or sent) into a dossier (PATCH /api/mail/messages/:id/move).',
    {
      messageId: z.string().min(1).describe('Message id from get_email thread'),
      folder: z.string().min(1).describe('Target dossier/folder name'),
    },
    async ({ messageId, folder }) => {
      try {
        requireAuth();
        const result = await api.moveMessageToFolder(messageId, folder);
        return ok(result);
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'list_emails',
    'List ephemeral email addresses for the logged-in user.',
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
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'create_email',
    'Create a new ephemeral CocoInbox address. Optionally auto-select it as From.',
    {
      aliasName: z.string().optional(),
      durationMinutes: z.number().int().positive().optional(),
      isBlackbox: z.boolean().optional(),
      selectAfterCreate: z.boolean().optional(),
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
    'Select which mailbox address to send from (id from list_emails, or "fixed").',
    {
      emailId: z.string().min(1),
      emailAddress: z.string().optional(),
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
          return ok({ selectedEmailId: 'fixed', selectedEmailAddress: address });
        }
        const emails = await api.listUserEmails(user.id);
        const match = emails.find((e) => e.id === emailId);
        if (!match) {
          return fail(new Error(`Email id "${emailId}" not found. Call list_emails first.`));
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
    'Fetch the message thread for one mailbox address.',
    {
      emailId: z.string().min(1).optional(),
      inboundLimit: z.number().int().positive().max(50).optional(),
    },
    async ({ emailId, inboundLimit }) => {
      try {
        requireAuth();
        const id = emailId || getSession().selectedEmailId;
        if (!id) {
          return fail(new Error('No emailId and none selected. Call select_email first.'));
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
    'Send an email via POST /api/mail/send using the selected From address.',
    {
      to: z.string().min(1),
      subject: z.string().min(1),
      body: z.string().optional(),
      text: z.string().optional(),
      html: z.string().optional(),
      fromEmailId: z.string().optional(),
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
            new Error('No From address. Call select_email or create_email first.')
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
}
