import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bot, Coins, Cpu, Hash, Pencil, Users2 } from 'lucide-react';
import { compact, usd, type AiModelPrice } from '@/api/aiCosts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAiCustomerCosts } from '@/hooks/useAiCustomerCosts';
import { useAiModelPrices } from '@/hooks/useAiModelPrices';
import { cn } from '@/lib/utils';
import { CustomerAvatar } from '../CustomerAvatar';
import { fmtAgo } from '../customer-format';
import { ModelPriceDialog } from './ModelPriceDialog';
import { PERIOD_LABEL, rangeOf, type CostPeriod } from './cost-period';

/**
 * step12 — Customer site → AI costs: what each customer costs the firm in OpenAI (every
 * call the customer API makes is recorded with its tokens and price), and the price of
 * each model, re-checked weekly against LiteLLM's public price list.
 */
export function AiCostsPanel() {
  const [period, setPeriod] = useState<CostPeriod>('month');
  const costs = useAiCustomerCosts(rangeOf(period));
  const total = costs.data?.total;
  const customers = costs.data?.customers ?? [];
  const navigate = useNavigate();
  const top = customers[0]?.costUsd ?? 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          OpenAI spend per customer — reading statements and receipts, the assistant, the phone and scheduled
          messages.
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
        <Stat icon={<Coins size={16} />} label="Total AI cost" value={usd(total?.costUsd ?? 0)} tone="bg-emerald-50 text-emerald-700" />
        <Stat icon={<Users2 size={16} />} label="Customers using AI" value={customers.filter(c => c.customerId !== null).length.toLocaleString()} tone="bg-teal-50 text-teal-700" />
        <Stat icon={<Bot size={16} />} label="AI calls" value={(total?.calls ?? 0).toLocaleString()} tone="bg-sky-50 text-sky-700" />
        <Stat icon={<Hash size={16} />} label="Tokens" value={compact(total?.tokens ?? 0)} tone="bg-violet-50 text-violet-700" />
      </div>

      {!!total?.unpriced && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle size={15} className="shrink-0" />
          {total.unpriced.toLocaleString()} call{total.unpriced === 1 ? '' : 's'} used a model with no price yet and{' '}
          {total.unpriced === 1 ? 'is' : 'are'} not in the totals. Set its price below.
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
              <Coins size={18} />
            </span>
            <p className="text-sm font-medium">No AI use in this period</p>
            <p className="text-muted-foreground text-xs">Costs appear here as customers use the site.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Tokens</TableHead>
                <TableHead className="w-[30%] text-right">Cost</TableHead>
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
                          <Cpu size={14} />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {c.name}
                          {c.deleted && <span className="text-muted-foreground ml-1.5 text-xs font-normal">(deleted)</span>}
                        </p>
                        {c.email && <p className="text-muted-foreground truncate text-xs">{c.email}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.calls.toLocaleString()}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{compact(c.tokens)}</TableCell>
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

      <ModelPrices />
    </div>
  );
}

const perM = (v: number | null) => (v === null ? '—' : `$${v.toLocaleString('en-US', { maximumFractionDigits: 4 })}`);

const SOURCE_BADGE: Record<AiModelPrice['priceSource'], { label: string; className: string }> = {
  LITELLM: { label: 'Automatic', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  MANUAL: { label: 'Set by hand', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  NONE: { label: 'No price', className: 'bg-amber-50 text-amber-800 border-amber-200' },
};

/** Every model the customer site has used, its price per 1M tokens, and when it was checked. */
function ModelPrices() {
  const models = useAiModelPrices();
  const [editing, setEditing] = useState<AiModelPrice | null>(null);
  const list = models.data ?? [];

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Cpu size={14} className="text-muted-foreground" />
          Model prices
          <span className="text-muted-foreground font-normal">· {list.length}</span>
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          USD per 1M tokens. Added the first time a model is used and checked every Monday against LiteLLM's public
          price list (OpenAI publishes no pricing API).
        </p>
      </CardHeader>
      {models.isLoading ? (
        <div className="p-4">
          <div className="bg-muted h-12 animate-pulse rounded-md" />
        </div>
      ) : models.isError ? (
        <p className="text-destructive p-6 text-center text-sm">{models.error.message}</p>
      ) : !list.length ? (
        <p className="text-muted-foreground p-6 text-center text-sm">No model has been used yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Input</TableHead>
              <TableHead className="hidden text-right md:table-cell">Cached</TableHead>
              <TableHead className="text-right">Output</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Audio in / out</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Spent</TableHead>
              <TableHead className="hidden md:table-cell">Checked</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map(m => {
              const badge = SOURCE_BADGE[m.priceSource];
              return (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-medium">{m.name}</span>
                      <Badge variant="outline" className={cn('text-[10px]', badge.className)}>
                        {badge.label}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{perM(m.inputPerMTok)}</TableCell>
                  <TableCell className="hidden text-right text-xs tabular-nums md:table-cell">{perM(m.cachedInputPerMTok)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {m.perMinute !== null && m.outputPerMTok === null ? `$${m.perMinute}/min` : perM(m.outputPerMTok)}
                  </TableCell>
                  <TableCell className="hidden text-right text-xs tabular-nums lg:table-cell">
                    {m.audioInputPerMTok === null && m.audioOutputPerMTok === null
                      ? '—'
                      : `${perM(m.audioInputPerMTok)} / ${perM(m.audioOutputPerMTok)}`}
                  </TableCell>
                  <TableCell className="hidden text-right text-xs tabular-nums sm:table-cell">
                    {usd(m.costUsd)}
                    <p className="text-muted-foreground text-[11px]">{m.calls.toLocaleString()} calls</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                    {m.priceCheckedAt ? fmtAgo(m.priceCheckedAt) : '—'}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="size-8" aria-label={`Edit price of ${m.name}`} onClick={() => setEditing(m)}>
                      <Pencil size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <ModelPriceDialog model={editing} onClose={() => setEditing(null)} />
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
