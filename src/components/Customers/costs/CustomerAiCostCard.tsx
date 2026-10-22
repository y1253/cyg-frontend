import { useState } from 'react';
import { Coins } from 'lucide-react';
import { FEATURE_LABEL, compact, usd, type CostTotals } from '@/api/aiCosts';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAiCustomerCost } from '@/hooks/useAiCustomerCost';
import { PERIOD_LABEL, rangeOf, type CostPeriod } from './cost-period';

/** Customer detail page (step12): what this customer cost in AI, by what it did and by model. */
export function CustomerAiCostCard({ customerId }: { customerId: number }) {
  const [period, setPeriod] = useState<CostPeriod>('month');
  const { data, isLoading, isError, error } = useAiCustomerCost(customerId, rangeOf(period));

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b py-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Coins size={14} className="text-muted-foreground" />
            AI cost
          </CardTitle>
          <p className="text-muted-foreground text-xs">What this customer's AI use cost us in OpenAI.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={v => v && setPeriod(v as CostPeriod)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue>{(v: CostPeriod) => PERIOD_LABEL[v]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABEL) as CostPeriod[]).map(p => (
                <SelectItem key={p} value={p}>
                  {PERIOD_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data && (
            <div className="text-right">
              <p className="text-lg leading-tight font-semibold tabular-nums">{usd(data.total.costUsd)}</p>
              <p className="text-muted-foreground text-xs">{data.total.calls.toLocaleString()} calls</p>
            </div>
          )}
        </div>
      </CardHeader>
      {isLoading ? (
        <div className="p-4">
          <div className="bg-muted h-12 animate-pulse rounded-md" />
        </div>
      ) : isError ? (
        <p className="text-destructive p-6 text-center text-sm">{error.message}</p>
      ) : !data?.total.calls ? (
        <p className="text-muted-foreground p-6 text-center text-sm">No AI use in this period.</p>
      ) : (
        <div className="grid gap-6 p-4 md:grid-cols-2">
          <Breakdown
            title="By what the AI did"
            rows={data.byFeature.map(f => ({ label: FEATURE_LABEL[f.feature] ?? f.feature, ...f }))}
            total={data.total.costUsd}
          />
          <Breakdown
            title="By model"
            rows={data.byModel.map(m => ({ label: m.model, mono: true, ...m }))}
            total={data.total.costUsd}
          />
          {data.total.unpriced > 0 && (
            <p className="text-xs text-amber-700 md:col-span-2">
              {data.total.unpriced} call{data.total.unpriced === 1 ? '' : 's'} used a model with no price yet (Customer
              site → AI costs → Model prices).
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Breakdown({
  title,
  rows,
  total,
}: {
  title: string;
  rows: (CostTotals & { label: string; mono?: boolean })[];
  total: number;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{title}</p>
      <ul className="grid gap-2.5">
        {rows.map(r => (
          <li key={r.label} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={r.mono ? 'truncate font-mono text-xs' : 'truncate'}>{r.label}</span>
              <span className="shrink-0 font-medium tabular-nums">{usd(r.costUsd)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${total > 0 ? Math.max(1, (r.costUsd / total) * 100) : 0}%` }}
                />
              </div>
              <span className="text-muted-foreground w-28 shrink-0 text-right text-[11px] tabular-nums">
                {r.calls.toLocaleString()} calls · {compact(r.tokens)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
