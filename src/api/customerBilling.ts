import { fetchWithAuth } from './client';

const API = '/api';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ── Plan ─────────────────────────────────────────────────────────────────────

/** The monthly plan: a subscriber's transaction limit and the free trial's allowances. */
export interface SubscriptionPlan {
  monthlyTransactionLimit: number;
  warnPercent: number;
  trialTransactions: number;
  trialTexts: number;
  trialCallMinutes: number;
  updatedAt: string;
}

export type SubscriptionPlanInput = Omit<SubscriptionPlan, 'updatedAt'>;

// ── Subscriptions ────────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | 'NONE'
  | 'INCOMPLETE'
  | 'INCOMPLETE_EXPIRED'
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'UNPAID'
  | 'CANCELED'
  | 'PAUSED';

/** Why the customer can (or cannot) use the app — the customer API's `accessOf`. */
export type AccessReason = 'PAID' | 'PAST_DUE' | 'FREE' | 'TRIAL' | 'TRIAL_USED' | 'UNPAID' | 'ENDED' | 'NONE';

export type SubscriptionFilter = 'all' | 'active' | 'past_due' | 'free' | 'trial' | 'trial_used' | 'locked';

export type TrialItem = 'transactions' | 'texts' | 'callMinutes';

export interface UsedOf {
  used: number;
  limit: number;
}

export interface TrialUsage {
  transactions: UsedOf;
  texts: UsedOf;
  callMinutes: UsedOf;
  usedUp: TrialItem[];
}

export interface CustomerSubscriptionRow {
  /** `stripeCustomerId`: its Stripe Customer (every account has one since 2026-11-25). */
  customer: { id: number; name: string; email: string | null; phone: string | null; stripeCustomerId: string | null };
  status: SubscriptionStatus;
  access: AccessReason;
  amountCents: number | null;
  currency: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  freeUntil: string | null;
  freeForever: boolean;
  failedSince: string | null;
  lastFailureMessage: string | null;
  everPaid: boolean;
  trialStartedAt: string | null;
  /** The customer's own limit; null = the plan's. */
  transactionLimit: number | null;
  month: { month: string; used: number; limit: number };
  /** Only for a customer who never paid. */
  trial: TrialUsage | null;
}

export interface SubscriptionsResponse {
  month: string;
  counts: Record<SubscriptionFilter, number>;
  subscriptions: CustomerSubscriptionRow[];
}

// ── Billing transactions ─────────────────────────────────────────────────────

export type BillingTransactionKind = 'SUBSCRIPTION_START' | 'RENEWAL' | 'PRORATION' | 'REFUND' | 'DISPUTE' | 'FREE_PROMO';
export type BillingTransactionStatus = 'SUCCEEDED' | 'FAILED' | 'ACTION_REQUIRED' | 'REFUNDED' | 'DISPUTED' | 'FREE';

export interface BillingTransaction {
  id: number;
  customerId: number;
  kind: BillingTransactionKind;
  status: BillingTransactionStatus;
  amountCents: number;
  currency: string;
  attemptCount: number | null;
  failureCode: string | null;
  declineCode: string | null;
  failureMessage: string | null;
  nextRetryAt: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  receiptUrl: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  promoCode: string | null;
  occurredAt: string;
  customer: { id: number; name: string; email: string | null };
}

export interface BillingTransactionsResponse {
  transactions: BillingTransaction[];
  totals: { succeededCents30d: number; succeededCount30d: number; failedCount30d: number };
}

// ── Promo codes ──────────────────────────────────────────────────────────────

/** 2026-11-23: every code is a free subscription — `freeMonths` months, null = forever. */
export interface PromoCode {
  id: number;
  code: string;
  kind: 'FREE_SUBSCRIPTION';
  freeMonths: number | null;
  active: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  note: string | null;
  createdAt: string;
}

export interface PromoCodeInput {
  code: string;
  freeMonths: number | null;
  active: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  note: string | null;
}

// ── Legacy per-Generate payments ─────────────────────────────────────────────

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

export async function fetchSubscriptionPlan(token: string): Promise<SubscriptionPlan> {
  const res = await fetchWithAuth(token, `${API}/customer-billing/plan`);
  await throwOnError(res, 'Could not load the plan');
  return res.json() as Promise<SubscriptionPlan>;
}

export async function updateSubscriptionPlan(
  token: string,
  data: Partial<SubscriptionPlanInput>,
): Promise<SubscriptionPlan> {
  const res = await fetchWithAuth(token, `${API}/customer-billing/plan`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  await throwOnError(res, 'Could not save the plan');
  return res.json() as Promise<SubscriptionPlan>;
}

export async function fetchSubscriptions(token: string, status: SubscriptionFilter = 'all'): Promise<SubscriptionsResponse> {
  const res = await fetchWithAuth(token, `${API}/customer-billing/subscriptions?status=${status}`);
  await throwOnError(res, 'Could not load subscriptions');
  return res.json() as Promise<SubscriptionsResponse>;
}

export async function fetchCustomerSubscription(token: string, customerId: number): Promise<CustomerSubscriptionRow> {
  const res = await fetchWithAuth(token, `${API}/customer-billing/subscriptions/${customerId}`);
  await throwOnError(res, 'Could not load the subscription');
  return res.json() as Promise<CustomerSubscriptionRow>;
}

/** null = back to the plan's limit. */
export async function setCustomerTransactionLimit(
  token: string,
  customerId: number,
  transactionLimit: number | null,
): Promise<CustomerSubscriptionRow> {
  const res = await fetchWithAuth(token, `${API}/customer-billing/subscriptions/${customerId}/limit`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ transactionLimit }),
  });
  await throwOnError(res, 'Could not save the limit');
  return res.json() as Promise<CustomerSubscriptionRow>;
}

export async function restartCustomerTrial(token: string, customerId: number): Promise<CustomerSubscriptionRow> {
  const res = await fetchWithAuth(token, `${API}/customer-billing/subscriptions/${customerId}/restart-trial`, {
    method: 'POST',
  });
  await throwOnError(res, 'Could not restart the trial');
  return res.json() as Promise<CustomerSubscriptionRow>;
}

export async function fetchBillingTransactions(
  token: string,
  opts: { status?: BillingTransactionStatus | null; customerId?: number } = {},
): Promise<BillingTransactionsResponse> {
  const q = new URLSearchParams();
  if (opts.status) q.set('status', opts.status);
  if (opts.customerId) q.set('customerId', String(opts.customerId));
  const qs = q.toString();
  const res = await fetchWithAuth(token, `${API}/customer-billing/transactions${qs ? `?${qs}` : ''}`);
  await throwOnError(res, 'Could not load transactions');
  return res.json() as Promise<BillingTransactionsResponse>;
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
