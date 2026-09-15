import { fetchWithAuth, handleUnauthorized } from './client';
import { formatE164 } from '@/lib/phone';

const API = '/api';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ─── Types — mirror `server/src/whatsapp/whatsapp.types.ts` ──────────────────
//
// Unlike SMS, WhatsApp is PERSISTED on our side: the Cloud API has no "list messages"
// endpoint, so every row here was stored from a webhook delivery (or from our own send).

export type WhatsAppDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';
export type WhatsAppMediaStatus = 'pending' | 'ready' | 'failed';
export type WhatsAppMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contacts'
  | 'reaction'
  | 'interactive'
  | 'button'
  | 'unsupported';

export interface WhatsAppAccount {
  companyId: number;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
  /** Attached with the server's own token rather than through Embedded Signup. */
  usesFirmToken: boolean;
  connectedAt: string;
}

export interface WhatsAppConnectResult {
  account: WhatsAppAccount;
  /** The number was saved but a follow-up step (registration) did not succeed. */
  warning: string | null;
}

export interface WhatsAppClientConfig {
  appId: string | null;
  configId: string | null;
  graphVersion: string;
  firmNumberAvailable: boolean;
}

export interface WhatsAppItem {
  /** `wa:{messageId}` — namespaced like `swsms:`, the inbox's shared id space. */
  id: string;
  messageId: number;
  kind: 'whatsapp';
  direction: 'inbound' | 'outbound';
  /** The customer's WhatsApp id: digits only, no "+". */
  peer: string;
  peerName: string | null;
  type: WhatsAppMessageType;
  body: string | null;
  isVoice: boolean;
  durationSec: number | null;
  hasMedia: boolean;
  mediaStatus: WhatsAppMediaStatus | null;
  mimeType: string | null;
  filename: string | null;
  size: number | null;
  status: WhatsAppDeliveryStatus | null;
  errorCode: string | null;
  /** ISO. The merge key against every other channel. */
  at: string;
  isRead: boolean;
  isCompleted: boolean;
}

export interface WhatsAppTimelineResult {
  items: WhatsAppItem[];
  nextCursor: number | null;
  hasMore: boolean;
  connected: boolean;
}

export interface WhatsAppThreadResult {
  messages: WhatsAppItem[];
  peer: string;
  peerName: string | null;
  /** Free-form replies are accepted only before this. Null = the customer never wrote. */
  windowOpenUntil: string | null;
  connected: boolean;
}

export type WhatsAppStateAction = 'read' | 'unread' | 'complete' | 'uncomplete';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Nest's error body, so the server's message reaches the user verbatim. */
async function failure(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  return new Error(message ?? fallback);
}

const ITEM_PREFIX = 'wa:';

/** `wa:12` -> 12. The state routes take our numeric id, never the inbox string. */
export function whatsappMessageIdOf(itemId: string): number {
  return Number(itemId.startsWith(ITEM_PREFIX) ? itemId.slice(ITEM_PREFIX.length) : itemId);
}

/** A WhatsApp id is E.164 without the "+". */
export function formatWhatsAppNumber(peer: string): string {
  return formatE164(`+${peer}`);
}

export function whatsappPeerLabel(item: { peer: string; peerName: string | null }): string {
  return item.peerName || formatWhatsAppNumber(item.peer);
}

/** Mirrors the server's `whatsappPreview`: a label for a message with no text. */
export function whatsappPreviewText(item: Pick<WhatsAppItem, 'type' | 'body' | 'isVoice'>): string {
  if (item.body) return item.body;
  switch (item.type) {
    case 'audio':
      return item.isVoice ? 'Voice message' : 'Audio';
    case 'image':
      return 'Photo';
    case 'video':
      return 'Video';
    case 'document':
      return 'Document';
    case 'sticker':
      return 'Sticker';
    case 'location':
      return 'Location';
    case 'contacts':
      return 'Contact';
    case 'unsupported':
      return 'Unsupported message';
    default:
      return '(no text)';
  }
}

/** `75` -> `1:15`. */
export function formatVoiceDuration(totalSec: number | null): string {
  if (totalSec == null || totalSec < 0) return '';
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Playable / viewable URL for a message's media.
 *
 * Token in the query string because an `<img>`/`<audio>` cannot send a header — the
 * internal-attachments pattern. `playback` asks for the mp3 made from an audio message,
 * which plays in every browser (Safari cannot be relied on for WhatsApp's Ogg/Opus).
 */
export function whatsappMediaUrl(
  token: string,
  messageId: number,
  opts: { playback?: boolean; download?: boolean } = {},
): string {
  const params = new URLSearchParams({ token });
  if (opts.playback) params.set('variant', 'playback');
  if (opts.download) params.set('download', '1');
  return `${API}/whatsapp/media/${messageId}?${params.toString()}`;
}

// ─── Account ─────────────────────────────────────────────────────────────────

export async function fetchWhatsAppConfig(token: string): Promise<WhatsAppClientConfig> {
  const res = await fetchWithAuth(token, `${API}/whatsapp/config`, { headers: JSON_HEADERS });
  if (!res.ok) throw await failure(res, 'Failed to load WhatsApp settings');
  return res.json() as Promise<WhatsAppClientConfig>;
}

export async function fetchWhatsAppAccount(
  token: string,
  companyId: number,
): Promise<WhatsAppAccount | null> {
  const res = await fetchWithAuth(token, `${API}/whatsapp/companies/${companyId}/account`, {
    headers: JSON_HEADERS,
  });
  if (!res.ok) throw await failure(res, 'Failed to load the WhatsApp connection');
  const body = (await res.json()) as { account: WhatsAppAccount | null };
  return body.account;
}

/** Finish Embedded Signup. The code dies 30s after the popup closes — call immediately. */
export async function connectWhatsApp(
  token: string,
  companyId: number,
  data: { code: string; wabaId: string; phoneNumberId: string },
): Promise<WhatsAppConnectResult> {
  const res = await fetchWithAuth(token, `${API}/whatsapp/companies/${companyId}/connect`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await failure(res, 'Failed to connect WhatsApp');
  return res.json() as Promise<WhatsAppConnectResult>;
}

/** Attach the firm's own number from the server config. Admin only. */
export async function connectFirmWhatsApp(
  token: string,
  companyId: number,
): Promise<WhatsAppConnectResult> {
  const res = await fetchWithAuth(
    token,
    `${API}/whatsapp/companies/${companyId}/connect-firm-number`,
    { method: 'POST', headers: JSON_HEADERS },
  );
  if (!res.ok) throw await failure(res, 'Failed to attach the firm number');
  return res.json() as Promise<WhatsAppConnectResult>;
}

export async function disconnectWhatsApp(token: string, companyId: number): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/whatsapp/companies/${companyId}/account`, {
    method: 'DELETE',
    headers: JSON_HEADERS,
  });
  if (!res.ok) throw await failure(res, 'Failed to disconnect WhatsApp');
}

// ─── Messages ────────────────────────────────────────────────────────────────

/** One page, newest first. `cursor` is the last page's `nextCursor`. */
export async function fetchWhatsAppTimeline(
  token: string,
  companyId: number,
  cursor?: number,
  limit = 25,
): Promise<WhatsAppTimelineResult> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', String(cursor));
  const res = await fetchWithAuth(
    token,
    `${API}/whatsapp/companies/${companyId}/timeline?${params.toString()}`,
    { headers: JSON_HEADERS },
  );
  if (!res.ok) throw await failure(res, 'Failed to load WhatsApp messages');
  return res.json() as Promise<WhatsAppTimelineResult>;
}

export async function fetchWhatsAppThread(
  token: string,
  companyId: number,
  peer: string,
): Promise<WhatsAppThreadResult> {
  const res = await fetchWithAuth(
    token,
    `${API}/whatsapp/companies/${companyId}/thread?peer=${encodeURIComponent(peer)}`,
    { headers: JSON_HEADERS },
  );
  if (!res.ok) throw await failure(res, 'Failed to load the conversation');
  return res.json() as Promise<WhatsAppThreadResult>;
}

export async function fetchWhatsAppCounts(
  token: string,
  companyId: number,
): Promise<{ unread: number; uncompleted: number }> {
  const res = await fetchWithAuth(token, `${API}/whatsapp/companies/${companyId}/counts`, {
    headers: JSON_HEADERS,
  });
  if (!res.ok) return { unread: 0, uncompleted: 0 };
  return res.json() as Promise<{ unread: number; uncompleted: number }>;
}

export async function sendWhatsAppText(
  token: string,
  companyId: number,
  to: string,
  body: string,
): Promise<WhatsAppItem> {
  const res = await fetchWithAuth(token, `${API}/whatsapp/companies/${companyId}/messages`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ to, body }),
  });
  if (!res.ok) throw await failure(res, 'Failed to send the message');
  return res.json() as Promise<WhatsAppItem>;
}

/**
 * Upload a recorded voice note. XHR rather than fetch for upload progress — the
 * `api/gmail.ts#sendEmail` reason — with the same auth and error handling.
 */
export function sendWhatsAppVoice(
  token: string,
  companyId: number,
  to: string,
  recording: Blob,
  filename: string,
  onProgress?: (fraction: number) => void,
): Promise<WhatsAppItem> {
  const form = new FormData();
  form.set('to', to);
  form.set('file', recording, filename);
  const url = `${API}/whatsapp/companies/${companyId}/messages/voice`;

  return new Promise<WhatsAppItem>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
      };
    }
    xhr.onload = () => {
      if (xhr.status === 401) {
        handleUnauthorized();
        reject(new Error('Your session expired'));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as WhatsAppItem);
        } catch {
          reject(new Error('The voice message was sent, but the reply could not be read'));
        }
        return;
      }
      let message = 'Failed to send the voice message';
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string | string[] };
        if (body.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      } catch {
        // non-JSON error body (e.g. a proxy page)
      }
      if (xhr.status === 413) message = 'The recording is too large to send.';
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('Network error while sending the voice message'));
    xhr.send(form);
  });
}

export async function markWhatsAppItem(
  token: string,
  companyId: number,
  messageId: number,
  action: WhatsAppStateAction,
): Promise<void> {
  const res = await fetchWithAuth(
    token,
    `${API}/whatsapp/companies/${companyId}/items/${messageId}/${action}`,
    { method: 'PATCH', headers: JSON_HEADERS },
  );
  if (!res.ok) throw await failure(res, `Failed to mark ${action}`);
}
