import { fetchWithAuth, handleUnauthorized } from './client';

// Internal staff-to-staff messaging. Shapes deliberately mirror the Gmail
// EmailSummary/EmailDetail/EmailListResult types in ./gmail so the message-row and
// thread markup ports across with minimal divergence — the differences are that
// senders/recipients are structured users (not raw "Name <addr>" header strings)
// and ids are numeric.

const BASE = '/api/internal-messages';

export type InternalFolder = 'INBOX' | 'UNCOMPLETED' | 'UNREAD' | 'SENT';

export interface DirectoryUser {
  id: number;
  name: string;
  email: string;
}

export interface InternalAttachment {
  id: number;
  filename: string;
  mimeType: string;
  size: number;
}

export interface InternalMessageSummary {
  id: number;
  threadId: number;
  parentId: number | null;
  subject: string;
  /** ISO timestamp. */
  date: string;
  snippet: string;
  /** True when the signed-in user sent this message (SENT folder / own bubbles). */
  isOwn: boolean;
  isForward: boolean;
  /** Read/completed reflect the VIEWER's own state; always true for own sent mail. */
  isRead: boolean;
  isCompleted: boolean;
  from: DirectoryUser;
  to: DirectoryUser[];
  cc: DirectoryUser[];
  attachments: InternalAttachment[];
}

/** One forward of a message — mirrors EmailDetail.forwards in api/gmail.ts. */
export interface InternalForward {
  /** Id of the forward itself, so the UI can preview what was actually sent. */
  messageId: number;
  /** ISO timestamp. */
  at: string;
  /** TO recipients of the forward, comma-joined. */
  to: string;
  by: { id: number; name: string };
}

export interface InternalMessageDetail extends InternalMessageSummary {
  bodyHtml: string | null;
  bodyText: string | null;
  /**
   * True when this message HAS BEEN forwarded — the inverse of `isForward`, which
   * marks a message that IS a forward. Only forwards the viewer is party to count.
   */
  isForwarded: boolean;
  forwards: InternalForward[];
}

export interface InternalListResult {
  messages: InternalMessageSummary[];
  nextCursor: number | null;
}

export interface InternalThreadResult {
  messages: InternalMessageDetail[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const parsed = JSON.parse(text) as { message?: string | string[] };
      message = Array.isArray(parsed.message)
        ? parsed.message.join(', ')
        : (parsed.message ?? text);
    } catch {
      // non-JSON error body — surface the raw text
    }
    throw new Error(message || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchInternalMessages(
  token: string,
  folder: InternalFolder,
  cursor?: number | null,
  q?: string,
): Promise<InternalListResult> {
  const params = new URLSearchParams({ folder });
  if (cursor) params.set('cursor', String(cursor));
  if (q) params.set('q', q);
  return json(await fetchWithAuth(token, `${BASE}?${params.toString()}`));
}

export async function fetchInternalMessage(
  token: string,
  id: number,
): Promise<InternalMessageDetail> {
  return json(await fetchWithAuth(token, `${BASE}/${id}`));
}

export async function fetchInternalThread(
  token: string,
  threadId: number,
): Promise<InternalThreadResult> {
  return json(await fetchWithAuth(token, `${BASE}/thread?threadId=${threadId}`));
}

export async function fetchInternalUncompletedCount(
  token: string,
): Promise<{ count: number }> {
  return json(await fetchWithAuth(token, `${BASE}/uncompleted-count`));
}

export async function fetchInternalUnreadCount(
  token: string,
): Promise<{ count: number }> {
  return json(await fetchWithAuth(token, `${BASE}/unread-count`));
}

export async function sendInternalMessage(
  token: string,
  data: {
    to: number[];
    cc?: number[];
    subject: string;
    body: string;
    bodyHtml?: string;
    parentId?: number;
    isForward?: boolean;
    files?: File[];
    /** Fraction 0–1 of the attachment bytes uploaded so far. */
    onProgress?: (fraction: number) => void;
  },
): Promise<InternalMessageDetail> {
  // multipart/form-data so attachments ride along. No explicit Content-Type —
  // the browser sets the multipart boundary. Recipient ids go as a comma-joined
  // string because multipart fields are always strings on the server.
  const form = new FormData();
  form.set('to', data.to.join(','));
  if (data.cc?.length) form.set('cc', data.cc.join(','));
  form.set('subject', data.subject);
  form.set('body', data.body);
  if (data.bodyHtml) form.set('bodyHtml', data.bodyHtml);
  if (data.parentId) form.set('parentId', String(data.parentId));
  if (data.isForward) form.set('isForward', '1');
  data.files?.forEach((f) => form.append('attachments', f));

  // XHR rather than fetch: attachments run to 250 MB each, and fetch still has no
  // upload-progress event. The auth header and the error shape match
  // `fetchWithAuth` + `json()` exactly, so callers can't tell the difference.
  return new Promise<InternalMessageDetail>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', BASE);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (data.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          data.onProgress?.(e.loaded / e.total);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as InternalMessageDetail);
        } catch {
          reject(new Error('The server sent back an unreadable response'));
        }
        return;
      }
      // `fetchWithAuth` does this for every other call; a token that lapsed
      // mid-upload has to log out the same way rather than read as a send failure.
      if (xhr.status === 401) handleUnauthorized();
      let message = xhr.responseText;
      try {
        const body = JSON.parse(xhr.responseText) as {
          message?: string | string[];
        };
        message = Array.isArray(body.message)
          ? body.message.join(', ')
          : (body.message ?? xhr.responseText);
      } catch {
        // non-JSON error body (e.g. a proxy's 413 page) — surface the raw text
      }
      if (xhr.status === 413) {
        message = 'The attachments were too large for the server to accept.';
      }
      reject(new Error(message || `Request failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error while sending'));
    xhr.onabort = () => reject(new Error('Sending was cancelled'));

    xhr.send(form);
  });
}

export type InternalStateAction =
  | 'read'
  | 'unread'
  | 'complete'
  | 'uncomplete';

export async function setInternalMessageState(
  token: string,
  id: number,
  action: InternalStateAction,
): Promise<void> {
  const res = await fetchWithAuth(token, `${BASE}/${id}/${action}`, {
    method: 'PATCH',
  });
  if (!res.ok) throw new Error(`Failed to mark message ${action}`);
}

/**
 * Authenticated attachment URL. The JWT rides in the query string so the URL can
 * be used directly as an <img>/<audio>/<video> src; the server verifies it AND
 * checks the decoded user against the message, so a token alone is not enough.
 */
export function internalAttachmentUrl(
  token: string,
  attachmentId: number,
  disposition?: 'inline' | 'attachment',
): string {
  const params = new URLSearchParams({ token });
  if (disposition) params.set('disposition', disposition);
  return `${BASE}/attachments/${attachmentId}?${params.toString()}`;
}

/** SSE endpoint for instant delivery. EventSource cannot send headers. */
export function internalEventsUrl(token: string): string {
  return `${BASE}/events?token=${encodeURIComponent(token)}`;
}

export async function fetchUserDirectory(
  token: string,
): Promise<DirectoryUser[]> {
  return json(await fetchWithAuth(token, '/api/users/directory'));
}
