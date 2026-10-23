import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, Coins, ExternalLink, MessageSquareText, Pencil, PhoneCall, RadioTower, UserX, Users2 } from 'lucide-react';
import { usd } from '@/api/aiCosts';
import {
  PRICE_FIELD_LABEL,
  PROVIDER_PRICE_FIELDS,
  unitPrice,
  type CommProvider,
  type ProviderPriceField,
} from '@/api/commCosts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCommCosts } from '@/hooks/useCommCosts';
import { useCommProviders } from '@/hooks/useCommProviders';
import { cn } from '@/lib/utils';
import { CustomerAvatar } from '../CustomerAvatar';
import { fmtAgo } from '../customer-format';
import { PERIOD_LABEL, rangeOf, type CostPeriod } from './cost-period';
import { ProviderPriceDialog } from './ProviderPriceDialog';

/**
 * step12d — Customer site → Phone & text costs: what each customer's texts, WhatsApps and
 * phone calls cost the firm (every one is recorded with its provider and price), and each
 * provider's prices, re-read weekly from its pricing page.
 */
export function CommCostsPanel() {
  const [period, setPeriod] = useState<CostPeriod>('month');
  const costs = useCommCosts(rangeOf(period));
  const total = costs.data?.total;
  const customers = costs.data?.customers ?? [];
  const navigate = useNavigate();
  const top = Math.max(0, ...customers.map(c => c.costUsd));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          SignalWire and WhatsApp spend per customer — texts in and out, WhatsApps and AI phone calls.
        </p>
        <Select value={period} onValueChange={v => v && setPeriod(v as CostPeriod)}>
          <SelectTrigger className="h-9 w-44">
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
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Coins size={16} />} label="Total phone & text cost" value={usd(total?.costUsd ?? 0)} tone="bg-emerald-50 text-emerald-700" />
        <Stat
          icon={<MessageSquareText size={16} />}
          label={`Texts (${(total?.segments ?? 0).toLocaleString()} segments) · ${((total?.whatsappOut ?? 0) + (total?.whatsappIn ?? 0)).toLocaleString()} WhatsApp`}
          value={((total?.smsOut ?? 0) + (total?.smsIn ?? 0)).toLocaleString()}
          tone="bg-sky-50 text-sky-700"
        />
        <Stat
          icon={<PhoneCall size={16} />}
          label={`Call minutes · ${(total?.calls ?? 0).toLocaleString()} calls`}
          value={(total?.minutes ?? 0).toLocaleString()}
          tone="bg-violet-50 text-violet-700"
        />
        <Stat
          icon={<Users2 size={16} />}
          label="Customers"
          value={customers.filter(c => c.customerId !== null).length.toLocaleString()}
          tone="bg-teal-50 text-teal-700"
        />
      </div>

      {!!total?.unpriced && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle size={15} className="shrink-0" />
          {total.unpriced.toLocaleString()} text{total.unpriced === 1 ? '' : 's'} / call{total.unpriced === 1 ? '' : 's'} had no
          provider price yet and {total.unpriced === 1 ? 'is' : 'are'} not in the totals. Set the price below.
        </p>
      )}

      <div className="bg-card overflow-hidden rounded-xl border">
        {costs.isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="bg-muted h-12 animate-pulse rounded-md" />
            ))}
          </div>
        ) : costs.isError ? (
          <p className="text-destructive p-8 text-center text-sm">{costs.error.message}</p>
        ) : !customers.length ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-xl">
              <MessageSquareText size={18} />
            </span>
            <p className="text-sm font-medium">No texts or calls in this period</p>
            <p className="text-muted-foreground text-xs">Costs appear here as customers text, WhatsApp and call.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Texts out / in</TableHead>
                <TableHead className="hidden text-right md:table-cell">WhatsApp out / in</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Calls · min</TableHead>
                <TableHead className="w-[26%] text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map(c => (
                <TableRow
                  key={c.customerId ?? 'none'}
                  className={cn(c.customerId !== null && 'cursor-pointer')}
                  onClick={() => c.customerId !== null && navigate(`/admin/customers/${c.customerId}`)}
                >
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
                        {(c.email || c.phone) && (
                          <p className="text-muted-foreground truncate text-xs">{c.email ?? c.phone}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.smsOut.toLocaleString()} / {c.smsIn.toLocaleString()}
                    {c.segments > c.smsOut + c.smsIn && (
                      <p className="text-muted-foreground text-[11px]">{c.segments.toLocaleString()} segments</p>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {c.whatsappOut.toLocaleString()} / {c.whatsappIn.toLocaleString()}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {c.calls.toLocaleString()} · {c.minutes.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-3">
                      <div className="bg-muted hidden h-1.5 w-24 overflow-hidden rounded-full md:block">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${top > 0 ? Math.max(2, (c.costUsd / top) * 100) : 0}%` }}
                        />
                      </div>
                      <span className="font-semibold tabular-nums">{usd(c.costUsd)}</span>
                    </div>
                    {c.unpriced > 0 && <p className="text-[11px] text-amber-700">+{c.unpriced} unpriced</p>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <ProviderPrices />
    </div>
  );
}

const SOURCE_BADGE: Record<CommProvider['priceSource'], { label: string; className: string }> = {
  AUTO: { label: 'Automatic', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  MANUAL: { label: 'Set by hand', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  NONE: { label: 'No price', className: 'bg-amber-50 text-amber-800 border-amber-200' },
};

/** Each provider: its prices, its pricing page(s), when they were last read, and its spend. */
function ProviderPrices() {
  const providers = useCommProviders();
  const [editing, setEditing] = useState<CommProvider | null>(null);
  const list = providers.data ?? [];

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <RadioTower size={14} className="text-muted-foreground" />
          Providers
          <span className="text-muted-foreground font-normal">· {list.length}</span>
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          List prices in USD, read from each provider's pricing page every Monday. SignalWire's own billed price
          replaces the list price on each text and call once SignalWire has rated it.
        </p>
      </CardHeader>
      {providers.isLoading ? (
        <div className="p-4">
          <div className="bg-muted h-12 animate-pulse rounded-md" />
        </div>
      ) : providers.isError ? (
        <p className="text-destructive p-6 text-center text-sm">{providers.error.message}</p>
      ) : !list.length ? (
        <p className="text-muted-foreground p-6 text-center text-sm">No provider is set up yet.</p>
      ) : (
        <div className="divide-y">
          {list.map(p => {
            const badge = SOURCE_BADGE[p.priceSource];
            const priced = PROVIDER_PRICE_FIELDS.filter(k => p[k] !== null);
            return (
              <div key={p.id} className="grid gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{p.label}</span>
                      <Badge variant="outline" className={cn('text-[10px]', badge.className)}>
                        {badge.label}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {[p.pricingUrl, p.voicePricingUrl]
                        .filter((u): u is string => !!u)
                        .map(u => (
                          <a
                            key={u}
                            href={u}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand inline-flex items-center gap-1 hover:underline"
                          >
                            {u.replace(/^https:\/\//, '')}
                            <ExternalLink size={11} />
                          </a>
                        ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{usd(p.costUsd)}</p>
                      <p className="text-muted-foreground text-[11px]">
                        {p.messages.toLocaleString()} messages · {p.calls.toLocaleString()} calls
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="size-8" aria-label={`Edit prices of ${p.label}`} onClick={() => setEditing(p)}>
                      <Pencil size={14} />
                    </Button>
                  </div>
                </div>
                {priced.length ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {priced.map((k: ProviderPriceField) => (
                      <div key={k} className="bg-muted/50 rounded-lg px-3 py-2">
                        <p className="text-sm font-medium tabular-nums">{unitPrice(p[k])}</p>
                        <p className="text-muted-foreground text-[11px]">
                          {PRICE_FIELD_LABEL[k].label} · {PRICE_FIELD_LABEL[k].unit}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-amber-800">No price yet — texts and calls are counted but not priced.</p>
                )}
                <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={11} /> Checked {p.priceCheckedAt ? fmtAgo(p.priceCheckedAt) : 'never'}
                  </span>
                  {p.priceChangedAt && <span>· changed {fmtAgo(p.priceChangedAt)}</span>}
                  {p.priceNote && <span className="min-w-0 break-words">· {p.priceNote}</span>}
                </p>
              </div>
            );
          })}
        </div>
      )}
      <ProviderPriceDialog provider={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <Card className="py-0">
      <CardContent className="flex items-center gap-3 p-4">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tone)}>{icon}</span>
        <div className="min-w-0">
          <p className="truncate text-xl leading-tight font-semibold tabular-nums">{value}</p>
          <p className="text-muted-foreground truncate text-xs">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
