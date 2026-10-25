import { useState } from 'react';
import { Cpu, Pencil } from 'lucide-react';
import { usd, type AiModelPrice } from '@/api/aiCosts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAiModelPrices } from '@/hooks/useAiModelPrices';
import { cn } from '@/lib/utils';
import { fmtAgo } from '../customer-format';
import { ModelPriceDialog } from './ModelPriceDialog';

const perM = (v: number | null) => (v === null ? '—' : `$${v.toLocaleString('en-US', { maximumFractionDigits: 4 })}`);

const SOURCE_BADGE: Record<AiModelPrice['priceSource'], { label: string; className: string }> = {
  LITELLM: { label: 'Automatic', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  MANUAL: { label: 'Set by hand', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  NONE: { label: 'No price', className: 'bg-amber-50 text-amber-800 border-amber-200' },
};

/** Every model the customer site has used, its price per 1M tokens, and when it was checked. */
export function ModelPricesCard() {
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
