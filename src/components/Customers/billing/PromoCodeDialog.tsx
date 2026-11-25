import { useEffect, useState } from 'react';
import { CalendarRange, Infinity as InfinityIcon, Loader2, Shuffle } from 'lucide-react';
import type { PromoCode } from '@/api/customerBilling';
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
import { promoValueText } from './billing-format';

type Length = 'months' | 'forever';

const LENGTHS: { key: Length; label: string; hint: string; icon: React.ReactNode }[] = [
  { key: 'months', label: 'Free for N months', hint: 'Then they subscribe like everyone else', icon: <CalendarRange size={15} /> },
  { key: 'forever', label: 'Free forever', hint: 'Never asked for a card', icon: <InfinityIcon size={15} /> },
];

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/** Create (`promo` null) or edit a free-subscription promo code. */
export function PromoCodeDialog({
  open,
  onOpenChange,
  promo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promo: PromoCode | null;
}) {
  const save = useSavePromoCode();
  const [code, setCode] = useState('');
  const [length, setLength] = useState<Length>('months');
  const [months, setMonths] = useState('');
  const [expires, setExpires] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [active, setActive] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // A fresh form every time it opens.
  useEffect(() => {
    if (!open) return;
    setCode(promo?.code ?? '');
    setLength(promo && promo.freeMonths === null ? 'forever' : 'months');
    setMonths(promo?.freeMonths ? String(promo.freeMonths) : '');
    setExpires(promo?.expiresAt ? promo.expiresAt.slice(0, 10) : '');
    setMaxUses(promo?.maxUses ? String(promo.maxUses) : '');
    setActive(promo?.active ?? true);
    setNote(promo?.note ?? '');
    setError(null);
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, promo]);

  /** Months (1–120), null = forever, or an error message. */
  const parsed = (): number | null | string => {
    if (length === 'forever') return null;
    const n = Number(months);
    if (!/^\d+$/.test(months.trim()) || n < 1 || n > 120) return 'Months free is a whole number from 1 to 120.';
    return n;
  };
  const p = parsed();

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
        freeMonths: p,
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
            <DialogDescription>Customers type the code on cygfinance.com to get the subscription free — no card asked.</DialogDescription>
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
                  placeholder="FRIENDS3"
                  className="font-mono tracking-wider uppercase"
                />
                <Button type="button" variant="outline" className="gap-1.5" onClick={() => setCode(randomCode())}>
                  <Shuffle size={14} /> Random
                </Button>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>How long is it free?</Label>
              <div className="grid grid-cols-2 gap-2">
                {LENGTHS.map(k => (
                  <button
                    key={k.key}
                    type="button"
                    onClick={() => setLength(k.key)}
                    className={cn(
                      'flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors',
                      length === k.key ? 'border-teal-600 bg-teal-50/60 ring-2 ring-teal-600/15' : 'hover:bg-muted/50',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md',
                        length === k.key ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground',
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

            {length === 'months' && (
              <div className="grid gap-1.5">
                <Label htmlFor="promo-months">Months free</Label>
                <div className="relative sm:max-w-[200px]">
                  <Input
                    id="promo-months"
                    inputMode="numeric"
                    value={months}
                    onChange={e => setMonths(e.target.value.replace(/\D/g, ''))}
                    placeholder="3"
                    className="pr-16 tabular-nums"
                  />
                  <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">
                    months
                  </span>
                </div>
              </div>
            )}
            {typeof p !== 'string' && (
              <p className="text-muted-foreground -mt-2 text-xs">
                Customers get: <span className="font-semibold text-emerald-700">{promoValueText({ freeMonths: p })}</span>
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="promo-expires">Code expires (optional)</Label>
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
