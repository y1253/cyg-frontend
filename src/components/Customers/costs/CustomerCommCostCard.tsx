import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, MessageCircle, MessageSquareText, Phone, PhoneCall } from 'lucide-react';
import { usd } from '@/api/aiCosts';
import { PURPOSE_LABEL, type CommKind } from '@/api/commCosts';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCustomerCommCost } from '@/hooks/useCustomerCommCost';
import { fmtDateTime } from '../customer-format';
import { PERIOD_LABEL, rangeOf, type CostPeriod } from './cost-period';

const KIND_ICON: Record<CommKind, React.ReactNode> = {
  SMS: <MessageSquareText size={13} />,
  WHATSAPP: <MessageCircle size={13} />,
  CALL: <Phone size={13} />,
};
const KIND_LABEL: Record<CommKind, string> = { SMS: 'Text', WHATSAPP: 'WhatsApp', CALL: 'Call' };

const duration = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`);

/** Customer detail page (step12d): what this customer's texts, WhatsApps and calls cost. */
export function CustomerCommCostCard({ customerId }: { customerId: number }) {
  const [period, setPeriod] = useState<CostPeriod>('month');
  const { data, isLoading, isError, error } = useCustomerCommCost(customerId, rangeOf(period));
  const t = data?.total;
  const any = !!t && t.smsOut + t.smsIn + t.whatsappOut + t.whatsappIn + t.calls > 0;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b py-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <PhoneCall size={14} className="text-muted-foreground" />
            Phone & text cost
          </CardTitle>
          <p className="text-muted-foreground text-xs">What this customer's texts, WhatsApps and calls cost us.</p>
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
          {t && (
            <div className="text-right">
              <p className="text-lg leading-tight font-semibold tabular-nums">{usd(t.costUsd)}</p>
              <p className="text-muted-foreground text-xs">
                {(t.smsOut + t.smsIn).toLocaleString()} texts · {t.minutes.toLocaleString()} min
              </p>
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
      ) : !any || !data ? (
        <p className="text-muted-foreground p-6 text-center text-sm">No texts or calls in this period.</p>
      ) : (
        <div className="grid gap-6 p-4 lg:grid-cols-2">
          <div className="grid content-start gap-2">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">By purpose</p>
            <ul className="grid gap-2.5">
              {data.byPurpose.map(r => (
                <li key={`${r.kind}-${r.purpose}`} className="grid gap-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="text-muted-foreground shrink-0">{KIND_ICON[r.kind]}</span>
                      <span className="truncate">{PURPOSE_LABEL[r.purpose] ?? r.purpose}</span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{usd(r.costUsd)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${t!.costUsd > 0 ? Math.max(1, (r.costUsd / t!.costUsd) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground w-28 shrink-0 text-right text-[11px] tabular-nums">
                      {r.count.toLocaleString()} {r.kind === 'CALL' ? `calls · ${r.minutes} min` : 'messages'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid content-start gap-2">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Latest</p>
            <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
              {data.recent.map(r => (
                <li key={`${r.kind}-${r.id}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="text-muted-foreground flex shrink-0 items-center gap-0.5">
                    {KIND_ICON[r.kind]}
                    {r.direction === 'OUT' ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {KIND_LABEL[r.kind]} · {PURPOSE_LABEL[r.purpose] ?? r.purpose}
                    </p>
                    <p className="text-muted-foreground truncate text-[11px]">
                      {fmtDateTime(r.at)}
                      {r.kind === 'CALL'
                        ? ` · ${duration(r.durationSec ?? 0)}`
                        : r.kind === 'SMS' && (r.segments ?? 1) > 1
                          ? ` · ${r.segments} segments`
                          : ''}
                      {r.media ? ` · ${r.media} file${r.media === 1 ? '' : 's'}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium tabular-nums">{r.costUsd === null ? '—' : usd(r.costUsd)}</p>
                    <p className="text-muted-foreground text-[10px]">{r.priceSource === 'BILLED' ? 'billed' : 'list price'}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}
