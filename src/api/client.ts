/**
 * Thin REST client for the existing CocoInbox backend.
 * No business logic — only HTTP mapping.
 */

import { getSession, requireAuth, type SessionUser } from '../auth/session.js';

const DEFAULT_API_URL = 'http://localhost:4000';

export function getApiBaseUrl(): string {
  return (process.env.COCOINBOX_API_URL || DEFAULT_API_URL).replace(/\/$/, '');
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}


async function request<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const url = `${getApiBaseUrl()}${path}`;

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string> | undefined),
  };

  if (rest.body && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  if (auth) {
    const { token } = requireAuth();
    finalHeaders.Authorization = `Bearer ${token}`;
  } else if (getSession().token) {
    finalHeaders.Authorization = `Bearer ${getSession().token}`;
  }

  const res = await fetch(url, { ...rest, headers: finalHeaders });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : null) ||
      (data && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : null) ||
      `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, data);
  }

  return data as T;
}

export type LoginResult = { token: string; roles?: string[] };

export async function login(email: string, password: string): Promise<LoginResult> {
  return request<LoginResult>('/api/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe(token?: string): Promise<SessionUser> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return request<SessionUser>('/api/auth/me', {
    method: 'GET',
    auth: !token,
    headers,
  });
}

export type EphemeralEmail = {
  id: string;
  user_id: string;
  email_address: string;
  alias_name?: string;
  expires_at?: string;
  is_active?: boolean;
  created_at?: string;
  is_blackbox?: boolean;
};

export async function listUserEmails(userId: string): Promise<EphemeralEmail[]> {
  return request<EphemeralEmail[]>(`/api/emails/user/${userId}`, { method: 'GET' });
}

export async function createEphemeralEmail(input: {
  aliasName?: string;
  durationMinutes?: number;
  isBlackbox?: boolean;
}): Promise<EphemeralEmail> {
  return request<EphemeralEmail>('/api/emails/create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getEmailThread(
  emailId: string,
  query?: { inboundPage?: number; inboundLimit?: number }
): Promise<unknown> {
  const params = new URLSearchParams();
  if (query?.inboundPage) params.set('inboundPage', String(query.inboundPage));
  if (query?.inboundLimit) params.set('inboundLimit', String(query.inboundLimit));
  const qs = params.toString();
  return request(`/api/emails/${emailId}/messages${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

export type SendEmailInput = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  fromEmailId?: string;
  isGhostMode?: boolean;
  isTrackingEnabled?: boolean;
};

export async function sendMail(input: SendEmailInput): Promise<unknown> {
  return request('/api/mail/send', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type SentEmailItem = {
  id?: string;
  _id?: string;
  to?: string;
  subject?: string;
  folder?: string;
  sent_at?: string;
};

export async function listSentEmails(): Promise<SentEmailItem[]> {
  const data = await request<SentEmailItem[] | { items?: SentEmailItem[] }>(
    '/api/mail/sent',
    { method: 'GET' }
  );
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

export async function getPrivacyScore(): Promise<unknown> {
  return request('/api/security/score', { method: 'GET' });
}

export async function scanDarkWeb(email: string): Promise<unknown> {
  return request('/api/security/dark-web-scan', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function scanDarkWebAll(): Promise<unknown> {
  return request('/api/security/dark-web-scan-all', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function listFolders(): Promise<{ success?: boolean; folders?: string[] }> {
  return request('/api/folders', { method: 'GET' });
}

export async function createFolder(name: string): Promise<{ success?: boolean; folders?: string[] }> {
  return request('/api/folders', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function moveMessageToFolder(
  messageId: string,
  folder: string
): Promise<unknown> {
  return request(`/api/mail/messages/${messageId}/move`, {
    method: 'PATCH',
    body: JSON.stringify({ folder }),
  });
}

export type IdeaInput = {
  title: string;
  description: string;
};

/** Submit an idea (title + description) to the user's CocoInbox account. */
export async function submitIdea(input: IdeaInput): Promise<unknown> {
  return request('/api/mcp/tool-requests', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      description: input.description,
      source: 'mcp',
    }),
  });
}

/** @deprecated use submitIdea */
export const requestMissingTool = submitIdea;

export async function listMyIdeas(): Promise<unknown> {
  return request('/api/mcp/tool-requests/mine', { method: 'GET' });
}

/** @deprecated use listMyIdeas */
export const listMyToolRequests = listMyIdeas;

/* ─── CRM (private, scoped to authenticated user) ─── */

export type CrmLeadInput = {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  city?: string;
  country?: string;
  map_url?: string;
  website?: string;
  has_website?: boolean;
  notes?: string;
  tags?: string[];
};

export async function crmCreateGroup(input: {
  name: string;
  why: string;
  source_ai?: string;
  location?: string;
  notes?: string;
}): Promise<unknown> {
  return request('/api/crm/groups', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function crmListGroups(query?: {
  status?: string;
  limit?: number;
}): Promise<unknown> {
  const params = new URLSearchParams();
  if (query?.status) params.set('status', query.status);
  if (query?.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return request(`/api/crm/groups${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export async function crmGetGroup(groupId: string): Promise<unknown> {
  return request(`/api/crm/groups/${encodeURIComponent(groupId)}`, { method: 'GET' });
}

export async function crmAddLeads(groupId: string, leads: CrmLeadInput[]): Promise<unknown> {
  return request(`/api/crm/groups/${encodeURIComponent(groupId)}/leads`, {
    method: 'POST',
    body: JSON.stringify({ leads }),
  });
}

export async function crmListLeads(query?: {
  group_id?: string;
  status?: string;
  with_email?: boolean;
  limit?: number;
}): Promise<unknown> {
  const params = new URLSearchParams();
  if (query?.group_id) params.set('group_id', query.group_id);
  if (query?.status) params.set('status', query.status);
  if (query?.with_email) params.set('with_email', '1');
  if (query?.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return request(`/api/crm/leads${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export async function crmGenerateProspectTasks(
  groupId: string,
  opts?: { only_with_email?: boolean; limit?: number; created_by?: string }
): Promise<unknown> {
  return request(`/api/crm/groups/${encodeURIComponent(groupId)}/generate-tasks`, {
    method: 'POST',
    body: JSON.stringify({
      only_with_email: opts?.only_with_email,
      limit: opts?.limit,
      created_by: opts?.created_by || 'mcp',
    }),
  });
}

export async function crmListTasks(query?: {
  group_id?: string;
  status?: string;
  limit?: number;
}): Promise<unknown> {
  const params = new URLSearchParams();
  if (query?.group_id) params.set('group_id', query.group_id);
  if (query?.status) params.set('status', query.status);
  if (query?.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return request(`/api/crm/tasks${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export async function crmUpdateLead(
  leadId: string,
  patch: Record<string, unknown>
): Promise<unknown> {
  return request(`/api/crm/leads/${encodeURIComponent(leadId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function crmUpdateTask(
  taskId: string,
  patch: Record<string, unknown>
): Promise<unknown> {
  return request(`/api/crm/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function crmSummary(): Promise<unknown> {
  return request('/api/crm/summary', { method: 'GET' });
}

/* ─── Company profile (sender identity for prospecting) ─── */

export type CompanyProfileInput = {
  name?: string;
  description?: string;
  offer?: string;
  industry?: string;
  website?: string;
  location?: string;
  audience?: string;
};

export async function getCompanyProfile(): Promise<unknown> {
  return request('/api/auth/me/company', { method: 'GET' });
}

export async function updateCompanyProfile(input: CompanyProfileInput): Promise<unknown> {
  return request('/api/auth/me/company', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
