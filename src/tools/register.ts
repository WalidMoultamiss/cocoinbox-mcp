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
import { asList, clip, tablePayload } from '../present.js';

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

/** Compact JSON for CRM — fewer tokens for AI agents */
function okCompact(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data),
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
    'Return the authenticated user profile from GET /api/auth/me (includes company when set).',
    {},
    async () => {
      try {
        const { token } = requireAuth();
        const raw = (await api.getMe(token)) as unknown as Record<string, unknown>;
        const me = normalizeUser(raw);
        setAuth(token, me);
        return ok({
          user: me,
          company: raw.company ?? null,
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
    'Send an email via POST /api/mail/send using the selected From address. Automatically moves the sent message into the "MCP" dossier.',
    {
      to: z.string().min(1),
      subject: z.string().min(1),
      body: z.string().optional(),
      text: z.string().optional(),
      html: z.string().optional(),
      fromEmailId: z.string().optional(),
      isGhostMode: z.boolean().optional(),
      isTrackingEnabled: z.boolean().optional(),
      folder: z
        .string()
        .optional()
        .describe('Dossier to move the sent mail into (default: MCP)'),
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
        const targetFolder = (args.folder || 'MCP').trim() || 'MCP';

        // Ensure the MCP dossier exists (ignore "already exists")
        try {
          await api.createFolder(targetFolder);
        } catch {
          /* folder may already exist */
        }

        const result = await api.sendMail({
          to: args.to,
          subject: args.subject,
          text,
          html: args.html,
          fromEmailId,
          isGhostMode: args.isGhostMode,
          isTrackingEnabled: args.isTrackingEnabled,
        });

        let moved: unknown = null;
        let sentMessageId: string | null = null;
        try {
          // Send API does not return id — pick the newest matching sent item
          const sent = await api.listSentEmails();
          const match = sent.find(
            (m) =>
              String(m.to || '').toLowerCase() === args.to.toLowerCase() &&
              String(m.subject || '') === args.subject
          ) || sent[0];
          sentMessageId = match
            ? String(match.id || match._id || '')
            : null;
          if (sentMessageId) {
            moved = await api.moveMessageToFolder(sentMessageId, targetFolder);
          }
        } catch (moveErr) {
          moved = {
            error: moveErr instanceof Error ? moveErr.message : String(moveErr),
          };
        }

        return ok({
          sent: true,
          fromEmailId,
          selectedEmailAddress: getSession().selectedEmailAddress,
          folder: targetFolder,
          sentMessageId,
          moved,
          result,
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  const ideaSchema = {
    title: z
      .string()
      .min(2)
      .max(160)
      .describe('Short title of the idea, e.g. "List calendar events"'),
    description: z
      .string()
      .min(5)
      .max(4000)
      .describe('What the idea should enable and why it is needed'),
  };

  const submitIdeaHandler = async ({
    title,
    description,
  }: {
    title: string;
    description: string;
  }) => {
    try {
      requireAuth();
      const result = await api.submitIdea({ title, description });
      return ok({
        saved: true,
        message:
          'Idea saved. The user can see it in CocoInbox → Ideas (/ideas). Admins see it under Admin → MCP Requests.',
        result,
      });
    } catch (err) {
      return fail(err);
    }
  };

  const listIdeasHandler = async () => {
    try {
      requireAuth();
      const result = await api.listMyIdeas();
      return ok(result);
    } catch (err) {
      return fail(err);
    }
  };

  server.tool(
    'submit_idea',
    'Save an idea to the user\'s CocoInbox account (title + description). Same as the Ideas page on the website. Use when the user wants to note a product/feature wish, or when no existing MCP tool covers their need — do not invent fake tools.',
    ideaSchema,
    submitIdeaHandler
  );

  server.tool(
    'list_my_ideas',
    'List ideas (title + description + status) previously submitted for this authenticated account. Same data as CocoInbox → Ideas (/ideas).',
    {},
    listIdeasHandler
  );

  // Aliases (older names)
  server.tool(
    'request_missing_tool',
    'Alias for submit_idea. Prefer submit_idea.',
    ideaSchema,
    submitIdeaHandler
  );

  server.tool(
    'list_my_tool_requests',
    'Alias for list_my_ideas. Prefer list_my_ideas.',
    {},
    listIdeasHandler
  );

  /* ─── CRM: lead groups → leads → prospect tasks (never auto-sends) ─── */

  const leadItemSchema = z.object({
    name: z.string().min(2).max(200).describe('Contact or place name'),
    email: z.string().email().optional().describe('Email if found'),
    phone: z.string().max(60).optional(),
    company: z.string().max(200).optional().describe('Business name'),
    address: z.string().max(400).optional(),
    city: z.string().max(120).optional(),
    country: z.string().max(120).optional(),
    map_url: z.string().max(800).optional().describe('Google Maps / OSM URL'),
    website: z.string().max(400).optional(),
    has_website: z.boolean().optional().describe('false when no website found'),
    notes: z.string().max(4000).optional(),
    tags: z.array(z.string().max(40)).max(10).optional(),
  });

  server.tool(
    'crm_summary',
    'Compact CRM counts for this user (groups, leads, tasks todo). Start here to see state without loading full lists.',
    {},
    async () => {
      try {
        requireAuth();
        return okCompact(await api.crmSummary());
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'crm_create_group',
    'Create a lead group (campaign). REQUIRED: name + why (outreach reason, e.g. "car garages without websites in Casablanca → pitch website build"). Also set source_ai (claude|grok|cursor|manual) and optional location. Returns group id for crm_add_leads.',
    {
      name: z.string().min(2).max(160).describe('Group name, e.g. "Garages Casablanca sans site"'),
      why: z
        .string()
        .min(8)
        .max(2000)
        .describe(
          'Why these leads exist and what to offer. Used when generating prospect email tasks.'
        ),
      source_ai: z
        .string()
        .max(80)
        .optional()
        .describe('Which AI created this group: claude | grok | cursor | manual'),
      location: z.string().max(200).optional().describe('e.g. Casablanca, Morocco'),
      notes: z.string().max(4000).optional(),
    },
    async (args) => {
      try {
        requireAuth();
        const result = await api.crmCreateGroup({
          name: args.name,
          why: args.why,
          source_ai: args.source_ai || 'mcp',
          location: args.location,
          notes: args.notes,
        });
        return okCompact({
          ...(result as object),
          next: 'Call crm_add_leads with this group.id and up to 25 leads, then crm_generate_prospect_tasks.',
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'crm_list_groups',
    `List CRM lead groups (token-friendly table). Filter: status active|paused|archived.

When presenting the result:
- Display as a Markdown table using content.columns / content.rows.
- Do not output raw JSON unless the user asks.
- For empty results, show content.empty.
- Keep why short; full why is in crm_get_group.`,
    {
      status: z.enum(['active', 'paused', 'archived']).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ status, limit }) => {
      try {
        requireAuth();
        const raw = await api.crmListGroups({ status, limit });
        const groups = asList<Record<string, unknown>>(raw, 'groups');
        return okCompact(
          tablePayload({
            title: 'CRM lead groups',
            columns: [
              { key: 'id', label: 'ID' },
              { key: 'name', label: 'Name' },
              { key: 'why', label: 'Why' },
              { key: 'source_ai', label: 'AI' },
              { key: 'location', label: 'Location' },
              { key: 'leads', label: 'Leads' },
              { key: 'status', label: 'Status' },
            ],
            rows: groups.map((g) => ({
              id: clip(g.id, 40),
              name: clip(g.name, 60),
              why: clip(g.why, 80),
              source_ai: clip(g.source_ai, 20),
              location: clip(g.location, 40) || '—',
              leads: Number(g.lead_count ?? 0),
              status: clip(g.status, 20),
            })),
            empty: 'No lead groups yet. Create one with crm_create_group (name + why).',
            meta: {
              count: groups.length,
              next: 'crm_list_leads({ group_id }) or crm_get_group({ group_id })',
            },
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'crm_get_group',
    'Get one lead group by id (includes why / source_ai / location).',
    {
      group_id: z.string().min(1).describe('Group id from crm_create_group or crm_list_groups'),
    },
    async ({ group_id }) => {
      try {
        requireAuth();
        return okCompact(await api.crmGetGroup(group_id));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'crm_add_leads',
    'Add up to 25 leads to a group you own. Include name, email, phone, company, address, city, map_url, website, has_website=false when no site. Private to this user — no cross-user leak.',
    {
      group_id: z.string().min(1),
      leads: z.array(leadItemSchema).min(1).max(25),
    },
    async ({ group_id, leads }) => {
      try {
        requireAuth();
        const result = await api.crmAddLeads(group_id, leads);
        return okCompact({
          ...(result as object),
          next: 'If leads have emails, call crm_generate_prospect_tasks(group_id). Do NOT auto-send — review drafts then send_email.',
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'crm_list_leads',
    `List CRM leads as a table (optional group_id / with_email / status).

When presenting the result:
- Display as a Markdown table using content.columns / content.rows.
- Do not output raw JSON unless the user asks.
- For empty results, show content.empty.
- Prefer company + name; show "sans site" when has_website is false.`,
    {
      group_id: z.string().optional(),
      status: z.string().optional(),
      with_email: z.boolean().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async (args) => {
      try {
        requireAuth();
        const raw = await api.crmListLeads(args);
        const leads = asList<Record<string, unknown>>(raw, 'leads');
        return okCompact(
          tablePayload({
            title: args.group_id ? `Leads · group ${args.group_id}` : 'CRM leads',
            columns: [
              { key: 'id', label: 'ID' },
              { key: 'name', label: 'Name' },
              { key: 'company', label: 'Company' },
              { key: 'email', label: 'Email' },
              { key: 'city', label: 'City' },
              { key: 'website', label: 'Website' },
              { key: 'has_website', label: 'Has site' },
              { key: 'status', label: 'Status' },
              { key: 'map', label: 'Map' },
            ],
            rows: leads.map((l) => ({
              id: clip(l.id, 40),
              name: clip(l.name, 40),
              company: clip(l.company, 40) || '—',
              email: clip(l.email, 60) || '—',
              city: clip(
                [l.city, l.country].filter((x) => x).map(String).join(', '),
                40
              ) || '—',
              website: clip(l.website, 40) || '—',
              has_website: l.has_website ? 'yes' : 'no',
              status: clip(l.status, 20),
              map: clip(l.map_url, 50) || '—',
            })),
            empty: args.with_email
              ? 'No leads with email. Add emails via crm_add_leads / crm_update_lead.'
              : 'No leads. Add with crm_add_leads.',
            meta: {
              count: leads.length,
              group_id: args.group_id || null,
              with_email: !!args.with_email,
              next: 'crm_generate_prospect_tasks({ group_id }) for leads with email',
            },
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'crm_generate_prospect_tasks',
    'For a group: create email_prospect tasks for leads that have emails. Each task brief + draft uses group.why. Never sends email — returns drafts. After review, send with send_email and mark task done via crm_update_task.',
    {
      group_id: z.string().min(1),
      only_with_email: z.boolean().optional().describe('Default true'),
      limit: z.number().int().min(1).max(25).optional(),
    },
    async ({ group_id, only_with_email, limit }) => {
      try {
        requireAuth();
        return okCompact(
          await api.crmGenerateProspectTasks(group_id, {
            only_with_email,
            limit,
            created_by: 'mcp',
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'crm_list_tasks',
    `List CRM tasks as a table (optional group_id / status todo|doing|done|cancelled).

When presenting the result:
- Display as a Markdown table using content.columns / content.rows.
- Do not output raw JSON unless the user asks.
- For empty results, show content.empty.
- After sending a prospect email with send_email, mark the task done via crm_update_task.`,
    {
      group_id: z.string().optional(),
      status: z.enum(['todo', 'doing', 'done', 'cancelled']).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async (args) => {
      try {
        requireAuth();
        const raw = await api.crmListTasks(args);
        const tasks = asList<Record<string, unknown>>(raw, 'tasks');
        return okCompact(
          tablePayload({
            title: args.group_id ? `Tasks · group ${args.group_id}` : 'CRM tasks',
            columns: [
              { key: 'id', label: 'ID' },
              { key: 'title', label: 'Title' },
              { key: 'type', label: 'Type' },
              { key: 'status', label: 'Status' },
              { key: 'draft_subject', label: 'Draft subject' },
              { key: 'lead_id', label: 'Lead' },
              { key: 'created_by', label: 'By' },
            ],
            rows: tasks.map((t) => ({
              id: clip(t.id, 40),
              title: clip(t.title, 60),
              type: clip(t.type, 24),
              status: clip(t.status, 16),
              draft_subject: clip(t.draft_subject, 50) || '—',
              lead_id: clip(t.lead_id, 40) || '—',
              created_by: clip(t.created_by, 16),
            })),
            empty: 'No tasks. Generate with crm_generate_prospect_tasks({ group_id }).',
            meta: {
              count: tasks.length,
              group_id: args.group_id || null,
              status: args.status || null,
              next: 'Review draft → send_email → crm_update_task({ task_id, status: "done" })',
            },
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'crm_update_lead',
    'Update one of your leads (status, email, notes, etc.). Ownership enforced server-side.',
    {
      lead_id: z.string().min(1),
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      company: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
      map_url: z.string().optional(),
      website: z.string().optional(),
      has_website: z.boolean().optional(),
      notes: z.string().optional(),
      status: z
        .enum(['new', 'contacted', 'replied', 'qualified', 'won', 'lost', 'skipped'])
        .optional(),
    },
    async ({ lead_id, ...patch }) => {
      try {
        requireAuth();
        const clean = Object.fromEntries(
          Object.entries(patch).filter(([, v]) => v !== undefined)
        );
        return okCompact(await api.crmUpdateLead(lead_id, clean));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'crm_update_task',
    'Update a CRM task status or draft. After sending prospect email via send_email, set status=done.',
    {
      task_id: z.string().min(1),
      status: z.enum(['todo', 'doing', 'done', 'cancelled']).optional(),
      title: z.string().optional(),
      brief: z.string().optional(),
      draft_subject: z.string().optional(),
      draft_body: z.string().optional(),
    },
    async ({ task_id, ...patch }) => {
      try {
        requireAuth();
        const clean = Object.fromEntries(
          Object.entries(patch).filter(([, v]) => v !== undefined)
        );
        return okCompact(await api.crmUpdateTask(task_id, clean));
      } catch (err) {
        return fail(err);
      }
    }
  );

  /* ─── Company profile (sender identity for refined prospecting) ─── */

  server.tool(
    'get_company_profile',
    `Get the user's company profile + generated report (name, what they do, offer, audience).

When presenting:
- Summarize the company clearly (name, what they do, offer).
- If configured=false, tell the user to fill Profil → Entreprise or call update_company_profile.
- Use this before creating CRM groups / prospect tasks so outreach matches the real business.`,
    {},
    async () => {
      try {
        requireAuth();
        return okCompact(await api.getCompanyProfile());
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'update_company_profile',
    `Save/update the sender company profile. Regenerates an AI report used to refine CRM prospect emails.

Required: name OR description. Prefer filling name, description (what you do), and offer (what you pitch).`,
    {
      name: z.string().min(2).max(160).optional().describe('Company / brand name'),
      description: z
        .string()
        .min(8)
        .max(2000)
        .optional()
        .describe('What the company does'),
      offer: z
        .string()
        .max(2000)
        .optional()
        .describe('What you sell / pitch to leads'),
      industry: z.string().max(120).optional(),
      website: z.string().max(400).optional(),
      location: z.string().max(200).optional(),
      audience: z.string().max(500).optional().describe('Who you sell to'),
    },
    async (args) => {
      try {
        requireAuth();
        if (!args.name && !args.description) {
          return fail(new Error('Provide at least name or description'));
        }
        const result = await api.updateCompanyProfile(args);
        return okCompact({
          ...(result as object),
          next: 'Call crm_create_group / crm_generate_prospect_tasks — drafts will use this company report.',
        });
      } catch (err) {
        return fail(err);
      }
    }
  );
}
