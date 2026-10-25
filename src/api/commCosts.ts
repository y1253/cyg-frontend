import { fetchWithAuth } from './client';
import type { CostRange } from './aiCosts';

const API = '/api';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** step12d: what customer-site customers' texts, WhatsApps and calls cost (ADMIN only). */
export interface CommTotals {
  /** USD. */
  costUsd: number;
  smsOut: number;
  smsIn: number;
  /** SMS segments billed (a long text is several). */
  segments: number;
  whatsappOut: number;
  whatsappIn: number;
  calls: number;
  /** Billed minutes (every started minute counts). */
  minutes: number;
  /** Texts / calls whose provider had no price yet — not in `costUsd`. */
  unpriced: number;
}

export interface CustomerCommCost extends CommTotals {
  /** null = no account (sign-up offers, unknown numbers). */
  customerId: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  deleted: boolean;
}

export interface CommCostsResponse {
  total: CommTotals;
  customers: CustomerCommCost[];
}

export type CommKind = 'SMS' | 'WHATSAPP' | 'CALL';

export interface CommRecent {
  kind: CommKind;
  id: number;
  at: string;
  direction: 'IN' | 'OUT';
  purpose: string;
  provider: string;
  from: string | null;
  to: string | null;
  segments: number | null;
  media: number | null;
  durationSec: number | null;
  minutes: number | null;
  costUsd: number | null;
  /** LIST = the provider's list price | BILLED = what the provider actually charged. */
  priceSource: 'LIST' | 'BILLED';
}

export interface CustomerCommCostDetail {
  customer: { id: number; name: string; email: string | null; phoneE164: string | null };
  total: CommTotals;
  byPurpose: { kind: CommKind; purpose: string; count: number; minutes: number; costUsd: number }[];
  recent: CommRecent[];
}

export type ProviderPriceSource = 'AUTO' | 'MANUAL' | 'NONE';

export const PROVIDER_PRICE_FIELDS = [
  'smsOutPerSegment',
  'smsInPerSegment',
  'mmsOut',
  'mmsIn',
  'voiceOutPerMin',
  'voiceInPerMin',
  'recordingPerMin',
  'whatsappOut',
  'whatsappIn',
] as const;
export type ProviderPriceField = (typeof PROVIDER_PRICE_FIELDS)[number];

export type CommProvider = Record<ProviderPriceField, number | null> & {
  id: number;
  name: string;
  label: string;
  pricingUrl: string | null;
  voicePricingUrl: string | null;
  priceSource: ProviderPriceSource;
  priceCheckedAt: string | null;
  priceChangedAt: string | null;
  priceNote: string | null;
  messages: number;
  calls: number;
  minutes: number;
  costUsd: number;
};

export type CommProviderInput = Partial<Record<ProviderPriceField, number | null>> & {
  automatic?: boolean;
  pricingUrl?: string | null;
  voicePricingUrl?: string | null;
};

async function throwOnError(res: Response, fallback = 'Request failed') {
  if (res.ok) return;
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  throw new Error(message ?? fallback);
}

const query = (r: CostRange) => {
  const q = new URLSearchParams();
  if (r.from) q.set('from', r.from);
  if (r.to) q.set('to', r.to);
  const s = q.toString();
  return s ? `?${s}` : '';
};

export async function fetchCustomerCommCost(
  token: string,
  customerId: number,
  range: CostRange,
): Promise<CustomerCommCostDetail> {
  const res = await fetchWithAuth(token, `${API}/comm-costs/customers/${customerId}${query(range)}`);
  await throwOnError(res, "Could not load this customer's phone & text costs");
  return res.json() as Promise<CustomerCommCostDetail>;
}

export async function fetchCommProviders(token: string): Promise<CommProvider[]> {
  const res = await fetchWithAuth(token, `${API}/comm-costs/providers`);
  await throwOnError(res, 'Could not load provider prices');
  return res.json() as Promise<CommProvider[]>;
}

export async function updateCommProvider(token: string, id: number, input: CommProviderInput): Promise<CommProvider> {
  const res = await fetchWithAuth(token, `${API}/comm-costs/providers/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  await throwOnError(res, 'Could not save the prices');
  return res.json() as Promise<CommProvider>;
}

/** Why a text / call was sent, in words. */
export const PURPOSE_LABEL: Record<string, string> = {
  ASSISTANT_REPLY: 'AI assistant replies',
  SEND_MESSAGE: 'Messages the AI sent on request',
  SEND_TEXT: 'Links texted during a call',
  TEXT_PERSON: 'Texts to the customer’s contacts',
  LOGIN_CODE: 'Login codes',
  SCHEDULE: 'Scheduled reports',
  AI_SCHEDULE: 'AI schedules',
  SIGNUP_OFFER: 'Sign-up offers',
  CONTACT_RELAY: 'Contact replies relayed',
  INTAKE: 'Received from the customer',
  STRONG_AI: 'Strong AI follow-ups',
  FEATURE_DONE: 'Feature request done',
  BANK_ALERT: 'Bank transaction alerts',
  OTHER: 'Other',
  INBOUND: 'Customer called us',
  REQUESTED: '“Call me” requests',
  ACCOUNT_STATUS: 'Scheduled call: account status',
  FINANCIAL_REPORT: 'Scheduled call: financial report',
  THIRD_PARTY: 'AI called a contact',
};

export const PRICE_FIELD_LABEL: Record<ProviderPriceField, { label: string; unit: string }> = {
  smsOutPerSegment: { label: 'SMS sent', unit: 'per segment' },
  smsInPerSegment: { label: 'SMS received', unit: 'per segment' },
  mmsOut: { label: 'MMS sent', unit: 'per message' },
  mmsIn: { label: 'MMS received', unit: 'per message' },
  voiceOutPerMin: { label: 'Outbound call', unit: 'per minute' },
  voiceInPerMin: { label: 'Inbound call', unit: 'per minute' },
  recordingPerMin: { label: 'Call recording', unit: 'per minute' },
  whatsappOut: { label: 'WhatsApp sent', unit: 'per message' },
  whatsappIn: { label: 'WhatsApp received', unit: 'per message' },
};

/** A unit price: "$0.00415". */
export function unitPrice(v: number | null): string {
  return v === null ? '—' : `$${v.toLocaleString('en-US', { maximumFractionDigits: 6 })}`;
}
