import { fetchWithAuth } from './client';

const API = '/api';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** The flat price of one customer Generate on cygfinance.com. 0 = free (no card asked). */
export interface CustomerPricing {
  generatePriceCents: number;
  currency: string;
  updatedAt: string;
}

export type PromoKind = 'FIXED_PRICE' | 'PERCENT_OFF';

export interface PromoCode {
  id: number;
  code: string;
  kind: PromoKind;
  /** FIXED_PRICE: cents. PERCENT_OFF: 1–100. */
  value: number;
  active: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  note: string | null;
  createdAt: string;
}

export interface PromoCodeInput {
  code: string;
  kind: PromoKind;
  value: number;
  active: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  note: string | null;
}

export type PaymentStatus = 'SUCCEEDED' | 'FREE' | 'REFUNDED';

/** One paid (or free) Generate. Brand + last 4 only — no card number is ever stored. */
export interface CustomerPayment {
  id: number;
  customerId: number;
  amountCents: number;
  listPriceCents: number;
  currency: string;
  promoCode: string | null;
  status: PaymentStatus;
  cardBrand: string | null;
  cardLast4: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
  receiptUrl: string | null;
  statementsQueued: number;
  stripePaymentIntentId: string | null;
  createdAt: string;
  customer: { id: number; name: string; email: string | null };
}

export interface CustomerPaymentsResponse {
  payments: CustomerPayment[];
  totalCents: number;
  paidCount: number;
}

/** Nest's error body, so the server's message reaches the admin verbatim. */
async function throwOnError(res: Response, fallback = 'Request failed') {
  if (res.ok) return;
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  throw new Error(message ?? fallback);
}

export async function fetchCustomerPricing(token: string): Promise<CustomerPricing> {
  const res = await fetchWithAuth(token, `${API}/customer-billing/pricing`);
  await throwOnError(res, 'Could not load the price');
  return res.json() as Promise<CustomerPricing>;
}

export async function updateCustomerPricing(
  token: string,
  generatePriceCents: number,
): Promise<CustomerPricing> {
  const res = await fetchWithAuth(token, `${API}/customer-billing/pricing`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ generatePriceCents }),
  });
  await throwOnError(res, 'Could not save the price');
  return res.json() as Promise<CustomerPricing>;
}

export async function fetchPromoCodes(token: string): Promise<PromoCode[]> {
  const res = await fetchWithAuth(token, `${API}/customer-billing/promo-codes`);
  await throwOnError(res, 'Could not load promo codes');
  return res.json() as Promise<PromoCode[]>;
}

export async function savePromoCode(
  token: string,
  data: Partial<PromoCodeInput> & { id?: number },
): Promise<PromoCode> {
  const { id, ...body } = data;
  const res = await fetchWithAuth(
    token,
    id ? `${API}/customer-billing/promo-codes/${id}` : `${API}/customer-billing/promo-codes`,
    { method: id ? 'PATCH' : 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) },
  );
  await throwOnError(res, 'Could not save the promo code');
  return res.json() as Promise<PromoCode>;
}

export async function deletePromoCode(token: string, id: number): Promise<void> {
  const res = await fetchWithAuth(token, `${API}/customer-billing/promo-codes/${id}`, {
    method: 'DELETE',
  });
  await throwOnError(res, 'Could not delete the promo code');
}

export async function fetchCustomerPayments(
  token: string,
  customerId?: number,
): Promise<CustomerPaymentsResponse> {
  const q = customerId ? `?customerId=${customerId}` : '';
  const res = await fetchWithAuth(token, `${API}/customer-billing/payments${q}`);
  await throwOnError(res, 'Could not load payments');
  return res.json() as Promise<CustomerPaymentsResponse>;
}

/** "$12.50" in the price's own currency. */
export function money(cents: number, currency = 'cad'): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currency.toUpperCase(),
    currencyDisplay: 'narrowSymbol',
  }).format(cents / 100);
}

/**
 * What a customer pays with this code against the current price. Display only — mirrors
 * the customer API's `priceFor` (which is what actually charges).
 */
export function priceWithPromo(listCents: number, promo: Pick<PromoCode, 'kind' | 'value'>): number {
  let cents =
    promo.kind === 'FIXED_PRICE'
      ? promo.value
      : Math.round((listCents * (100 - Math.min(100, Math.max(0, promo.value)))) / 100);
  cents = Math.max(0, cents);
  return cents > 0 && cents < 50 ? 50 : cents;
}
