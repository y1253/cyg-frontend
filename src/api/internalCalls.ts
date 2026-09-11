import { fetchWithAuth } from './client';
import type {
  CallSummary,
  ConferenceStatus,
  TransferResult,
  TransferStatus,
} from './phone';

const API = '/api';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** One staff-to-staff call, from the viewing user's point of view. */
export interface InternalCall {
  /**
   * Namespaced inbox id — `intcall:{sid}`, minted server-side.
   *
   * The workspace inbox keys rows and selection off ONE string space shared with
   * internal messages (`intmsg:{id}`), so a numeric message id and a bare uuid sid can
   * never collide inside a shared Set.
   */
  id: string;
  sid: string;
  /** Relative to YOU — the same call is outbound for one participant, inbound for the other. */
  direction: 'inbound' | 'outbound';
  peer: { id: number; name: string };
  at: string;
  durationSec: number | null;
  status: string | null;
  outcome: 'answered' | 'missed' | 'in-progress';
  /**
   * Both TRUE for a call you placed — the same rule `isOwn` applies to a message you
   * sent. Only the receiving side is ever stateful.
   */
  isRead: boolean;
  isCompleted: boolean;
  /**
   * There is audio worth offering a player for. There is deliberately no `hasVoicemail`
   * twin: the internal `<Dial>` has no `<Record>` fallthrough, so an unanswered staff
   * call leaves nothing behind.
   */
  hasRecording: boolean;
}

/** Same four names as `InternalFolder` — one folder chip drives both sources. */
export type InternalCallFolder = 'INBOX' | 'UNCOMPLETED' | 'UNREAD' | 'SENT';

export interface InternalCallListResult {
  calls: InternalCall[];
  nextCursor: number | null;
}

export type InternalCallStateAction =
  | 'read'
  | 'unread'
  | 'complete'
  | 'uncomplete';

export interface InternalCallRecording {
  sid: string;
  durationSec: number;
  createdAt: string | null;
  /** Per-recording playback token, NOT the session token. */
  token: string;
}

async function throwOnError(res: Response, fallback: string) {
  if (res.ok) return;
  const body = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
  };
  const message = Array.isArray(body.message)
    ? body.message.join(', ')
    : body.message;
  throw new Error(message ?? fallback);
}

export async function fetchInternalCalls(
  token: string,
  folder: InternalCallFolder = 'INBOX',
  cursor?: number | null,
): Promise<InternalCallListResult> {
  const params = new URLSearchParams({ folder });
  if (cursor) params.set('cursor', String(cursor));
  const res = await fetchWithAuth(
    token,
    `${API}/internal-calls?${params.toString()}`,
    { method: 'GET' },
  );
  await throwOnError(res, 'Failed to load your calls');
  return res.json() as Promise<InternalCallListResult>;
}

export async function fetchInternalCallCounts(
  token: string,
): Promise<{ unread: number; uncompleted: number }> {
  const res = await fetchWithAuth(token, `${API}/internal-calls/counts`, {
    method: 'GET',
  });
  await throwOnError(res, 'Failed to load your call counts');
  return res.json() as Promise<{ unread: number; uncompleted: number }>;
}

/**
 * Flip read / completed on one call. 204, empty body — mirrors
 * `setInternalMessageState`.
 *
 * A no-op server-side for a call you placed: it already projects as read and completed,
 * so there is nothing the request could have meant.
 */
export async function setInternalCallState(
  token: string,
  sid: string,
  action: InternalCallStateAction,
): Promise<void> {
  const res = await fetchWithAuth(
    token,
    `${API}/internal-calls/${encodeURIComponent(sid)}/${action}`,
    { method: 'PATCH' },
  );
  await throwOnError(res, 'Failed to update the call');
}

export async function startInternalCall(
  token: string,
  calleeId: number,
): Promise<{ callSid: string; peer: { id: number; name: string } }> {
  const res = await fetchWithAuth(token, `${API}/internal-calls`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ calleeId }),
  });
  await throwOnError(res, 'Could not place the call');
  return res.json() as Promise<{
    callSid: string;
    peer: { id: number; name: string };
  }>;
}

export interface InternalCallRecordingsResult {
  recordings: InternalCallRecording[];
  summary: CallSummary | null;
}

export async function fetchInternalCallRecordings(
  token: string,
  sid: string,
): Promise<InternalCallRecordingsResult> {
  const res = await fetchWithAuth(
    token,
    `${API}/internal-calls/${encodeURIComponent(sid)}/recordings`,
    { method: 'GET' },
  );
  await throwOnError(res, 'Failed to load the recording');
  return res.json() as Promise<InternalCallRecordingsResult>;
}

/**
 * Hand a staff-to-staff call to a third colleague and drop out.
 *
 * Participants only — an admin who is not on the call gets a 404, matching the
 * recordings route and internal messages.
 */
export async function transferInternalCallBlind(
  token: string,
  sid: string,
  targetUserId: number,
): Promise<TransferResult> {
  const res = await fetchWithAuth(
    token,
    `${API}/internal-calls/${encodeURIComponent(sid)}/transfer/blind`,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ targetUserId }),
    },
  );
  await throwOnError(res, 'Could not transfer the call');
  return res.json() as Promise<TransferResult>;
}

/**
 * How a transfer is going — polled by the card the transferring agent is watching.
 *
 * ⚠️ `sid` is the ROOT sid (`info.callSid`), NOT the `transferredSid` the POST returned.
 * `assertParticipant` looks `InternalCall` up by the root, so the transferred leg 404s on
 * exactly the half of transfers where the requester placed the call.
 */
export async function fetchInternalTransferStatus(
  token: string,
  sid: string,
): Promise<TransferStatus> {
  const res = await fetchWithAuth(
    token,
    `${API}/internal-calls/${encodeURIComponent(sid)}/transfer-status`,
  );
  await throwOnError(res, 'Could not check the transfer');
  return res.json() as Promise<TransferStatus>;
}

// ─── Conference: bring a third colleague onto a staff call ───────────────────
//
// ⚠️ COLLEAGUE-ONLY. There is no `phone` or `contactId` variant here and the server has
// no field that would accept one: a staff call has no caller ID of its own, and
// borrowing a company's support number would bill and brand a client's number — and
// surface the leg in that client's timeline.

async function internalConference(
  token: string,
  sid: string,
  op: string,
  body: Record<string, unknown> | undefined,
  fallback: string,
): Promise<ConferenceStatus> {
  const res = await fetchWithAuth(
    token,
    `${API}/internal-calls/${encodeURIComponent(sid)}/conference/${op}`,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body ?? {}) },
  );
  await throwOnError(res, fallback);
  return res.json() as Promise<ConferenceStatus>;
}

export function addToInternalConference(
  token: string,
  sid: string,
  targetUserId: number,
): Promise<ConferenceStatus> {
  return internalConference(
    token,
    sid,
    'add',
    { targetUserId },
    'Could not add them to the call',
  );
}

export function setInternalConferenceHold(
  token: string,
  sid: string,
  partyId: string,
  held: boolean,
): Promise<ConferenceStatus> {
  return internalConference(
    token,
    sid,
    'hold',
    { partyId, held },
    held ? 'Could not put them on hold' : 'Could not take them off hold',
  );
}

export function swapInternalConference(
  token: string,
  sid: string,
): Promise<ConferenceStatus> {
  return internalConference(
    token,
    sid,
    'swap',
    undefined,
    'Could not swap calls',
  );
}

export function mergeInternalConference(
  token: string,
  sid: string,
): Promise<ConferenceStatus> {
  return internalConference(
    token,
    sid,
    'merge',
    undefined,
    'Could not merge the calls',
  );
}

export function dropInternalConferenceParty(
  token: string,
  sid: string,
  partyId: string,
): Promise<ConferenceStatus> {
  return internalConference(
    token,
    sid,
    'drop',
    { partyId },
    'Could not remove them from the call',
  );
}

/** ⚠️ `sid` is the ROOT sid, the only one `assertParticipant` can look up. */
export async function fetchInternalConferenceStatus(
  token: string,
  sid: string,
): Promise<ConferenceStatus> {
  const res = await fetchWithAuth(
    token,
    `${API}/internal-calls/${encodeURIComponent(sid)}/conference-status`,
  );
  await throwOnError(res, 'Could not check the call');
  return res.json() as Promise<ConferenceStatus>;
}
