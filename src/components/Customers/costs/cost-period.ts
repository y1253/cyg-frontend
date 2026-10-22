import type { CostRange } from '@/api/aiCosts';

/** The AI costs tab's period picker. */
export type CostPeriod = 'month' | 'last-month' | '30d' | 'all';

export const PERIOD_LABEL: Record<CostPeriod, string> = {
  month: 'This month',
  'last-month': 'Last month',
  '30d': 'Last 30 days',
  all: 'All time',
};

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The period as `{ from, to }` (YYYY-MM-DD, both inclusive); all time = no bounds. */
export function rangeOf(period: CostPeriod, now = new Date()): CostRange {
  if (period === 'all') return {};
  if (period === '30d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 29);
    return { from: ymd(from), to: ymd(now) };
  }
  if (period === 'last-month') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: ymd(from), to: ymd(to) };
  }
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
}
