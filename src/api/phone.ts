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
