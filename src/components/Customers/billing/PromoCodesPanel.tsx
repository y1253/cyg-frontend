import { useState } from 'react';
import { Copy, Pencil, Plus, Tag } from 'lucide-react';
import { money, priceWithPromo, type PromoCode } from '@/api/customerBilling';
import { ConfirmRemoveButton } from '@/components/CompanySettings/ConfirmRemoveButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCustomerPricing } from '@/hooks/useCustomerPricing';
import { useDeletePromoCode } from '@/hooks/useDeletePromoCode';
import { usePromoCodes } from '@/hooks/usePromoCodes';
import { useSavePromoCode } from '@/hooks/useSavePromoCode';
import { cn } from '@/lib/utils';
import { fmtDay } from '../customer-format';
import { promoValueText } from './billing-format';
import { PromoCodeDialog } from './PromoCodeDialog';

/** Why a code can't be used right now, or null — mirrors the customer API's `promoProblem`. */
function promoState(p: PromoCode): { label: string; className: string } {
  if (!p.active) return { label: 'Paused', className: 'border-slate-200 bg-slate-50 text-slate-600' };
  if (p.expiresAt && new Date(p.expiresAt).getTime() <= Date.now())
    return { label: 'Expired', className: 'border-amber-200 bg-amber-50 text-amber-700' };
  if (p.maxUses !== null && p.usedCount >= p.maxUses)
    return { label: 'Used up', className: 'border-amber-200 bg-amber-50 text-amber-700' };
  return { label: 'Live', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
}

/** ADMIN: promo codes customers enter before paying for a Generate. */
export function PromoCodesPanel() {
  const codes = usePromoCodes();
  const pricing = useCustomerPricing();
  const save = useSavePromoCode();
  const remove = useDeletePromoCode();
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const list = codes.data ?? [];
  const listPrice = pricing.data?.generatePriceCents ?? 0;
  const currency = pricing.data?.currency ?? 'cad';

  const open = (p: PromoCode | null) => {
    setEditing(p);
    setDialogOpen(true);
  };

  const copy = (p: PromoCode) => {
    void navigator.clipboard?.writeText(p.code);
    setCopied(p.id);
    setTimeout(() => setCopied(c => (c === p.id ? null : c)), 1500);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          The current price is <span className="text-foreground font-semibold">{listPrice ? money(listPrice, currency) : 'free'}</span>
          {' '}— each code shows what a customer pays with it.
        </p>
        <Button onClick={() => open(null)} className="gap-1.5">
          <Plus size={15} /> New promo code
        </Button>
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        {codes.isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-muted h-12 animate-pulse rounded-md" />
            ))}
          </div>
        ) : codes.isError ? (
          <p className="text-destructive p-8 text-center text-sm">Could not load promo codes.</p>
        ) : !list.length ? (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Tag size={20} />
            </span>
            <p className="font-medium">No promo codes yet</p>
            <p className="text-muted-foreground mt-1 text-sm">Create one to give a customer a discount — or a free Generate.</p>
            <Button variant="outline" className="mt-4 gap-1.5" onClick={() => open(null)}>
              <Plus size={15} /> Create the first code
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Customer pays</TableHead>
                <TableHead>Uses</TableHead>
                <TableHead className="hidden md:table-cell">Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map(p => {
                const state = promoState(p);
                const pays = priceWithPromo(listPrice, p);
                return (
                  <TableRow key={p.id} className={cn(!p.active && 'opacity-60')}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-sm font-semibold tracking-wider">{p.code}</span>
                        <button
                          type="button"
                          onClick={() => copy(p)}
                          aria-label={`Copy ${p.code}`}
                          className="text-muted-foreground hover:text-foreground rounded p-1"
                        >
                          <Copy size={13} />
                        </button>
                        {copied === p.id && <span className="text-xs text-emerald-700">Copied</span>}
                      </div>
                      {p.note && <p className="text-muted-foreground mt-1 max-w-[220px] truncate text-xs">{p.note}</p>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={p.kind === 'PERCENT_OFF' ? 'border-violet-200 text-violet-700' : 'border-sky-200 text-sky-700'}>
                        {promoValueText(p, currency)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {pays === 0 ? <span className="text-emerald-700">Free</span> : money(pays, currency)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {p.usedCount}
                      <span className="text-muted-foreground"> / {p.maxUses ?? '∞'}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-sm whitespace-nowrap md:table-cell">
                      {p.expiresAt ? fmtDay(p.expiresAt.slice(0, 10)) : 'Never'}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        title={p.active ? 'Click to pause' : 'Click to activate'}
                        disabled={save.isPending}
                        onClick={() => save.mutate({ id: p.id, active: !p.active })}
                      >
                        <Badge variant="outline" className={cn('cursor-pointer', state.className)}>
                          {state.label}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="pr-4">
                      <div className="flex items-center justify-end gap-1">
                        {confirmId !== p.id && (
                          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.code}`} onClick={() => open(p)}>
                            <Pencil size={14} />
                          </Button>
                        )}
                        <ConfirmRemoveButton
                          label={p.code}
                          confirming={confirmId === p.id}
                          onConfirmingChange={c => setConfirmId(c ? p.id : null)}
                          onRemove={() => remove.mutate(p.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
      {(save.error || remove.error) && <p className="text-destructive text-sm">{(save.error ?? remove.error)?.message}</p>}

      <PromoCodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        promo={editing}
        listPriceCents={listPrice}
        currency={currency}
      />
    </div>
  );
}
