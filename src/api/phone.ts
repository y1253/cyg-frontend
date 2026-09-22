import { fetchWithAuth } from './client';
import { markDialedHere } from '@/lib/dialIntent';

const API = '/api';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** The SignalWire number attached to a company (the active SupportNumber row). */
export interface SupportNumber {
  id: number;
  companyId: number;
  phoneNumber: string;
  sid: string;
  region: string | null;
  createdAt: string;
  releasedAt: string | null;
}

/** A number that can be purchased, from the availability search. */
export interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string | null;
  region: string | null;
  rateCenter: string | null;
  locality: string | null;
  voice: boolean;
  sms: boolean;
  mms: boolean;
}

/** Nest's error body, so the server's message reaches the admin verbatim. */
async function failure(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  return new Error(message ?? fallback);
}

/** The company's active support number, or null when none is connected. */
export async function fetchSupportNumber(
  token: string,
  companyId: number,
): Promise<SupportNumber | null> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/number`,
    { headers: JSON_HEADERS },
  );
  if (!res.ok) throw new Error('Failed to fetch support number');
  // The endpoint returns literal `null` when nothing is connected; Nest sends that as
  // an empty body, which is not valid JSON.
  const text = await res.text();
  return text ? (JSON.parse(text) as SupportNumber) : null;
}

/**
 * Searches purchasable numbers. Admin only, and every call hits a paid provider — which
 * is why the hook wrapping this is a mutation rather than an auto-refetching query.
 */
/**
 * What a number search found.
 *
 * `totalFound` is what the provider returned BEFORE the voice+SMS bar, which is the only
 * thing that separates "100 exist, none can text" from "none exist" — see
 * `connect-number-message.ts` for why those must not read the same.
 */
export interface NumberSearchResult {
  numbers: AvailableNumber[];
  totalFound: number;
  searched: { country: 'US' | 'CA'; areaCode: string | null; regions: string[] };
}

export async function searchAvailableNumbers(
  token: string,
  params: { country: string; areaCode?: string },
): Promise<NumberSearchResult> {
  const query = new URLSearchParams({ country: params.country });
  if (params.areaCode) query.set('areaCode', params.areaCode);
  const res = await fetchWithAuth(token, `${API}/phone/available?${query}`, {
    headers: JSON_HEADERS,
  });
  if (!res.ok) throw await failure(res, 'Failed to search numbers');
  const body: unknown = await res.json();

  /**
   * ⚠️ Tolerates the OLD bare-array shape for one release.
   *
   * Server and client are separate repos deployed one after the other, so there is a
   * window where a browser running the old bundle meets the new server, or vice versa.
   * Without this, `results.map` throws inside the dialog and the admin sees a blank
   * popup. Three lines now; delete once both sides have shipped.
   */
  if (Array.isArray(body)) {
    const numbers = body as AvailableNumber[];
    return {
      numbers,
      totalFound: numbers.length,
      searched: {
        country: params.country === 'USA' ? 'US' : 'CA',
        areaCode: params.areaCode ?? null,
        regions: [],
      },
    };
  }
  return body as NumberSearchResult;
}

/** Buys the number and attaches it. Irreversible and billable. */
export async function attachSupportNumber(
  token: string,
  companyId: number,
  data: { phoneNumber: string; region?: string | null },
): Promise<SupportNumber> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/number`,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        phoneNumber: data.phoneNumber,
        ...(data.region ? { region: data.region } : {}),
      }),
    },
  );
  if (!res.ok) throw await failure(res, 'Failed to connect the number');
  return res.json() as Promise<SupportNumber>;
}

/** Releases the number back to SignalWire. Permanent; billing stops. */
export async function releaseSupportNumber(
  token: string,
  companyId: number,
): Promise<void> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/number`,
    { method: 'DELETE', headers: JSON_HEADERS },
  );
  if (!res.ok) throw await failure(res, 'Failed to disconnect the number');
}

/** Softphone credentials for the signed-in user. */
export interface SipCredentials {
  username: string;
  password: string;
  domain: string;
  wsServer: string;
}

/**
 * The credentials the softphone registers with, fetched on app load.
 *
 * Currently one shared credential for everyone — SIP passwords cannot be set through
 * any SignalWire API, so a credential per user would need a manual dashboard entry per
 * user. The endpoint is per-caller so that changing that later touches only the server.
 */
export async function fetchSipCredentials(
  token: string,
): Promise<SipCredentials> {
  const res = await fetchWithAuth(token, `${API}/phone/sip-credentials`, {
    headers: JSON_HEADERS,
  });
  if (!res.ok) throw await failure(res, 'Softphone is not available');
  return res.json() as Promise<SipCredentials>;
}

/** SSE endpoint carrying incoming-call events. EventSource cannot send headers. */
export function phoneEventsUrl(token: string): string {
  return `${API}/phone/events?token=${encodeURIComponent(token)}`;
}

/**
 * The call ringing this user right now, or null.
 *
 * A plain request on purpose. The SSE stream is unreliable behind a TLS-intercepting
 * content filter (it buffers streaming responses until they complete, which never
 * happens), so the client fetches this when an INVITE arrives rather than waiting for
 * a push that may never land.
 */
export async function fetchPendingCall(
  token: string,
): Promise<(IncomingCallPayload & { type: string }) | null> {
  const res = await fetchWithAuth(token, `${API}/phone/pending-call`, {
    headers: JSON_HEADERS,
  });
  if (!res.ok) return null;
  const text = await res.text();
  return text ? (JSON.parse(text) as IncomingCallPayload & { type: string }) : null;
}

/**
 * EVERY call ringing this user right now, newest first.
 *
 * What the singular route above cannot answer once call waiting exists: an agent already
 * on a call is holding TWO INVITEs, and one event cannot say which company each belongs
 * to — pairing them from a single "newest" value is how caller B gets labelled company A.
 *
 * Returns `[]` rather than throwing on any failure, including an older server that has no
 * such route: a browser holding an INVITE and no event simply waits, which is the same
 * thing it does when the poll has not landed yet.
 */
export async function fetchPendingCalls(
  token: string,
): Promise<(IncomingCallPayload & { type: string })[]> {
  try {
    const res = await fetchWithAuth(token, `${API}/phone/pending-calls`, {
      headers: JSON_HEADERS,
    });
    // Every failure below still returns [] — a poll that cannot answer must never break
    // the INVITE path — but it now SAYS so. Until this line, a 401, a 404, an empty body
    // and a genuine "no event yet" were indistinguishable in the console, which made a
    // caller who never learned about their own call impossible to tell apart from one
    // whose event simply had not been written yet.
    if (!res.ok) {
      console.warn('[softphone] pending-calls failed', res.status);
      return [];
    }
    const text = await res.text();
    if (!text) return [];
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      console.warn('[softphone] pending-calls returned a non-array');
      return [];
    }
    return parsed as (IncomingCallPayload & { type: string })[];
  } catch (err) {
    console.warn('[softphone] pending-calls threw', err);
    return [];
  }
}

export interface IncomingCallPayload {
  companyId: number;
  companyName: string;
  from: string;
  /** The saved contact's name for `from`. Absent when nobody has saved the caller. */
  fromName?: string;
  callSid: string;
  at: number;
}

// ─── Calls + SMS in the Communications inbox ─────────────────────────────────
//
// Mirrors `server/src/phone/phone.types.ts`, the same way this file's neighbours in
// `api/gmail.ts` mirror the communications types. Nothing here is persisted on our
// side: every field is fetched live from SignalWire per request, except `isRead` and
// `isCompleted`, which come from the shared inbox state tables.

interface PhoneItemBase {
  /**
   * ALREADY NAMESPACED — `swcall:{sid}` / `swsms:{sid}`.
   *
   * Used as the row key and the selection key. SignalWire SIDs are bare UUIDs with no
   * type prefix, so without the namespace a call and a text could collide with each
   * other and with the Gmail / Outlook / Chat ids that share the inbox's id space.
   */
  id: string;
  sid: string;
  direction: 'inbound' | 'outbound';
  /** The customer's number — what "call back" dials and what keys an SMS thread. */
  counterparty: string;
  /**
   * The saved contact's name for `counterparty`, or null when nobody has saved it.
   *
   * Resolved per request on the server, so renaming a contact relabels every row within
   * one poll. Display as `counterpartyName ?? formatE164(counterparty)` — never INSTEAD
   * of keeping the number available, which is what a call-back or a reply needs.
   */
  counterpartyName?: string | null;
  supportNumber: string;
  /** ISO. The merge key against emails and chat messages. */
  at: string;
  isRead: boolean;
  isCompleted: boolean;
}

export interface CallItem extends PhoneItemBase {
  kind: 'call';
  status: string;
  /**
   * NOT derivable from `status`: an inbound call nobody answered still reports
   * `completed` on the leg SignalWire returns, because the <Dial> completed. The
   * server resolves this from the SIP child leg.
   */
  outcome: 'answered' | 'missed' | 'failed' | 'in-progress';
  durationSec: number;
  hasRecording: boolean;
  /**
   * This row is a VOICEMAIL rather than a recorded conversation.
   *
   * A voicemail is the call row, not a second row: the missed call and the message it
   * left are one event, so reusing the call's id keeps read/completed state, bulk select
   * and the badges working unchanged.
   *
   * Derived on the server, not stored, because the two are mutually exclusive —
   * `record-from-answer-dual` only starts once the dialled party answers, so a call
   * nobody answered has no conversation to record. A recording on an unanswered call is
   * therefore a message somebody left.
   */
  hasVoicemail: boolean;
  /** The leg this is a child of. An outbound call's recording lives on its parent. */
  parentCallSid: string | null;
  /**
   * The AI one-liner, for the row itself — so a call can be triaged without opening it.
   *
   * Null until the summary worker gets to it (minutes after the call), and always null
   * when PHONE_SUMMARIZE_CALLS is off, so every consumer has to render without it.
   */
  summaryLine?: string | null;
}

/**
 * How many files may ride on one text, and how large one may be BEFORE shrinking.
 *
 * ⚠️ Mirrors `mms-staging.util.ts`, and neither number is the real limit. The server
 * re-encodes an attachment down to what a carrier will actually deliver (about a megabyte
 * for the whole message), so this cap is deliberately generous — a phone photo is 3-8 MB as
 * a matter of course, and refusing those in the browser would make the feature unusable.
 * What these do is stop somebody waiting through the upload of a 200 MB video that could
 * never be sent.
 */
export const MAX_MMS_FILES = 3;
export const MAX_MMS_UPLOAD_BYTES = 25 * 1024 * 1024;

/** What the file picker offers. A convenience — `isMmsImageFile` is the actual filter. */
export const MMS_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';

/**
 * May this file ride on a text message? Pictures only.
 *
 * ⚠️ Mirrors `isMmsImage` in server `phone/mms-shrink.util.ts`, which is what actually
 * refuses the upload. This copy exists so a dropped or pasted file is rejected with a
 * sentence in the composer instead of travelling 25 MB to earn a 400 — and, like every
 * mirrored rule here, if the two disagree the browser is the one that is wrong.
 *
 * A browser sometimes reports no type at all for a dragged file, so an empty `type` falls
 * back to the extension rather than being refused outright.
 */
export function isMmsImageFile(file: File): boolean {
  const mime = (file.type || '').split(';')[0]?.trim().toLowerCase() ?? '';
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
  const byExt: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  const allowed = new Set(Object.values(byExt));
  if (!mime) return ext in byExt;
  if (!allowed.has(mime)) return false;
  // The name has to corroborate the type, matching the server. No extension is fine —
  // a pasted screenshot often has none.
  return !ext || byExt[ext] === mime;
}

/** One picture, clip or file attached to a text. */
export interface SmsMedia {
  sid: string;
  contentType: string;
  /** Bound to this attachment and short-lived — see the server's `sms-media-token.util`. */
  token: string;
}

export interface SmsItem extends PhoneItemBase {
  kind: 'sms';
  body: string;
  numMedia: number;
  status: string;
  errorCode: number | null;
  /**
   * The attachments, present only in a THREAD — the inbox list is polled and listing media
   * costs a provider request per message. A list row shows `numMedia` instead.
   */
  media?: SmsMedia[];
}

/** Where the browser fetches one MMS attachment. Proxied: the provider's own URL is public. */
export function smsMediaUrl(
  media: SmsMedia,
  messageSid: string,
  opts: { download?: boolean } = {},
): string {
  const query = new URLSearchParams({ token: media.token });
  if (opts.download) query.set('download', '1');
  return `${API}/phone/sms-media/${encodeURIComponent(messageSid)}/${encodeURIComponent(media.sid)}?${query.toString()}`;
}

export type PhoneItem = CallItem | SmsItem;

export interface PhoneTimelineResult {
  items: PhoneItem[];
  nextCursor: string | null;
  hasMore: boolean;
  /** False when the company has no number — the phone source is hidden entirely. */
  hasNumber: boolean;
  supportNumber: string | null;
}

export interface SmsThreadResult {
  messages: SmsItem[];
  peer: string;
  supportNumber: string | null;
}

export interface CallRecording {
  sid: string;
  durationSec: number;
  createdAt: string | null;
  /** Bound to this recording and short-lived — see recordingUrl. */
  token: string;
}

/**
 * The AI summary of a call, when there is one.
 *
 * `pending` means the server has queued it and the sweep has not finished — the hook
 * polls while this is the state. `skipped` is not a failure: the call had no audio, or
 * nothing was said. The server never sends its internal error text; `reason` is a fixed
 * sentence per state.
 */
export interface CallSummary {
  status: 'pending' | 'ready' | 'skipped' | 'failed';
  /** The brief summary: 2-4 sentences. */
  summary: string | null;
  /** One line, the same text the inbox row shows. */
  shortSummary: string | null;
  /** What was actually said, verbatim. Only ever present on a READY summary. */
  transcript: string | null;
  reason: string | null;
  generatedAt: string | null;
}

export interface CallRecordingsResult {
  recordings: CallRecording[];
  /** Null when summarisation is switched off, or the call predates the feature. */
  summary: CallSummary | null;
}

/** One page of the company's calls + SMS, newest first. */
export async function fetchPhoneTimeline(
  token: string,
  companyId: number,
  before?: string,
  limit = 25,
): Promise<PhoneTimelineResult> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/timeline?${params.toString()}`,
    { headers: JSON_HEADERS },
  );
  if (!res.ok) throw await failure(res, 'Failed to load calls and messages');
  return res.json() as Promise<PhoneTimelineResult>;
}

/** The whole SMS conversation with one number, oldest first. */
export async function fetchSmsThread(
  token: string,
  companyId: number,
  peer: string,
): Promise<SmsThreadResult> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/sms-thread?peer=${encodeURIComponent(peer)}`,
    { headers: JSON_HEADERS },
  );
  if (!res.ok) throw await failure(res, 'Failed to load the conversation');
  return res.json() as Promise<SmsThreadResult>;
}

/**
 * Send a text from the company's support number, with or without attachments.
 *
 * Always multipart, even with no files: one request shape rather than two, and the server
 * route is multipart regardless. Note NO `Content-Type` header — the browser has to set it
 * itself so the multipart boundary is included.
 */
export async function sendSms(
  token: string,
  companyId: number,
  to: string,
  body: string,
  attachments: File[] = [],
): Promise<SmsItem> {
  const form = new FormData();
  form.set('to', to);
  form.set('body', body);
  for (const file of attachments) form.append('attachments', file, file.name);

  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/sms`,
    { method: 'POST', body: form },
  );
  if (!res.ok) throw await failure(res, 'Failed to send the message');
  return res.json() as Promise<SmsItem>;
}

/**
 * Mark the call the agent is on COMPLETED, resolving which inbox row that is server-side.
 *
 * Takes the sid the softphone holds and returns the row id it actually wrote, because the
 * two differ on every click-to-call: the browser's leg is the `outbound-api` parent, and
 * the rendered row is its `outbound-dial` child. Building `swcall:{sid}` here instead would
 * write against a row that does not exist — silently. There is no client-side `swcall:`
 * constructor anywhere in this app, deliberately, and this is why.
 *
 * ⚠️ Call this BEFORE hanging up. The server finds the child leg by asking SignalWire which
 * legs are live, and after the BYE there are none.
 */
export async function completeCall(
  token: string,
  companyId: number,
  sid: string,
): Promise<{ itemId: string }> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/calls/${encodeURIComponent(sid)}/complete`,
    { method: 'POST' },
  );
  if (!res.ok) throw await failure(res, 'Failed to mark the call complete');
  return res.json() as Promise<{ itemId: string }>;
}

/**
 * Place a call. Rings THIS browser first, then dials the customer with the company's
 * number as caller ID — so the softphone overlay takes over from here exactly as it
 * does for an inbound call.
 */
export async function startCall(
  token: string,
  companyId: number,
  to: string,
): Promise<{ callSid: string; to: string; companyName: string }> {
  // BEFORE the request, not after it resolves: SignalWire forks our leg the moment the
  // POST is accepted, so the INVITE can beat the response back. See `dialIntent.ts`.
  markDialedHere();
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/calls`,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ to }) },
  );
  if (!res.ok) throw await failure(res, 'Failed to start the call');
  return res.json() as Promise<{
    callSid: string;
    to: string;
    companyName: string;
  }>;
}

/**
 * Recordings for one call, plus its AI summary.
 *
 * `parentCallSid` is passed through because the summary is keyed by the leg the `<Dial>`
 * ran on, which for an OUTBOUND call is the parent — not the sid of the row on screen.
 * Omitting it shows "no summary" on every outbound call.
 */
export async function fetchCallRecordings(
  token: string,
  companyId: number,
  sid: string,
  parentCallSid?: string | null,
): Promise<CallRecordingsResult> {
  const qs = parentCallSid
    ? `?parentCallSid=${encodeURIComponent(parentCallSid)}`
    : '';
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/calls/${encodeURIComponent(sid)}/recordings${qs}`,
    { headers: JSON_HEADERS },
  );
  if (!res.ok) throw await failure(res, 'Failed to load the recording');
  return res.json() as Promise<CallRecordingsResult>;
}

export interface PhoneCounts {
  unread: number;
  uncompleted: number;
  /** Unread inbound missed calls, voicemails included — the Missed calls folder badge. */
  missedUnread: number;
}

/** Unread / uncompleted / missed phone counts for this company's folder badges. */
export async function fetchPhoneCounts(
  token: string,
  companyId: number,
): Promise<PhoneCounts> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/counts`,
    { headers: JSON_HEADERS },
  );
  if (!res.ok) return { unread: 0, uncompleted: 0, missedUnread: 0 };
  return res.json() as Promise<PhoneCounts>;
}

/**
 * Playable URL for a recording.
 *
 * Token in the query string because a media element cannot send an Authorization
 * header. It is the RECORDING's own token, handed back by the recordings list after
 * that endpoint confirmed the call belongs to this company — not the session token, so
 * it cannot be pointed at a different recording.
 *
 * Points at OUR server, never SignalWire: SignalWire serves recording media with no
 * authentication at all, so its URL would be a permanent public link to a client's
 * recorded phone call.
 */
export function recordingUrl(recording: CallRecording): string {
  return `${API}/phone/recordings/${encodeURIComponent(recording.sid)}?token=${encodeURIComponent(recording.token)}`;
}

/**
 * The call ringing this company right now, or null.
 *
 * Company-scoped on purpose. `fetchPendingCall` answers "is a call ringing for ME",
 * which is empty for an admin the call was not routed to — even though their browser is
 * holding the INVITE and could answer it.
 */
export async function fetchRingingCall(
  token: string,
  companyId: number,
): Promise<IncomingCallPayload | null> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/ringing`,
    { headers: JSON_HEADERS },
  );
  if (!res.ok) return null;
  const text = await res.text();
  return text ? (JSON.parse(text) as IncomingCallPayload) : null;
}

/**
 * A call on this company's number right now — whoever is on it, in whichever browser.
 *
 * Unlike `fetchRingingCall` this is not about answering: it is what lets every other
 * viewer see the line is busy, and what disables the call buttons while it is.
 */
export interface ActiveCall {
  companyId: number;
  callSid: string | null;
  direction: 'inbound' | 'outbound';
  /** `dialing` is the moment between Call and SignalWire creating the call. */
  state: 'dialing' | 'ringing' | 'active';
  /** Null when the server could not tell who it is (e.g. a call it learned of from SignalWire). */
  userName: string | null;
  /** The viewer is the person on the call — perhaps in another tab or browser. */
  isViewer: boolean;
  /** The customer's number. Empty when unknown. */
  peer: string;
  peerName: string | null;
  /** From the server's clock, so a wrong local clock still shows the right timer. */
  elapsedSec: number;
}

export async function fetchActiveCall(
  token: string,
  companyId: number,
): Promise<ActiveCall | null> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/active-call`,
    { headers: JSON_HEADERS },
  );
  if (!res.ok) return null;
  const text = await res.text();
  return text ? (JSON.parse(text) as ActiveCall) : null;
}

/**
 * Tell the server this browser answered an inbound call, so other viewers see WHO is on it.
 * Best-effort: the call itself does not depend on it.
 */
export async function reportCallAnswered(
  token: string,
  companyId: number,
  callSid: string,
): Promise<void> {
  await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/calls/${encodeURIComponent(callSid)}/answered`,
    { method: 'POST', headers: JSON_HEADERS },
  );
}

export type PhoneStateAction = 'read' | 'unread' | 'complete' | 'uncomplete';

/** Per-item read / completed state. One function, not four near-identical ones. */
export async function markPhoneItem(
  token: string,
  companyId: number,
  itemId: string,
  action: PhoneStateAction,
): Promise<void> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/items/${action}`,
    { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ itemId }) },
  );
  if (!res.ok) throw await failure(res, `Failed to mark ${action}`);
}

// ─── Hold ────────────────────────────────────────────────────────────────────

/** Which track a company uses on hold. `audioId: null` means none is configured. */
export interface HoldAudio {
  audioId: number | null;
  name?: string;
}

export async function fetchHoldAudio(
  token: string,
  companyId: number,
): Promise<HoldAudio> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/hold-audio`,
    { method: 'GET' },
  );
  if (!res.ok) throw await failure(res, 'Failed to load the hold music');
  return res.json() as Promise<HoldAudio>;
}

/**
 * URL the browser can play a track from.
 *
 * The token rides in the query string because an <audio> element cannot send an
 * Authorization header — the same reason internalAttachmentUrl is shaped this way.
 */
export function phoneAudioUrl(token: string, audioId: number): string {
  return `${API}/phone/audio/${audioId}?token=${encodeURIComponent(token)}`;
}

/**
 * Pause / resume the call recording around a hold.
 *
 * Both are BEST EFFORT and deliberately never throw: the hold music is played by this
 * browser regardless, and a caller left in silence because a provider call failed is a
 * worse outcome than a recording that contains music.
 */
export async function setCallHold(
  token: string,
  companyId: number,
  callSid: string,
  held: boolean,
): Promise<void> {
  try {
    await fetchWithAuth(
      token,
      `${API}/phone/companies/${companyId}/calls/${encodeURIComponent(callSid)}/${
        held ? 'hold' : 'resume'
      }`,
      { method: 'POST' },
    );
  } catch {
    /* best effort — see the docblock */
  }
}

/**
 * Send a still-ringing call to voicemail — the waiting call's "Decline".
 *
 * THROWS, unlike `setCallHold` above and following `transferCallBlind`'s rule: a decline
 * that silently did nothing leaves the agent believing they dealt with the caller while
 * that caller is still ringing.
 *
 * Note this is not a local dismissal. Rejecting the INVITE here would end only THIS
 * browser's branch — every browser shares one SIP credential — so the other branches would
 * hold the `<Dial>` open until its timeout and the caller would go on ringing. The server
 * redirects the leg, which ends it for everyone.
 */
export async function declineCall(
  token: string,
  companyId: number,
  callSid: string,
): Promise<{ voicemail: boolean }> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/calls/${encodeURIComponent(
      callSid,
    )}/decline`,
    { method: 'POST', headers: JSON_HEADERS },
  );
  if (!res.ok) throw await failure(res, 'Could not decline the call');
  return (await res.json()) as { voicemail: boolean };
}

/**
 * End a company call on the provider — every leg of it — not just in this browser.
 *
 * ── WHY A LOCAL BYE IS NOT ENOUGH ─────────────────────────────────────────────
 * Hanging up used to be pure SIP: a BYE on this browser's own leg, trusting `<Dial>` to
 * take the customer's leg with it. Verified on the live account, it does not always — an
 * outbound leg to a US number stayed `ringing` for 3.5 hours after its parent completed.
 * Because that leg carries the company's support number, the server went on reporting the
 * line busy: the agent saw "…is on a call on this line" after hanging up, and every
 * further dial was refused with a 409.
 *
 * ⚠️ **Call this BEFORE the BYE, not after.** The server asks SignalWire which legs are
 * live, and after the BYE lands there are none — the same ordering constraint
 * `endAndComplete` documents in `CallOverlay`.
 *
 * ⚠️ **Best-effort, so it never delays the hang-up.** The agent pressed the red button;
 * a slow or failing provider must not keep them connected while we wait. A failure
 * degrades to exactly the old behaviour, which is why this resolves rather than throws.
 */
/**
 * Hang up while the page is going away — a refresh, a close, a navigation.
 *
 * ⚠️ `keepalive`, and that is the entire reason this exists beside `hangUpCall`. A normal
 * `fetch` is CANCELLED when the document unloads, so the ordinary hang-up issued from a
 * `pagehide` handler never reaches the server. `keepalive` lets the request outlive the
 * page (capped at 64 KB, which this is nowhere near).
 *
 * `navigator.sendBeacon` would also survive, but it cannot set an `Authorization` header
 * and this route is JWT-guarded — so a beacon would need the token on the query string,
 * putting a credential in the access logs for no gain.
 *
 * No `await` is possible or wanted: by the time this returns the page is gone.
 */
export function hangUpCallOnUnload(
  token: string,
  companyId: number,
  callSid: string,
): void {
  try {
    void fetch(
      `${API}/phone/companies/${companyId}/calls/${encodeURIComponent(
        callSid,
      )}/hangup`,
      {
        method: 'POST',
        headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
        keepalive: true,
      },
    ).catch(() => undefined);
  } catch {
    // A page mid-unload is the one place a throw here would be invisible anyway.
  }
}

export async function hangUpCall(
  token: string,
  companyId: number,
  callSid: string,
): Promise<{ ended: string[] } | null> {
  try {
    const res = await fetchWithAuth(
      token,
      `${API}/phone/companies/${companyId}/calls/${encodeURIComponent(
        callSid,
      )}/hangup`,
      { method: 'POST', headers: JSON_HEADERS },
    );
    if (!res.ok) {
      console.warn('[softphone] server hangup failed', res.status);
      return null;
    }
    return (await res.json()) as { ended: string[] };
  } catch (err) {
    console.warn('[softphone] server hangup threw', err);
    return null;
  }
}

/**
 * Hand a company call to a colleague and drop out — a blind (cold) transfer.
 *
 * `targetUserId`, never a phone number: the picker commits only directory choices, and
 * the server takes only a user id, so a transfer can never become a way to dial out.
 *
 * ⚠️ This THROWS, unlike `setCallHold` which deliberately swallows. Pausing a recording
 * is cosmetic; a transfer that silently failed leaves the agent believing the client was
 * handed over when they are still sitting on the line.
 */
export async function transferCallBlind(
  token: string,
  companyId: number,
  callSid: string,
  targetUserId: number,
): Promise<TransferResult> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/calls/${encodeURIComponent(callSid)}/transfer/blind`,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ targetUserId }),
    },
  );
  if (!res.ok) throw await failure(res, 'Could not transfer the call');
  return res.json() as Promise<TransferResult>;
}

/**
 * Where a blind transfer has got to.
 *
 * `ringing` -> `answered` is the happy path. `no-answer` is NOT the same as `ended`: the
 * colleague let it ring out and the caller is in the company's voicemail, while the peer
 * leg is still very much up.
 */
export type TransferState = 'ringing' | 'answered' | 'no-answer' | 'ended';

export interface TransferResult {
  /** The leg that was handed over. Informational — never post it back as a sid. */
  transferredSid: string;
  target: { id: number; name: string };
}

export interface TransferStatus {
  state: TransferState;
  targetName: string | null;
}

/**
 * How a transfer is going — polled by the card the transferring agent is watching.
 *
 * ⚠️ `callSid` is the ROOT sid (`info.callSid`), NOT the `transferredSid` the POST
 * returned. Every guard in the phone module runs on the root and leg sids are derived
 * server-side; which leg this actually inspects is remembered there.
 */
export async function fetchTransferStatus(
  token: string,
  companyId: number,
  callSid: string,
): Promise<TransferStatus> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/calls/${encodeURIComponent(callSid)}/transfer-status`,
  );
  if (!res.ok) throw await failure(res, 'Could not check the transfer');
  return res.json() as Promise<TransferStatus>;
}

export interface Presence {
  /** Reachable right now: an open event stream, or a recent heartbeat. */
  userIds: number[];
  /** On a call right now. Heartbeat-only — the server is never told who answered. */
  busyUserIds: number[];
}

/**
 * Which colleagues are reachable, and which are on a call.
 *
 * ⚠️ ADVISORY ONLY — see the route's own warning. It is better than it was (a posted
 * heartbeat gets through the office TLS proxy where SSE does not), which makes it MORE
 * tempting to trust: a colleague with the app closed is simply absent, and looks exactly
 * like one whose heartbeat is a second late. Render it, never gate on it.
 */
export async function fetchPresence(token: string): Promise<Presence> {
  const res = await fetchWithAuth(token, `${API}/phone/presence`);
  if (!res.ok) throw await failure(res, 'Failed to load who is available');
  return res.json() as Promise<Presence>;
}

/**
 * "I am here, and this is whether I am on a call."
 *
 * Deliberately silent on failure: a missed beat means this user looks offline in a
 * picker for 45 seconds, which must never surface as an error toast over whatever they
 * were actually doing.
 */
export async function postPresence(
  token: string,
  busy: boolean,
): Promise<void> {
  await fetchWithAuth(token, `${API}/phone/presence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ busy }),
  }).catch(() => undefined);
}

// ─── Conference: add call, hold, swap, merge, drop ───────────────────────────

/**
 * How one other person on the call appears.
 *
 * `ringing` is a leg that has been dialled but has not joined the room yet, and it is
 * genuinely different from `gone` — dropping the row the instant it has no participant
 * would make a party vanish a fraction of a second after the agent asked for them.
 */
export type PartyState = 'ringing' | 'connected' | 'held' | 'gone';

export interface ConferenceParty {
  /**
   * An OPAQUE id the server issued (`peer`, `p2`, …) — never a call sid.
   *
   * Post this back to name a person. A leg sid would be refused: every guard runs on the
   * root sid and the server derives the rest itself.
   */
  id: string;
  label: string;
  state: PartyState;
}

export interface ConferenceStatus {
  active: boolean;
  parties: ConferenceParty[];
  /** Nobody is held: everybody can hear everybody. */
  merged: boolean;
  canAdd: boolean;
  /** Swapping only means something with exactly two other people to swap between. */
  canSwap: boolean;
}

/** Exactly one of these. The server resolves it — the client never picks the number. */
export type AddCallTarget =
  | { targetUserId: number }
  | { phone: string }
  | { contactId: number };

const conferenceUrl = (companyId: number, callSid: string, op: string) =>
  `${API}/phone/companies/${companyId}/calls/${encodeURIComponent(callSid)}/conference/${op}`;

/**
 * Every conference action THROWS on failure, following `transferCallBlind`'s rule and
 * not `setCallHold`'s.
 *
 * A hold or swap that silently did nothing leaves an agent talking to the wrong person,
 * or believing a client is parked while that client is listening. That has to reach the
 * UI; pausing a recording does not.
 *
 * ⚠️ `callSid` is always the ROOT sid (`info.callSid`).
 */
async function conferenceAction(
  token: string,
  companyId: number,
  callSid: string,
  op: string,
  body: Record<string, unknown> | undefined,
  fallback: string,
): Promise<ConferenceStatus> {
  const res = await fetchWithAuth(token, conferenceUrl(companyId, callSid, op), {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw await failure(res, fallback);
  return res.json() as Promise<ConferenceStatus>;
}

export function addCallToConference(
  token: string,
  companyId: number,
  callSid: string,
  target: AddCallTarget,
): Promise<ConferenceStatus> {
  return conferenceAction(
    token,
    companyId,
    callSid,
    'add',
    target,
    'Could not add them to the call',
  );
}

export function setConferenceHold(
  token: string,
  companyId: number,
  callSid: string,
  partyId: string,
  held: boolean,
): Promise<ConferenceStatus> {
  return conferenceAction(
    token,
    companyId,
    callSid,
    'hold',
    { partyId, held },
    held ? 'Could not put them on hold' : 'Could not take them off hold',
  );
}

export function swapConference(
  token: string,
  companyId: number,
  callSid: string,
): Promise<ConferenceStatus> {
  return conferenceAction(
    token,
    companyId,
    callSid,
    'swap',
    undefined,
    'Could not swap calls',
  );
}

export function mergeConference(
  token: string,
  companyId: number,
  callSid: string,
): Promise<ConferenceStatus> {
  return conferenceAction(
    token,
    companyId,
    callSid,
    'merge',
    undefined,
    'Could not merge the calls',
  );
}

export function dropConferenceParty(
  token: string,
  companyId: number,
  callSid: string,
  partyId: string,
): Promise<ConferenceStatus> {
  return conferenceAction(
    token,
    companyId,
    callSid,
    'drop',
    { partyId },
    'Could not remove them from the call',
  );
}

/** Polled while a conference is live. `callSid` is the ROOT sid. */
export async function fetchConferenceStatus(
  token: string,
  companyId: number,
  callSid: string,
): Promise<ConferenceStatus> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/calls/${encodeURIComponent(callSid)}/conference-status`,
  );
  if (!res.ok) throw await failure(res, 'Could not check the call');
  return res.json() as Promise<ConferenceStatus>;
}

/**
 * Decline a ringing call and text the caller back, in one server action.
 *
 * ⚠️ The INDEX of one of the company's configured quick replies, never free text. A route
 * that took a body would be an "send any SMS from any company's number" primitive
 * reachable from a ringing call.
 *
 * Throws, like `declineCall`: if the text cannot be sent the call is deliberately left
 * ringing, so the agent can still answer it — and they need to be told why.
 */
export async function declineWithText(
  token: string,
  companyId: number,
  callSid: string,
  index: number,
): Promise<{ voicemail: boolean; texted: boolean }> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/calls/${encodeURIComponent(
      callSid,
    )}/decline-with-text`,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ index }),
    },
  );
  if (!res.ok) throw await failure(res, 'Could not send that reply');
  return res.json() as Promise<{ voicemail: boolean; texted: boolean }>;
}
