import { fetchWithAuth } from './client';

const API = '/api';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** One staff-to-staff call, from the viewing user's point of view. */
export interface InternalCall {
  sid: string;
  /** Relative to YOU — the same call is outbound for one participant, inbound for the other. */
  direction: 'inbound' | 'outbound';
  peer: { id: number; name: string };
  at: string;
  durationSec: number | null;
  status: string | null;
  outcome: 'answered' | 'missed' | 'in-progress';
}

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
): Promise<InternalCall[]> {
  const res = await fetchWithAuth(token, `${API}/internal-calls`, {
    method: 'GET',
  });
  await throwOnError(res, 'Failed to load your calls');
  return res.json() as Promise<InternalCall[]>;
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

export async function fetchInternalCallRecordings(
  token: string,
  sid: string,
): Promise<InternalCallRecording[]> {
  const res = await fetchWithAuth(
    token,
    `${API}/internal-calls/${encodeURIComponent(sid)}/recordings`,
    { method: 'GET' },
  );
  await throwOnError(res, 'Failed to load the recording');
  return res.json() as Promise<InternalCallRecording[]>;
}
