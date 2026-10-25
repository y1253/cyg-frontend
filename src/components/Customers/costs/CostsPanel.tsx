import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { AlertTriangle, Bot, Coins, MessageCircle, MessageSquareText, PhoneCall, UserX } from 'lucide-react';
import { compact, usd } from '@/api/aiCosts';
import { COST_TYPE, COST_TYPES, type CostTotals, type CostType, type CustomerTotalCost } from '@/api/costs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCustomerCosts } from '@/hooks/useCustomerCosts';
import { cn } from '@/lib/utils';
import { CustomerAvatar } from '../CustomerAvatar';
import { CostStat } from './CostStat';
import { PERIOD_LABEL, rangeOf, type CostPeriod } from './cost-period';
import { ModelPricesCard } from './ModelPricesCard';
import { ProviderPricesCard } from './ProviderPricesCard';

const ICON: Record<CostType, ReactNode> = {
  ai: <Bot size={16} />,
  sms: <MessageSquareText size={16} />,
  whatsapp: <MessageCircle size={16} />,
  calls: <PhoneCall size={16} />,
};

/** The count line under a type's cost: "12 calls · 40K tokens", "5 out / 2 in · 9 segments", … */
function detail(t: CostTotals, type: CostType): string {
  const n = (v: number) => v.toLocaleString();
  switch (type) {
    case 'ai':
      return `${n(t.ai.count)} calls · ${compact(t.ai.tokens)} tokens`;
    case 'sms':
      return `${n(t.sms.out)} out / ${n(t.sms.in)} in · ${n(t.sms.segments)} segments`;
    case 'whatsapp':
      return `${n(t.whatsapp.out)} out / ${n(t.whatsapp.in)} in`;
    case 'calls':
      return `${n(t.calls.count)} calls · ${n(t.calls.minutes)} min`;
  }
}

const isCostType = (v: string | null): v is CostType => COST_TYPES.includes(v as CostType);

/**
 * Customer site → Costs: every customer's whole cost to the firm — AI (OpenAI), texts,
 * WhatsApps and AI phone calls — in one list. "All" shows each type side by side; a type
 * filter narrows the table to that spend. The prices below follow the filter.
 */
export function CostsPanel() {
  const [period, setPeriod] = useState<CostPeriod>('month');
  const [params, setParams] = useSearchParams();
  const rawType = params.get('type');
  const type: CostType | null = isCostType(rawType) ? rawType : null;
  const setType = (t: CostType | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (t) next.set('type', t);
        else next.delete('type');
        return next;
      },
      { replace: true },
    );

  const costs = useCustomerCosts(rangeOf(period));
  const total = costs.data?.total;
  const navigate = useNavigate();

  const costOf = (c: CostTotals) => (type ? c[type].costUsd : c.costUsd);
  const countOf = (c: CostTotals) => (type ? c[type].count : COST_TYPES.reduce((s, k) => s + c[k].count, 0));
  const customers = (costs.data?.customers ?? [])
    .filter((c) => countOf(c) > 0 || costOf(c) > 0)
    .sort((a, b) => costOf(b) - costOf(a) || countOf(b) - countOf(a));
  const top = Math.max(0, ...customers.map(costOf));
  const unpriced = total ? (type ? total[type].unpriced : total.unpriced) : 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {([null, ...COST_TYPES] as const).map((t) => (
            <Button key={t ?? 'all'} size="sm" variant={type === t ? 'default' : 'outline'} onClick={() => setType(t)}>
              {t ? COST_TYPE[t].label : 'All'}
            </Button>
          ))}
        </div>
        <Select value={period} onValueChange={(v) => v && setPeriod(v as CostPeriod)}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue>{(v: CostPeriod) => PERIOD_LABEL[v]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABEL) as CostPeriod[]).map((p) => (
              <SelectItem key={p} value={p}>
                {PERIOD_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <CostStat
          icon={<Coins size={16} />}
          label="Total cost"
          value={usd(total?.costUsd ?? 0)}
          tone="bg-teal-50 text-teal-700"
          active={type === null}
          onClick={() => setType(null)}
        />
        {COST_TYPES.map((t) => (
          <CostStat
            key={t}
            icon={ICON[t]}
            label={total ? `${COST_TYPE[t].label} · ${detail(total, t)}` : COST_TYPE[t].label}
            value={usd(total?.[t].costUsd ?? 0)}
            tone={COST_TYPE[t].tone}
            active={type === t}
            onClick={() => setType(type === t ? null : t)}
          />
        ))}
      </div>

      {unpriced > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle size={15} className="shrink-0" />
          {unpriced.toLocaleString()} {unpriced === 1 ? 'item has' : 'items have'} no price yet and{' '}
          {unpriced === 1 ? 'is' : 'are'} not in the totals. Set the price below.
        </p>
      )}

      <div className="bg-card overflow-hidden rounded-xl border">
        {costs.isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-muted h-12 animate-pulse rounded-md" />
            ))}
          </div>
        ) : costs.isError ? (
          <p className="text-destructive p-8 text-center text-sm">{costs.error.message}</p>
        ) : !customers.length ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-xl">
              <Coins size={18} />
            </span>
            <p className="text-sm font-medium">
              {type ? `No ${COST_TYPE[type].label.toLowerCase()} cost in this period` : 'No costs in this period'}
            </p>
            <p className="text-muted-foreground text-xs">Costs appear here as customers use the site.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                {type ? (
                  <TableHead className="hidden text-right sm:table-cell">{COST_TYPE[type].label}</TableHead>
                ) : (
                  COST_TYPES.map((t) => (
                    <TableHead key={t} className="hidden text-right md:table-cell">
                      {COST_TYPE[t].label}
                    </TableHead>
                  ))
                )}
                <TableHead className="w-[24%] text-right">{type ? 'Cost' : 'Total'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <CostRow
                  key={c.customerId ?? 'none'}
                  c={c}
                  type={type}
                  top={top}
                  onOpen={() => c.customerId !== null && navigate(`/admin/customers/${c.customerId}`)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {type !== 'sms' && type !== 'whatsapp' && type !== 'calls' && <ModelPricesCard />}
      {type !== 'ai' && <ProviderPricesCard />}
    </div>
  );
}

function CostRow({
  c,
  type,
  top,
  onOpen,
}: {
  c: CustomerTotalCost;
  type: CostType | null;
  top: number;
  onOpen: () => void;
}) {
  const cost = type ? c[type].costUsd : c.costUsd;
  const unpriced = type ? c[type].unpriced : c.unpriced;
  const width = top > 0 ? Math.max(2, (cost / top) * 100) : 0;
  return (
    <TableRow className={cn(c.customerId !== null && 'cursor-pointer')} onClick={onOpen}>
      <TableCell>
        <div className="flex items-center gap-3">
          {c.customerId !== null ? (
            <CustomerAvatar name={c.name} url={c.avatarUrl} />
          ) : (
            <span className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-full">
              <UserX size={14} />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {c.name}
              {c.deleted && <span className="text-muted-foreground ml-1.5 text-xs font-normal">(deleted)</span>}
            </p>
            {(c.email || c.phone) && <p className="text-muted-foreground truncate text-xs">{c.email ?? c.phone}</p>}
          </div>
        </div>
      </TableCell>
      {type ? (
        <TableCell className="text-muted-foreground hidden text-right text-xs tabular-nums sm:table-cell">
          {detail(c, type)}
        </TableCell>
      ) : (
        COST_TYPES.map((t) => (
          <TableCell key={t} className="hidden text-right tabular-nums md:table-cell">
            {c[t].count || c[t].costUsd ? (
              <span className={cn(!c[t].costUsd && 'text-muted-foreground')}>{usd(c[t].costUsd)}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </TableCell>
        ))
      )}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-3">
          <div className="bg-muted hidden h-1.5 w-24 overflow-hidden rounded-full md:flex">
            {type ? (
              <div className={cn('h-full rounded-full', COST_TYPE[type].bar)} style={{ width: `${width}%` }} />
            ) : (
              <div className="flex h-full" style={{ width: `${width}%` }}>
                {COST_TYPES.map((t) =>
                  c[t].costUsd > 0 ? (
                    <div
                      key={t}
                      className={cn('h-full', COST_TYPE[t].bar)}
                      style={{ width: `${(c[t].costUsd / c.costUsd) * 100}%` }}
                      title={`${COST_TYPE[t].label}: ${usd(c[t].costUsd)}`}
                    />
                  ) : null,
                )}
              </div>
            )}
          </div>
          <span className="font-semibold tabular-nums">{usd(cost)}</span>
        </div>
        {unpriced > 0 && <p className="text-[11px] text-amber-700">+{unpriced} unpriced</p>}
      </TableCell>
    </TableRow>
  );
}
