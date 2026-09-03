import { fetchWithAuth } from './client';

const API = '/api';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** One day's opening window. `"HH:mm"`, 24-hour — the value an `<input type="time">` gives. */
export interface DayHours {
  open: string;
  close: string;
}

/**
 * The week, indexed **0 = Sunday … 6 = Saturday**, matching `WEEKDAYS` in `lib/cycle.ts`
 * and `TaskSchedule.cycleDay`. `null` means closed all day.
 */
export type WeeklyHours = (DayHours | null)[];

/** Fully resolved settings — what a caller would actually get right now. */
export interface EffectivePhoneSettings {
  timezone: string;
  weeklyHours: WeeklyHours;
  greetingMessage: string;
  afterHoursMessage: string;
  unavailableMessage: string;
  playGreeting: boolean;
  afterHoursHangUp: boolean;
  hoursEnabled: boolean;
  ringTimeoutSeconds: number;
  /** `''` means "no voice attribute — take the provider default". */
  voice: string;
  /** PhoneAudio id played while a caller is on hold. `0` means none — silence. */
  holdAudioId: number;
  voicemailEnabled: boolean;
  voicemailPrompt: string;
  voicemailMaxSeconds: number;
}

/** The per-company row as stored. **`null` means "inherit"**, and is the only absence. */
export type PhoneSettingsOverrides = {
  [K in keyof EffectivePhoneSettings]: EffectivePhoneSettings[K] | null;
};

export type SettingsSource = Record<
  keyof EffectivePhoneSettings,
  'company' | 'default'
>;

/** A token an admin can drop into a message. Served by the API so the chips cannot drift. */
export interface Placeholder {
  token: string;
  label: string;
  key: string;
  example: string;
}

export interface PhoneDefaultsResponse {
  defaults: EffectivePhoneSettings & { id: number; singleton: string };
  placeholders: Placeholder[];
}

/**
 * Everything one company's card needs, in a single round trip.
 *
 * `defaults` rides along so a field showing "Use default" can display the inherited value
 * without a second fetch, and `isOpenNow` is computed server-side because the viewer's
 * timezone is not the company's.
 */
export interface CompanyPhoneSettingsResponse {
  companyId: number;
  companyName: string;
  overrides: PhoneSettingsOverrides;
  effective: EffectivePhoneSettings;
  source: SettingsSource;
  defaults: EffectivePhoneSettings;
  isOpenNow: boolean;
  hoursToday: string;
  placeholders: Placeholder[];
}

/** Nest's error body, so the server's message reaches the admin verbatim. */
async function throwOnError(res: Response, fallback = 'Request failed') {
  if (res.ok) return;
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  throw new Error(message ?? fallback);
}

export async function fetchPhoneDefaults(
  token: string,
): Promise<PhoneDefaultsResponse> {
  const res = await fetchWithAuth(token, `${API}/phone-settings/defaults`, {
    headers: JSON_HEADERS,
  });
  await throwOnError(res, 'Could not load phone settings');
  return res.json() as Promise<PhoneDefaultsResponse>;
}

/** Partial update. Fields are non-nullable here — the defaults have nothing to inherit. */
export async function updatePhoneDefaults(
  token: string,
  data: Partial<EffectivePhoneSettings>,
): Promise<PhoneDefaultsResponse> {
  const res = await fetchWithAuth(token, `${API}/phone-settings/defaults`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  await throwOnError(res, 'Could not save phone settings');
  return res.json() as Promise<PhoneDefaultsResponse>;
}

export async function fetchCompanyPhoneSettings(
  token: string,
  companyId: number,
): Promise<CompanyPhoneSettingsResponse> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone-settings/companies/${companyId}`,
    { headers: JSON_HEADERS },
  );
  await throwOnError(res, 'Could not load this company’s phone settings');
  return res.json() as Promise<CompanyPhoneSettingsResponse>;
}

/**
 * Partial update of one company's overrides.
 *
 * **Send `null` to clear an override**; omit a key to leave it untouched. The server
 * distinguishes the two with `hasOwnProperty`, so `JSON.stringify` dropping `undefined`
 * is exactly the behaviour we want — a field the form did not touch never appears.
 */
export async function updateCompanyPhoneSettings(
  token: string,
  companyId: number,
  data: Partial<PhoneSettingsOverrides>,
): Promise<CompanyPhoneSettingsResponse> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone-settings/companies/${companyId}`,
    { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(data) },
  );
  await throwOnError(res, 'Could not save phone settings');
  return res.json() as Promise<CompanyPhoneSettingsResponse>;
}

/** Clear every override so the company inherits the defaults again. */
export async function resetCompanyPhoneSettings(
  token: string,
  companyId: number,
): Promise<CompanyPhoneSettingsResponse> {
  const res = await fetchWithAuth(
    token,
    `${API}/phone-settings/companies/${companyId}/reset`,
    { method: 'POST', headers: JSON_HEADERS },
  );
  await throwOnError(res, 'Could not reset phone settings');
  return res.json() as Promise<CompanyPhoneSettingsResponse>;
}

/** "What would a caller actually hear?" — read-only; writes nothing. */
export async function previewPhoneMessage(
  token: string,
  data: { template: string; companyId?: number; at?: string },
): Promise<{ text: string; isOpen: boolean }> {
  const res = await fetchWithAuth(token, `${API}/phone-settings/preview`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  await throwOnError(res, 'Could not build a preview');
  return res.json() as Promise<{ text: string; isOpen: boolean }>;
}
