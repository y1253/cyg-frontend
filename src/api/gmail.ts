import { fetchWithAuth } from './client';

const API = '/api';

export interface GmailAccount {
  gmailAddress: string;
  connectedAt: string;
  // Whether Google granted the Chat send scope on the last connect. When false,
  // chat replies will fail no matter how often the account is reconnected.
  hasChatScope?: boolean;
  // Default CYG signature HTML, seeded into the compose/reply editor so it's
  // visible + editable before sending (the server no longer appends it).
  signatureHtml?: string;
}

// A past recipient/sender for Gmail-style recipient autocomplete.
export interface GmailContact {
  email: string;
  name: string;
}

export interface EmailSummary {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  isRead: boolean;
  isCompleted?: boolean;
  // True when this message has been forwarded from within the app (shared per
  // company) — drives the inbox "forwarded" marker.
  isForwarded?: boolean;
  // Real (non-inline) file attachments, surfaced on the list row as chips.
  attachments?: EmailAttachment[];
}

// An attachment on an email. Bytes are fetched on demand from the download
// endpoint using `attachmentId`.
export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
  // Content-ID (brackets stripped) — matches inline `cid:` refs in the HTML body.
  contentId: string | null;
  // Inline images (shown in the body) are hidden from the attachment strip.
  isInline: boolean;
}

export interface EmailDetail extends EmailSummary {
  to: string;
  threadId: string;
  messageId: string;
  bodyHtml: string | null;
  bodyText: string | null;
  attachments: EmailAttachment[];
}

export interface EmailListResult {
  messages: EmailSummary[];
  nextPageToken: string | null;
}

// An attachment on a Chat message. Uploaded files stream via `resourceName`;
// Drive-hosted files expose only `driveFileId` (opened via a Drive link).
export interface ChatAttachment {
  name: string;
  contentName: string;
  contentType: string;
  resourceName: string | null;
  driveFileId: string | null;
  thumbnailUri: string | null;
  downloadUri: string | null;
  source: string | null;
}

export interface ChatMessage {
  id: string;
  spaceId: string;
  spaceName: string;
  spaceType: string;
  sender: string;
  text: string;
  createTime: string;
  // Needed to natively quote this message (quotedMessageMetadata).
  lastUpdateTime: string;
  // Resource name of the message THIS message quotes, if any (else null).
  quotedMessageName?: string | null;
  isOwn?: boolean;
  attachments?: ChatAttachment[];
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
  lastUpdateTime: string;
  quotedMessageName?: string | null;
  isRead: boolean;
  isCompleted?: boolean;
  hasAttachments?: boolean;
}

export interface ChatListResult {
  messages: ChatInboxMessage[];
  needsReconnect?: boolean;
  chatStatus?: 'ok' | 'needs_reconnect' | 'no_spaces' | 'error' | 'chat_disabled' | 'app_not_configured';
  // Set when chats load fine but their senders can't be named (every sender shows
  // "Unknown"). 'scopes' = the grant lacks the People scopes → reconnect;
  // 'api_disabled' = People API off / permission denied in the Google Cloud project.
  senderNamesUnavailable?: 'scopes' | 'api_disabled' | null;
  // Infinite-scroll cursor: opaque per-space pageToken map for the next (older)
  // page. `hasMore` is false when every space is exhausted.
  nextCursor?: string | null;
  hasMore?: boolean;
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

export async function fetchGmailContacts(
  token: string,
  companyId: number,
): Promise<GmailContact[]> {
  const res = await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/contacts`);
  if (!res.ok) throw new Error('Failed to fetch contacts');
  return res.json() as Promise<GmailContact[]>;
}

export async function fetchEmails(
  token: string,
  companyId: number,
  pageToken?: string,
  labelId?: string,
  q?: string,
): Promise<EmailListResult> {
  const params = new URLSearchParams();
  if (pageToken) params.set('pageToken', pageToken);
  if (labelId) params.set('labelIds', labelId);
  if (q) params.set('q', q);
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

export async function fetchChats(
  token: string,
  companyId: number,
  cursor?: string,
  q?: string,
): Promise<ChatListResult> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (q) params.set('q', q);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/chats${qs}`);
  if (!res.ok) throw new Error('Failed to fetch chats');
  return res.json() as Promise<ChatListResult>;
}

export async function fetchChatThread(
  token: string,
  companyId: number,
  spaceId: string,
  pageToken?: string,
): Promise<ChatThreadResult> {
  const params = new URLSearchParams({ spaceId });
  if (pageToken) params.set('pageToken', pageToken);
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

// Mark complete / uncomplete — shared per-message state for the Communications
// inbox (email + chat). Chat ids contain "/", so they go in the body; email ids
// go in the path (mirrors read/unread).
export async function markChatComplete(
  token: string,
  companyId: number,
  messageId: string,
): Promise<void> {
  await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/chats/complete`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId }),
  });
}

export async function markChatUncomplete(
  token: string,
  companyId: number,
  messageId: string,
): Promise<void> {
  await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/chats/uncomplete`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId }),
  });
}

export async function markEmailComplete(
  token: string,
  companyId: number,
  messageId: string,
): Promise<void> {
  await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/emails/${messageId}/complete`, {
    method: 'PATCH',
  });
}

export async function markEmailUncomplete(
  token: string,
  companyId: number,
  messageId: string,
): Promise<void> {
  await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/emails/${messageId}/uncomplete`, {
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

export async function fetchUncompletedCount(
  token: string,
  companyId: number,
): Promise<{ count: number }> {
  const res = await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/uncompleted-count`);
  if (!res.ok) throw new Error('Failed to fetch uncompleted count');
  return res.json() as Promise<{ count: number }>;
}

/** Uncompleted counts keyed by company id. Companies without Gmail connected are absent. */
export async function fetchUncompletedCounts(
  token: string,
): Promise<Record<string, number>> {
  const res = await fetchWithAuth(token, `${API}/gmail/uncompleted-counts`);
  if (!res.ok) throw new Error('Failed to fetch uncompleted counts');
  return res.json() as Promise<Record<string, number>>;
}

export async function sendEmail(
  token: string,
  companyId: number,
  data: {
    to: string;
    subject: string;
    body: string;
    bodyHtml?: string;
    cc?: string;
    inReplyTo?: string;
    threadId?: string;
    forwardedFrom?: string;
    files?: File[];
  },
): Promise<void> {
  // Sent as multipart/form-data so file attachments ride along. No explicit
  // Content-Type header — the browser sets the multipart boundary itself.
  const form = new FormData();
  form.set('to', data.to);
  form.set('subject', data.subject);
  form.set('body', data.body);
  if (data.bodyHtml) form.set('bodyHtml', data.bodyHtml);
  if (data.cc) form.set('cc', data.cc);
  if (data.inReplyTo) form.set('inReplyTo', data.inReplyTo);
  if (data.threadId) form.set('threadId', data.threadId);
  if (data.forwardedFrom) form.set('forwardedFrom', data.forwardedFrom);
  for (const file of data.files ?? []) form.append('attachments', file);

  const res = await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/send`, {
    method: 'POST',
    body: form,
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
  quote?: { quotedMessageName: string; quotedMessageLastUpdateTime: string },
): Promise<ChatMessage> {
  const res = await fetchWithAuth(token, `${API}/gmail/companies/${companyId}/chat-messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spaceId, text, ...quote }),
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

type Disposition = 'inline' | 'attachment';

// Build an authenticated URL for an email attachment. The JWT rides as a query
// param (not a header) so the URL can be used directly as an <img>/<audio>/
// <video> src or a download link. `disposition` controls the Content-Disposition
// header ('inline' to render/play, 'attachment' to force a download).
export function emailAttachmentUrl(
  token: string,
  companyId: number,
  messageId: string,
  att: EmailAttachment,
  disposition?: Disposition,
): string {
  const params = new URLSearchParams({
    token,
    mimeType: att.mimeType,
    filename: att.filename,
  });
  if (disposition) params.set('disposition', disposition);
  return `${API}/gmail/companies/${companyId}/emails/${messageId}/attachments/${att.attachmentId}?${params.toString()}`;
}

// Build an authenticated URL for an uploaded Chat attachment. Only valid when the
// attachment has a `resourceName` (Drive-hosted files use a Drive link instead).
export function chatAttachmentUrl(
  token: string,
  companyId: number,
  att: ChatAttachment,
  disposition?: Disposition,
): string {
  const params = new URLSearchParams({
    token,
    resourceName: att.resourceName ?? '',
    mimeType: att.contentType,
    filename: att.contentName,
  });
  if (disposition) params.set('disposition', disposition);
  return `${API}/gmail/companies/${companyId}/chat-attachment?${params.toString()}`;
}
