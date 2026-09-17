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
  /** SIGNUP = Meta popup, FIRM = "Use firm number", GENERATED = made from the support number. */
  origin: 'SIGNUP' | 'FIRM' | 'GENERATED';
  /** Only CONNECTED sends or receives; the others exist while a generated number verifies. */
  setupStatus: WhatsAppSetupStatus;
  /** Why setup failed, in words an admin can act on. */
  setupError: string | null;
  connectedAt: string;
}

export type WhatsAppSetupStatus = 'PENDING_CODE' | 'VERIFYING' | 'CONNECTED' | 'FAILED';

/** Setup still running — the account is polled until it settles. */
export function isWhatsAppSettingUp(account: WhatsAppAccount | null | undefined): boolean {
  return account?.setupStatus === 'PENDING_CODE' || account?.setupStatus === 'VERIFYING';
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
  /** WHATSAPP_TOKEN + WHATSAPP_BUSINESS_ACCOUNT_ID are set, so numbers can be generated. */
  generateAvailable: boolean;
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
  /**
   * The message this one natively replies to, as OUR id. Null when it is not a reply, and
   * also when the quoted message falls outside the loaded page — the bubble renders that
   * as an unresolved quote rather than chasing it.
   */
  replyToMessageId: number | null;
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

/**
 * A failed request, carrying the server's machine-readable `code` when it sent one — how
 * the card tells "no support number yet" (open the buy popup) from any other failure.
 */
export class WhatsAppRequestError extends Error {
  // Assigned in the body: parameter properties are not erasable syntax, which this
  // project's tsconfig (`erasableSyntaxOnly`) forbids.
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = 'WhatsAppRequestError';
    this.code = code;
  }
}

/** Server `code` for a company with no support number. Mirrors the server constant. */
export const NO_SUPPORT_NUMBER = 'NO_SUPPORT_NUMBER';

/** Nest's error body, so the server's message reaches the user verbatim. */
async function failure(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
    code?: unknown;
  };
  const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  return new WhatsAppRequestError(
    message ?? fallback,
    typeof body.code === 'string' ? body.code : null,
  );
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


/**
 * Make the company's WhatsApp number from its support number. Resolves as soon as Meta has
 * been asked for the code (`setupStatus: 'PENDING_CODE'`); poll the account for the rest.
 */
export async function generateWhatsApp(
  token: string,
  companyId: number,
): Promise<WhatsAppAccount> {
  const res = await fetchWithAuth(token, `${API}/whatsapp/companies/${companyId}/generate`, {
    method: 'POST',
    headers: JSON_HEADERS,
  });
  if (!res.ok) throw await failure(res, 'Failed to generate a WhatsApp account');
  return res.json() as Promise<WhatsAppAccount>;
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

/**
 * One approved message template, flattened to what the picker needs.
 *
 * Mirrors `WhatsAppTemplateDto`. Only the BODY is modelled — a template with a media
 * header needs a media id, which is a different feature.
 */
export interface WhatsAppTemplate {
  id: string | null;
  name: string;
  /** Meta's own code, e.g. `en_US`. Sent back verbatim. */
  language: string;
  category: string;
  /** The copy, `{{1}}` placeholders intact. Null for a template with no BODY component. */
  body: string | null;
  variableCount: number;
  /** Meta's review state. Only APPROVED can be sent — see `isSendableTemplate`. */
  status: string;
  /** Why Meta refused it. The only thing that says what to change. */
  rejectedReason: string | null;
}

/** Only an APPROVED template may carry a message. Mirrors the server rule of the same name. */
export function isSendableTemplate(t: WhatsAppTemplate): boolean {
  return t.status === 'APPROVED' && t.body !== null;
}

/** What the create form may submit. AUTHENTICATION is excluded — see the server's list. */
export const TEMPLATE_CATEGORIES = ['UTILITY', 'MARKETING'] as const;

/**
 * The templates this company may send.
 *
 * Returns [] rather than failing when Meta refuses the listing permission — the server
 * decides that, so an empty picker is a legitimate answer and not an error to surface.
 */
export async function fetchWhatsAppTemplates(
  token: string,
  companyId: number,
): Promise<WhatsAppTemplate[]> {
  const res = await fetchWithAuth(
    token,
    `${API}/whatsapp/companies/${companyId}/templates`,
  );
  if (!res.ok) throw await failure(res, 'Failed to load templates');
  return res.json() as Promise<WhatsAppTemplate[]>;
}

/**
 * Submit a template for Meta's review.
 *
 * ⚠️ Fails loudly, unlike the listing above. An empty picker is a legitimate answer to
 * "what can I send"; a silently swallowed submission would leave somebody waiting for a
 * review that was never requested.
 */
export async function createWhatsAppTemplate(
  token: string,
  companyId: number,
  input: {
    name: string;
    language: string;
    category: string;
    body: string;
    examples: string[];
  },
): Promise<WhatsAppTemplate> {
  const res = await fetchWithAuth(
    token,
    `${API}/whatsapp/companies/${companyId}/templates`,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) },
  );
  if (!res.ok) throw await failure(res, 'Failed to create the template');
  return res.json() as Promise<WhatsAppTemplate>;
}

/**
 * Send an approved template — the only way to write outside the 24-hour window, and
 * therefore the only way to open a conversation.
 */
export async function sendWhatsAppTemplate(
  token: string,
  companyId: number,
  input: { to: string; name: string; language: string; variables: string[] },
): Promise<WhatsAppItem> {
  const res = await fetchWithAuth(
    token,
    `${API}/whatsapp/companies/${companyId}/messages/template`,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) },
  );
  if (!res.ok) throw await failure(res, 'Failed to send the template');
  return res.json() as Promise<WhatsAppItem>;
}

export async function sendWhatsAppText(
  token: string,
  companyId: number,
  to: string,
  body: string,
  /** Reply natively to this message — OUR id; Meta's wamid never leaves the server. */
  replyToMessageId?: number,
): Promise<WhatsAppItem> {
  const res = await fetchWithAuth(token, `${API}/whatsapp/companies/${companyId}/messages`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ to, body, replyToMessageId }),
  });
  if (!res.ok) throw await failure(res, 'Failed to send the message');
  return res.json() as Promise<WhatsAppItem>;
}

/**
 * Meta's caption ceiling — a QUARTER of the 4096 a plain text message allows, so the
 * composer's counter has to switch when a file is attached.
 */
export const WHATSAPP_CAPTION_LIMIT = 1024;

/**
 * Will WhatsApp show a caption on this file?
 *
 * Image, video and document only; audio and stickers silently discard one. The composer
 * disables the field rather than letting somebody type a sentence the recipient never sees.
 *
 * ⚠️ Mirrors the server's `whatsappMediaKind` + `whatsappAcceptsCaption` pair
 * (`whatsapp.util.ts`), which is what actually decides the kind and drops the caption. This
 * copy only has a File to look at, so it deliberately asks the WEAKER question — "could
 * this ever be an image or a video" — and errs toward offering the field: a caption the
 * server then drops is a small loss, while wrongly disabling it on a photo would be a
 * missing feature with no explanation.
 */
export function fileAcceptsCaption(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  return !mime.startsWith('audio/');
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

/**
 * Send an attached file — anything at all; the server decides whether WhatsApp takes it
 * as an image, a video, an audio file or a document.
 *
 * XHR for the same reason as the voice note above: a 100 MB document takes minutes and the
 * composer has to show a progress bar rather than looking frozen.
 */
export function sendWhatsAppMedia(
  token: string,
  companyId: number,
  to: string,
  file: File,
  opts: { caption?: string; replyToMessageId?: number } = {},
  onProgress?: (fraction: number) => void,
): Promise<WhatsAppItem> {
  const form = new FormData();
  form.set('to', to);
  form.set('file', file, file.name);
  if (opts.caption) form.set('caption', opts.caption);
  if (opts.replyToMessageId !== undefined) {
    form.set('replyToMessageId', String(opts.replyToMessageId));
  }
  const url = `${API}/whatsapp/companies/${companyId}/messages/media`;

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
          reject(new Error('The file was sent, but the reply could not be read'));
        }
        return;
      }
      let message = 'Failed to send the file';
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string | string[] };
        if (body.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      } catch {
        // non-JSON error body (e.g. a proxy page)
      }
      // nginx refuses an over-large body before Node ever sees it, so there is no
      // service message to quote here.
      if (xhr.status === 413) message = 'That file is too large to send.';
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('Network error while sending the file'));
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
