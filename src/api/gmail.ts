import { fetchWithAuth } from './client';

const API = '/api';

export interface GmailAccount {
  gmailAddress: string;
  connectedAt: string;
  // Whether Google granted the Chat send scope on the last connect. When false,
  // chat replies will fail no matter how often the account is reconnected.
  hasChatScope?: boolean;
}

export interface EmailSummary {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  isRead: boolean;
}

export interface EmailDetail extends EmailSummary {
  to: string;
  threadId: string;
  messageId: string;
  bodyHtml: string | null;
  bodyText: string | null;
}

export interface EmailListResult {
  messages: EmailSummary[];
  nextPageToken: string | null;
}

export interface ChatMessage {
  id: string;
  spaceId: string;
  spaceName: string;
  spaceType: string;
  sender: string;
  text: string;
  createTime: string;
  isOwn?: boolean;
}

// One incoming chat message for the inbox list (chats behave like emails).
export interface ChatInboxMessage {
  id: string;
  spaceId: string;
  spaceName: string;
  spaceType: string;
  sender: string;
  text: string;
  createTime: string;
  isRead: boolean;
}

export interface ChatListResult {
  messages: ChatInboxMessage[];
  needsReconnect?: boolean;
  chatStatus?: 'ok' | 'needs_reconnect' | 'no_spaces' | 'error' | 'chat_disabled' | 'app_not_configured';
}

export interface ChatThreadResult {
  messages: ChatMessage[];
  nextPageToken: string | null;
  spaceName?: string;
  spaceType?: string;
  needsReconnect?: boolean;
}

export async function fetchAuthUrl(token: string, companyId: number): Promise<{ authUrl: string }> {
  const res = await fetchWithAuth(token, `${API}/gmail/auth-url?companyId=${companyId}`);
  if (!res.ok) throw new Error('Failed to get auth URL');
  return res.json() as Promise<{ authUrl: string }>;
}

export async function fetchGmailAccount(
  token: string,
  companyId: number,
): Promise<GmailAccount | null> {
  const res = await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/account`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch Gmail account');
  return res.json() as Promise<GmailAccount>;
}

export async function fetchEmails(
  token: string,
  companyId: number,
  pageToken?: string,
  labelId?: string,
): Promise<EmailListResult> {
  const params = new URLSearchParams();
  if (pageToken) params.set('pageToken', pageToken);
  if (labelId) params.set('labelIds', labelId);
  const res = await fetchWithAuth(
    token,
    `${API}/gmail/companies/${companyId}/emails?${params.toString()}`,
  );
  if (!res.ok) throw new Error('Failed to fetch emails');
  return res.json() as Promise<EmailListResult>;
}

export async function fetchEmail(
  token: string,
  companyId: number,
  messageId: string,
): Promise<EmailDetail> {
  const res = await fetchWithAuth(
    token,
    `${API}/gmail/companies/${companyId}/emails/${messageId}`,
  );
  if (!res.ok) throw new Error('Failed to fetch email');
  return res.json() as Promise<EmailDetail>;
}

export async function fetchChats(token: string, companyId: number): Promise<ChatListResult> {
  const res = await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/chats`);
  if (!res.ok) throw new Error('Failed to fetch chats');
  return res.json() as Promise<ChatListResult>;
}

export async function fetchChatThread(
  token: string,
  companyId: number,
  spaceId: string,
  pageToken?: string,
  untilCreateTime?: string,
): Promise<ChatThreadResult> {
  const params = new URLSearchParams({ spaceId });
  if (pageToken) params.set('pageToken', pageToken);
  if (untilCreateTime) params.set('until', untilCreateTime);
  const res = await fetchWithAuth(
    token,
    `${API}/gmail/companies/${companyId}/chat-thread?${params.toString()}`,
  );
  if (!res.ok) throw new Error('Failed to fetch chat thread');
  return res.json() as Promise<ChatThreadResult>;
}

export async function markChatRead(
  token: string,
  companyId: number,
  messageId: string,
): Promise<void> {
  await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/chats/read`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId }),
  });
}

export async function markChatUnread(
  token: string,
  companyId: number,
  messageId: string,
): Promise<void> {
  await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/chats/unread`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId }),
  });
}

export async function markEmailRead(
  token: string,
  companyId: number,
  messageId: string,
): Promise<void> {
  await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/emails/${messageId}/read`, {
    method: 'PATCH',
  });
}

export async function markEmailUnread(
  token: string,
  companyId: number,
  messageId: string,
): Promise<void> {
  await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/emails/${messageId}/unread`, {
    method: 'PATCH',
  });
}

export async function fetchUnreadCount(
  token: string,
  companyId: number,
): Promise<{ count: number }> {
  const res = await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/unread-count`);
  if (!res.ok) throw new Error('Failed to fetch unread count');
  return res.json() as Promise<{ count: number }>;
}

export async function sendEmail(
  token: string,
  companyId: number,
  data: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    inReplyTo?: string;
    threadId?: string;
  },
): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to send email');
  }
}

export async function sendChatMessage(
  token: string,
  companyId: number,
  spaceId: string,
  text: string,
): Promise<ChatMessage> {
  const res = await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/chat-messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spaceId, text }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to send chat message');
  }
  return res.json() as Promise<ChatMessage>;
}

export async function disconnectGmail(token: string, companyId: number): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/disconnect`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to disconnect Gmail');
}
