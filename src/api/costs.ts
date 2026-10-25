import { fetchWithAuth } from './client';
import type { CostRange } from './aiCosts';

/** The kinds of spend the Costs tab filters on. */
export type CostType = 'ai' | 'sms' | 'whatsapp' | 'calls';

export const COST_TYPES: CostType[] = ['ai', 'sms', 'whatsapp', 'calls'];

/** Label, and the bar / dot colour used for the type everywhere on the tab. */
export const COST_TYPE: Record<CostType, { label: string; bar: string; tone: string }> = {
  ai: { label: 'AI', bar: 'bg-violet-500', tone: 'bg-violet-50 text-violet-700' },
  sms: { label: 'Texts', bar: 'bg-sky-500', tone: 'bg-sky-50 text-sky-700' },
  whatsapp: { label: 'WhatsApp', bar: 'bg-emerald-500', tone: 'bg-emerald-50 text-emerald-700' },
  calls: { label: 'Calls', bar: 'bg-amber-500', tone: 'bg-amber-50 text-amber-700' },
};

/** What one customer (or everyone) cost the firm, split by type. Mirrors the server's `CostTotals`. */
export interface CostTotals {
  /** USD, every type together. */
  costUsd: number;
  /** Rows with no price yet (not in `costUsd`). */
  unpriced: number;
  /** OpenAI calls. */
  ai: { costUsd: number; count: number; tokens: number; unpriced: number };
  sms: { costUsd: number; count: number; out: number; in: number; segments: number; unpriced: number };
  whatsapp: { costUsd: number; count: number; out: number; in: number; unpriced: number };
  /** AI phone calls; `minutes` = billed minutes. */
  calls: { costUsd: number; count: number; minutes: number; unpriced: number };
}

export interface CustomerTotalCost extends CostTotals {
  /** null = no customer account (sign-up offers, unknown numbers, AI work for nobody). */
  customerId: number | null;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  deleted: boolean;
}

export interface CostsResponse {
  total: CostTotals;
  customers: CustomerTotalCost[];
}

export async function fetchAllCustomerCosts(token: string, range: CostRange): Promise<CostsResponse> {
  const q = new URLSearchParams();
  if (range.from) q.set('from', range.from);
  if (range.to) q.set('to', range.to);
  const s = q.toString();
  const res = await fetchWithAuth(token, `/api/costs/customers${s ? `?${s}` : ''}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new Error(message ?? 'Could not load costs');
  }
  return res.json() as Promise<CostsResponse>;
}
