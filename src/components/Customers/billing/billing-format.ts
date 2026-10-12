import type { CustomerPayment, PaymentStatus, PromoCode } from '@/api/customerBilling';
import { money } from '@/api/customerBilling';

/** "12.5" or "$12.50" → 1250; null when it is not a usable dollar amount. */
export function dollarsToCents(text: string): number | null {
  const t = text.trim().replace(/^\$/, '');
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

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

/** "50% off" / "$5.00 flat". */
export function promoValueText(p: Pick<PromoCode, 'kind' | 'value'>, currency = 'cad'): string {
  if (p.kind === 'PERCENT_OFF') return `${p.value}% off`;
  return p.value === 0 ? 'Free' : `${money(p.value, currency)} flat`;
}
