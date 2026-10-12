import { useEffect, useState } from 'react';
import { Loader2, Percent, Shuffle, Tag } from 'lucide-react';
import { money, priceWithPromo, type PromoCode, type PromoKind } from '@/api/customerBilling';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSavePromoCode } from '@/hooks/useSavePromoCode';
import { cn } from '@/lib/utils';
import { dollarsToCents } from './billing-format';

const KINDS: { kind: PromoKind; label: string; hint: string; icon: React.ReactNode }[] = [
  { kind: 'PERCENT_OFF', label: '% off', hint: 'A percentage off the price', icon: <Percent size={15} /> },
  { kind: 'FIXED_PRICE', label: 'Fixed price', hint: 'The customer pays exactly this', icon: <Tag size={15} /> },
];

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/** Create (`promo` null) or edit a promo code. */
export function PromoCodeDialog({
  open,
  onOpenChange,
  promo,
  listPriceCents,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promo: PromoCode | null;
  listPriceCents: number;
  currency: string;
}) {
  const save = useSavePromoCode();
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<PromoKind>('PERCENT_OFF');
  const [value, setValue] = useState('');
  const [expires, setExpires] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [active, setActive] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // A fresh form every time it opens.
  useEffect(() => {
    if (!open) return;
    setCode(promo?.code ?? '');
    setKind(promo?.kind ?? 'PERCENT_OFF');
    setValue(
      promo ? (promo.kind === 'PERCENT_OFF' ? String(promo.value) : (promo.value / 100).toFixed(2)) : '',
    );
    setExpires(promo?.expiresAt ? promo.expiresAt.slice(0, 10) : '');
    setMaxUses(promo?.maxUses ? String(promo.maxUses) : '');
    setActive(promo?.active ?? true);
    setNote(promo?.note ?? '');
    setError(null);
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, promo]);

  /** The value in the API's units (percent, or cents), or an error message. */
  const parsed = (): number | string => {
    if (kind === 'PERCENT_OFF') {
      const n = Number(value);
      if (!/^\d+$/.test(value.trim()) || n < 1 || n > 100) return 'A percentage is a whole number from 1 to 100.';
      return n;
    }
    const cents = dollarsToCents(value);
    if (cents === null) return 'Enter a price like 4.99 (0 = free).';
    if (cents > 0 && cents < 50) return 'A fixed price must be $0 (free) or at least $0.50.';
    return cents;
  };

  const p = parsed();
  const pays = typeof p === 'number' ? priceWithPromo(listPriceCents, { kind, value: p }) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(c)) return setError('A code is 3–32 letters, digits, - or _.');
    if (typeof p === 'string') return setError(p);
    const uses = maxUses.trim() ? Number(maxUses) : null;
    if (uses !== null && (!Number.isInteger(uses) || uses < 1)) return setError('Max uses is a whole number, 1 or more.');
    setError(null);
    save.mutate(
      {
        id: promo?.id,
        code: c,
        kind,
        value: p,
        active,
        // End of the chosen day, local time.
        expiresAt: expires ? new Date(expires + 'T23:59:59').toISOString() : null,
        maxUses: uses,
        note: note.trim() || null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const message = error ?? save.error?.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{promo ? 'Edit promo code' : 'New promo code'}</DialogTitle>
            <DialogDescription>Customers type the code before paying for a Generate.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="promo-code">Code</Label>
              <div className="flex gap-2">
                <Input
                  id="promo-code"
                  autoFocus
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
                  placeholder="SUMMER25"
                  className="font-mono tracking-wider uppercase"
                />
                <Button type="button" variant="outline" className="gap-1.5" onClick={() => setCode(randomCode())}>
                  <Shuffle size={14} /> Random
                </Button>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Discount type</Label>
              <div className="grid grid-cols-2 gap-2">
                {KINDS.map(k => (
                  <button
                    key={k.kind}
                    type="button"
                    onClick={() => {
                      setKind(k.kind);
                      setValue('');
                    }}
                    className={cn(
                      'flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors',
                      kind === k.kind ? 'border-teal-600 bg-teal-50/60 ring-2 ring-teal-600/15' : 'hover:bg-muted/50',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md',
                        kind === k.kind ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {k.icon}
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{k.label}</span>
                      <span className="text-muted-foreground block text-xs">{k.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="promo-value">{kind === 'PERCENT_OFF' ? 'Percent off' : `Price (${currency.toUpperCase()})`}</Label>
              <div className="relative sm:max-w-[200px]">
                {kind === 'FIXED_PRICE' && (
                  <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">$</span>
                )}
                <Input
                  id="promo-value"
                  inputMode="decimal"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder={kind === 'PERCENT_OFF' ? '25' : '4.99'}
                  className={cn('tabular-nums', kind === 'FIXED_PRICE' ? 'pl-7' : 'pr-8')}
                />
                {kind === 'PERCENT_OFF' && (
                  <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">%</span>
                )}
              </div>
              {pays !== null && (
                <p className="text-muted-foreground text-xs">
                  Customers pay{' '}
                  <span className="font-semibold text-emerald-700">{pays === 0 ? 'nothing (free, no card asked)' : money(pays, currency)}</span>{' '}
                  instead of {money(listPriceCents, currency)}.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="promo-expires">Expires (optional)</Label>
                <Input id="promo-expires" type="date" value={expires} onChange={e => setExpires(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="promo-uses">Max uses (optional)</Label>
                <Input
                  id="promo-uses"
                  inputMode="numeric"
                  value={maxUses}
                  onChange={e => setMaxUses(e.target.value.replace(/\D/g, ''))}
                  placeholder="Unlimited"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="promo-note">Note (only admins see it)</Label>
              <Textarea id="promo-note" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Sent to the October newsletter" />
            </div>

            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox checked={active} onCheckedChange={v => setActive(!!v)} />
              Active — customers can use it now
            </label>

            {message && (
              <p className="text-destructive bg-destructive/10 border-destructive/20 rounded-md border px-3 py-2 text-sm">{message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} className="gap-2">
              {save.isPending && <Loader2 size={14} className="animate-spin" />}
              {promo ? 'Save changes' : 'Create code'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
