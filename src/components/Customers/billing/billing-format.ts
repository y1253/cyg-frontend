import { money } from '@/api/customerBilling';
import { fmtDay } from '../customer-format';
import type {
  AccessReason,
  BillingTransactionKind,
  BillingTransactionStatus,
  CustomerPayment,
  CustomerSubscriptionRow,
  PaymentStatus,
  PromoCode,
  SubscriptionFilter,
  TrialItem,
} from '@/api/customerBilling';

const BRAND: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  diners: 'Diners',
  jcb: 'JCB',
  unionpay: 'UnionPay',
};

/** "Visa •••• 4242" — the only card detail that exists (no number is stored). */
export function cardText(p: Pick<CustomerPayment, 'cardBrand' | 'cardLast4'>): string | null {
  if (!p.cardLast4) return null;
  const brand = p.cardBrand ? (BRAND[p.cardBrand] ?? p.cardBrand) : 'Card';
  return `${brand} •••• ${p.cardLast4}`;
}

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; className: string }> = {
  SUCCEEDED: { label: 'Paid', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  FREE: { label: 'Free', className: 'border-sky-200 bg-sky-50 text-sky-700' },
  REFUNDED: { label: 'Refunded', className: 'border-amber-200 bg-amber-50 text-amber-700' },
};

/** What a customer's subscription means for them right now. */
export const ACCESS: Record<AccessReason, { label: string; className: string }> = {
  PAID: { label: 'Active', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  PAST_DUE: { label: 'Past due', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  FREE: { label: 'Free', className: 'border-sky-200 bg-sky-50 text-sky-700' },
  TRIAL: { label: 'Trial', className: 'border-violet-200 bg-violet-50 text-violet-700' },
  TRIAL_USED: { label: 'Trial used up', className: 'border-red-200 bg-red-50 text-red-700' },
  UNPAID: { label: 'Unpaid', className: 'border-red-200 bg-red-50 text-red-700' },
  ENDED: { label: 'Ended', className: 'border-slate-200 bg-slate-50 text-slate-600' },
  NONE: { label: 'No plan', className: 'border-slate-200 bg-slate-50 text-slate-600' },
};

export const SUBSCRIPTION_FILTERS: { key: SubscriptionFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'past_due', label: 'Past due' },
  { key: 'free', label: 'Free' },
  { key: 'trial', label: 'Trial' },
  { key: 'trial_used', label: 'Trial used up' },
  { key: 'locked', label: 'Locked' },
];

export const TRANSACTION_STATUS: Record<BillingTransactionStatus, { label: string; className: string }> = {
  SUCCEEDED: { label: 'Paid', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  FAILED: { label: 'Failed', className: 'border-red-200 bg-red-50 text-red-700' },
  ACTION_REQUIRED: { label: 'Needs 3-D Secure', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  REFUNDED: { label: 'Refunded', className: 'border-slate-200 bg-slate-50 text-slate-600' },
  DISPUTED: { label: 'Disputed', className: 'border-red-200 bg-red-50 text-red-700' },
  FREE: { label: 'Free', className: 'border-sky-200 bg-sky-50 text-sky-700' },
};

export const TRANSACTION_STATUSES = Object.keys(TRANSACTION_STATUS) as BillingTransactionStatus[];

export const TRANSACTION_KIND: Record<BillingTransactionKind, string> = {
  SUBSCRIPTION_START: 'First payment',
  RENEWAL: 'Renewal',
  PRORATION: 'Proration',
  REFUND: 'Refund',
  DISPUTE: 'Dispute',
  FREE_PROMO: 'Free promo',
};

export const TRIAL_ITEM_LABEL: Record<TrialItem, string> = {
  transactions: 'Transactions',
  texts: 'AI texts',
  callMinutes: 'AI call minutes',
};

/** "Free for 3 months" / "Free forever". */
export function promoValueText(p: Pick<PromoCode, 'freeMonths'>): string {
  if (p.freeMonths === null) return 'Free forever';
  return `Free for ${p.freeMonths} month${p.freeMonths === 1 ? '' : 's'}`;
}

/** "12,345" */
export const num = (n: number) => n.toLocaleString();

const day = (iso: string | null) => (iso ? fmtDay(iso.slice(0, 10)) : '—');

/** "Renews Dec 1, 2026" / "Free until …" / "Free forever" / "Ends …". */
export function periodText(r: CustomerSubscriptionRow): string {
  if (r.freeForever) return 'Free forever';
  if (r.freeUntil && new Date(r.freeUntil).getTime() > Date.now()) return `Free until ${day(r.freeUntil)}`;
  if (r.currentPeriodEnd) return `${r.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${day(r.currentPeriodEnd)}`;
  return '—';
}

/** "$19.99/month", or null with no Stripe price. */
export function priceText(r: CustomerSubscriptionRow): string | null {
  return r.amountCents !== null ? `${money(r.amountCents, r.currency ?? 'cad')}/month` : null;
}
