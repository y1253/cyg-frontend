import { useState } from 'react';
import { Clock, ExternalLink, Pencil, RadioTower } from 'lucide-react';
import { usd } from '@/api/aiCosts';
import { PRICE_FIELD_LABEL, PROVIDER_PRICE_FIELDS, unitPrice, type CommProvider, type ProviderPriceField } from '@/api/commCosts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { useCommProviders } from '@/hooks/useCommProviders';
import { cn } from '@/lib/utils';
import { fmtAgo } from '../customer-format';
import { ProviderPriceDialog } from './ProviderPriceDialog';

const SOURCE_BADGE: Record<CommProvider['priceSource'], { label: string; className: string }> = {
  AUTO: { label: 'Automatic', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  MANUAL: { label: 'Set by hand', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  NONE: { label: 'No price', className: 'bg-amber-50 text-amber-800 border-amber-200' },
};

/** Each provider: its prices, its pricing page(s), when they were last read, and its spend. */
export function ProviderPricesCard() {
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
