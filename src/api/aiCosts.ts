import { fetchWithAuth } from './client';

const API = '/api';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** step12: what customer-site customers cost the firm in OpenAI (ADMIN only). */
export interface CostTotals {
  /** USD. */
  costUsd: number;
  calls: number;
  /** Text + audio, in and out. */
  tokens: number;
  /** Calls made while their model had no price — not in `costUsd`. */
  unpriced: number;
}

export interface CustomerCost extends CostTotals {
  /** null = AI work not tied to a customer. */
  customerId: number | null;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  deleted: boolean;
}

export interface CustomerCostsResponse {
  total: CostTotals;
  customers: CustomerCost[];
}

export interface CustomerCostDetail {
  customer: { id: number; name: string; email: string | null };
  total: CostTotals;
  byFeature: (CostTotals & { feature: string })[];
  byModel: (CostTotals & { model: string })[];
}

export type PriceSource = 'LITELLM' | 'MANUAL' | 'NONE';

/** A model's price, USD per 1M tokens (`perMinute`: USD per audio minute). */
export interface AiModelPrice {
  id: number;
  name: string;
  inputPerMTok: number | null;
  cachedInputPerMTok: number | null;
  outputPerMTok: number | null;
  audioInputPerMTok: number | null;
  audioOutputPerMTok: number | null;
  perMinute: number | null;
  priceSource: PriceSource;
  priceCheckedAt: string | null;
  priceChangedAt: string | null;
  calls: number;
  costUsd: number;
}

export type AiModelPriceInput = Partial<
  Pick<
    AiModelPrice,
    'inputPerMTok' | 'cachedInputPerMTok' | 'outputPerMTok' | 'audioInputPerMTok' | 'audioOutputPerMTok' | 'perMinute'
  >
> & { automatic?: boolean };

/** `{ from, to }` as YYYY-MM-DD, both optional (none = all time). */
export interface CostRange {
  from?: string;
  to?: string;
}

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

export async function fetchCustomerCosts(token: string, range: CostRange): Promise<CustomerCostsResponse> {
  const res = await fetchWithAuth(token, `${API}/ai-costs/customers${query(range)}`);
  await throwOnError(res, 'Could not load AI costs');
  return res.json() as Promise<CustomerCostsResponse>;
}

export async function fetchCustomerCost(
  token: string,
  customerId: number,
  range: CostRange,
): Promise<CustomerCostDetail> {
  const res = await fetchWithAuth(token, `${API}/ai-costs/customers/${customerId}${query(range)}`);
  await throwOnError(res, "Could not load this customer's AI costs");
  return res.json() as Promise<CustomerCostDetail>;
}

export async function fetchAiModels(token: string): Promise<AiModelPrice[]> {
  const res = await fetchWithAuth(token, `${API}/ai-costs/models`);
  await throwOnError(res, 'Could not load model prices');
  return res.json() as Promise<AiModelPrice[]>;
}

export async function updateAiModelPrice(
  token: string,
  id: number,
  input: AiModelPriceInput,
): Promise<AiModelPrice> {
  const res = await fetchWithAuth(token, `${API}/ai-costs/models/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  await throwOnError(res, 'Could not save the price');
  return res.json() as Promise<AiModelPrice>;
}

/** "$1.23", or "$0.0042" for the small amounts one customer's calls add up to. */
export function usd(n: number): string {
  const abs = Math.abs(n);
  const digits = abs === 0 ? 2 : abs < 0.01 ? 4 : 2;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 1234567 → "1.2M". */
export function compact(n: number): string {
  return n.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 });
}

/** What the AI was doing, in words. */
export const FEATURE_LABEL: Record<string, string> = {
  ASSISTANT: 'AI assistant (chat, texts, email)',
  STRONG_AI: 'Strong AI (complaints)',
  INTAKE: 'Sorting incoming texts',
  STATEMENT: 'Reading bank statements',
  ATTACHMENT: 'Reading receipts & files',
  TRANSCRIBE: 'Transcribing voice notes',
  PRODUCTS: 'Categorizing receipt items',
  BANK_ROWS: 'Categorizing bank-feed rows',
  VOICE: 'AI phone calls',
  SCHEDULE: 'Scheduled messages',
  OTHER: 'Other',
};
