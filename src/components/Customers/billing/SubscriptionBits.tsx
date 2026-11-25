import type { CustomerSubscriptionRow, TrialUsage, UsedOf } from '@/api/customerBilling';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ACCESS, TRIAL_ITEM_LABEL, num } from './billing-format';

export function AccessBadge({ row }: { row: Pick<CustomerSubscriptionRow, 'access'> }) {
  const a = ACCESS[row.access];
  return (
    <Badge variant="outline" className={a.className}>
      {a.label}
    </Badge>
  );
}

/** "used / limit" this month; red at (or past) the limit, amber from 80%. */
export function UsageChip({ used, limit }: UsedOf) {
  const reached = limit > 0 ? used >= limit : used > 0;
  const near = !reached && limit > 0 && used * 100 >= limit * 80;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums',
        reached
          ? 'border-red-200 bg-red-50 text-red-700'
          : near
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-slate-200 bg-slate-50 text-slate-700',
      )}
    >
      {num(used)} / {num(limit)}
    </span>
  );
}

/** The three trial allowances, compact (a table cell) or as bars (the customer page). */
export function TrialUsageList({ trial, bars = false }: { trial: TrialUsage; bars?: boolean }) {
  const items = (['transactions', 'texts', 'callMinutes'] as const).map(k => ({ k, ...trial[k] }));
  if (!bars)
    return (
      <div className="flex flex-col gap-0.5 text-xs whitespace-nowrap">
        {items.map(i => (
          <span key={i.k} className={cn('tabular-nums', i.used >= i.limit ? 'font-medium text-red-700' : 'text-muted-foreground')}>
            {TRIAL_ITEM_LABEL[i.k]} {num(i.used)}/{num(i.limit)}
          </span>
        ))}
      </div>
    );
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map(i => {
        const pct = i.limit > 0 ? Math.min(100, (i.used / i.limit) * 100) : 100;
        const out = i.used >= i.limit;
        return (
          <div key={i.k} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{TRIAL_ITEM_LABEL[i.k]}</span>
              <span className={cn('tabular-nums', out ? 'font-semibold text-red-700' : 'font-medium')}>
                {num(i.used)} / {num(i.limit)}
              </span>
            </div>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div className={cn('h-full rounded-full', out ? 'bg-red-500' : 'bg-violet-500')} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
