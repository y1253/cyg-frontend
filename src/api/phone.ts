import { fetchWithAuth } from './client';

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
export async function searchAvailableNumbers(
  token: string,
  params: { country: string; areaCode?: string },
): Promise<AvailableNumber[]> {
  const query = new URLSearchParams({ country: params.country });
  if (params.areaCode) query.set('areaCode', params.areaCode);
  const res = await fetchWithAuth(token, `${API}/phone/available?${query}`, {
    headers: JSON_HEADERS,
  });
  if (!res.ok) throw await failure(res, 'Failed to search numbers');
  return res.json() as Promise<AvailableNumber[]>;
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

export interface IncomingCallPayload {
  companyId: number;
  companyName: string;
  from: string;
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
  /** The customer's number — what the row shows and what "call back" dials. */
  counterparty: string;
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
}

export interface SmsItem extends PhoneItemBase {
  kind: 'sms';
  body: string;
  numMedia: number;
  status: string;
  errorCode: number | null;
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
  summary: string | null;
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

/** Send a text from the company's support number. */
export async function sendSms(
  token: string,
  companyId: number,
  to: string,
  body: string,
): Promise<SmsItem> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/sms`,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ to, body }),
    },
  );
  if (!res.ok) throw await failure(res, 'Failed to send the message');
  return res.json() as Promise<SmsItem>;
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

/** Unread / uncompleted phone counts for this company's folder badges. */
export async function fetchPhoneCounts(
  token: string,
  companyId: number,
): Promise<{ unread: number; uncompleted: number }> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone/companies/${companyId}/counts`,
    { headers: JSON_HEADERS },
  );
  if (!res.ok) return { unread: 0, uncompleted: 0 };
  return res.json() as Promise<{ unread: number; uncompleted: number }>;
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
): Promise<{ transferredSid: string }> {
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
  return res.json() as Promise<{ transferredSid: string }>;
}

/**
 * Which colleagues have a live event stream open.
 *
 * ⚠️ ADVISORY ONLY — see the route's own warning. SSE is blackholed by the office TLS
 * proxy, so a perfectly reachable colleague can report offline. Render it, never gate on
 * it.
 */
export async function fetchPresence(
  token: string,
): Promise<{ userIds: number[] }> {
  const res = await fetchWithAuth(token, `${API}/phone/presence`);
  if (!res.ok) throw await failure(res, 'Failed to load who is available');
  return res.json() as Promise<{ userIds: number[] }>;
}
