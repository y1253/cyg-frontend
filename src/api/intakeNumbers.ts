import { fetchWithAuth } from './client';
import { ReleaseLockedError } from './phone';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** A number customers text receipts to (`IntakeNumber`). Rows are history: released, never deleted. */
export interface IntakeNumber {
  id: number;
  sid: string;
  phoneNumber: string;
  region: string | null;
  country: string | null;
  label: string | null;
  providerReleaseAfter: string | null;
  createdAt: string;
  releasedAt: string | null;
  /** Meta's id once the number is on the firm's WhatsApp account; null = WhatsApp off. */
  whatsappPhoneNumberId: string | null;
  /** null = off. Texts keep working whatever this says. */
  whatsappStatus: IntakeWhatsAppStatus | null;
  whatsappError: string | null;
  /** How Meta sent the code while one is pending. */
  whatsappCodeMethod: 'SMS' | 'VOICE' | null;
}

export type IntakeWhatsAppStatus = 'PENDING_CODE' | 'VERIFYING' | 'CONNECTED' | 'FAILED';

/** Still being set up — the tab polls while any number is in one of these. */
export const isWhatsAppSettingUp = (n: IntakeNumber) =>
  n.whatsappStatus === 'PENDING_CODE' || n.whatsappStatus === 'VERIFYING';

async function failure(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  return new Error(message ?? fallback);
}

export async function fetchIntakeNumbers(token: string): Promise<IntakeNumber[]> {
  const res = await fetchWithAuth(token, '/api/intake-numbers', { headers: JSON_HEADERS });
  if (!res.ok) throw await failure(res, 'Failed to load the numbers');
  return res.json() as Promise<IntakeNumber[]>;
}

/** Buys the number on SignalWire and lists it on cygfinance.com. Irreversible and billable. */
export async function buyIntakeNumber(
  token: string,
  data: { phoneNumber: string; region?: string | null; country?: string; label?: string },
): Promise<IntakeNumber> {
  const res = await fetchWithAuth(token, '/api/intake-numbers', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      phoneNumber: data.phoneNumber,
      ...(data.region ? { region: data.region } : {}),
      ...(data.country ? { country: data.country } : {}),
      ...(data.label ? { label: data.label } : {}),
    }),
  });
  if (!res.ok) throw await failure(res, 'Failed to buy the number');
  return res.json() as Promise<IntakeNumber>;
}

/**
 * Disconnects (releases) the number. A lock SignalWire still holds throws
 * `ReleaseLockedError`; `deferIfLocked` takes it off the site now and releases it later.
 */
export async function releaseIntakeNumber(token: string, id: number, deferIfLocked = false): Promise<void> {
  const res = await fetchWithAuth(
    token,
    `/api/intake-numbers/${id}${deferIfLocked ? '?deferIfLocked=true' : ''}`,
    { method: 'DELETE', headers: JSON_HEADERS },
  );
  if (res.ok) return;
  if (res.status === 409) {
    const body = (await res
      .clone()
      .json()
      .catch(() => ({}))) as { code?: string; releasableAt?: string; message?: string };
    if (body.code === 'RELEASE_LOCKED' && body.releasableAt) {
      throw new ReleaseLockedError(body.message ?? 'SignalWire cannot release this number yet', body.releasableAt);
    }
  }
  throw await failure(res, 'Failed to disconnect the number');
}

/** Customers can WhatsApp this number too (texts keep working). Answers with its new state. */
export async function enableIntakeWhatsApp(token: string, id: number): Promise<IntakeNumber> {
  const res = await fetchWithAuth(token, `/api/intake-numbers/${id}/whatsapp`, { method: 'POST', headers: JSON_HEADERS });
  if (!res.ok) throw await failure(res, 'Failed to turn WhatsApp on');
  return res.json() as Promise<IntakeNumber>;
}

/** WhatsApp off for this number; customers can still text it. */
export async function disableIntakeWhatsApp(token: string, id: number): Promise<IntakeNumber> {
  const res = await fetchWithAuth(token, `/api/intake-numbers/${id}/whatsapp`, { method: 'DELETE', headers: JSON_HEADERS });
  if (!res.ok) throw await failure(res, 'Failed to turn WhatsApp off');
  return res.json() as Promise<IntakeNumber>;
}
