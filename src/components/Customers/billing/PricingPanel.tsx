import { useState } from 'react';
import { Check, CreditCard, Loader2, Sparkles, Tag } from 'lucide-react';
import { money } from '@/api/customerBilling';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCustomerPricing } from '@/hooks/useCustomerPricing';
import { useUpdateCustomerPricing } from '@/hooks/useUpdateCustomerPricing';
import { cn } from '@/lib/utils';
import { fmtDateTime } from '../customer-format';
import { dollarsToCents } from './billing-format';

/**
 * ADMIN: what a customer pays for one Generate on cygfinance.com. The customer API reads
 * this row on every checkout, so a save is live immediately. $0 = Generate stays free and
 * no card is ever asked for.
 */
export function PricingPanel() {
  const pricing = useCustomerPricing();
  const save = useUpdateCustomerPricing();
  const current = pricing.data?.generatePriceCents ?? 0;
  const currency = pricing.data?.currency ?? 'cad';
  // null = the admin has not typed; show the saved price.
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const text = draft ?? (current / 100).toFixed(2);
  const cents = dollarsToCents(text);
  const invalid =
    cents === null ? 'Enter an amount like 9.99' : cents > 0 && cents < 50 ? 'A paid price must be at least $0.50 (Stripe minimum)' : null;
  const dirty = cents !== null && cents !== current;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid || cents === null) return;
    setSaved(false);
    save.mutate(cents, {
      onSuccess: () => {
        setDraft(null);
        setSaved(true);
      },
    });
  };

  const preview = cents ?? current;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card className="py-0">
        <CardContent className="p-5 sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <CreditCard size={18} />
            </span>
            <div>
              <h3 className="font-semibold">Price per Generate</h3>
              <p className="text-muted-foreground text-sm">
                Charged every time a customer clicks Generate to read new statements. Re-running tax and retrying a
                failed statement stay free.
              </p>
            </div>
          </div>

          {pricing.isLoading ? (
            <div className="bg-muted h-24 animate-pulse rounded-lg" />
          ) : (
            <form onSubmit={submit} className="grid gap-4">
              <div className="grid gap-1.5 sm:max-w-xs">
                <Label htmlFor="generate-price">Price ({currency.toUpperCase()})</Label>
                <div className="relative">
                  <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                    $
                  </span>
                  <Input
                    id="generate-price"
                    inputMode="decimal"
                    className="h-11 pl-7 text-lg font-semibold tabular-nums"
                    value={text}
                    onChange={e => {
                      setDraft(e.target.value);
                      setSaved(false);
                    }}
                  />
                </div>
                {invalid && draft !== null && <p className="text-destructive text-xs">{invalid}</p>}
              </div>

              <div className="flex flex-wrap gap-2">
                {[0, 500, 1000, 2500].map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraft((c / 100).toFixed(2))}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      cents === c ? 'border-teal-600 bg-teal-50 text-teal-700' : 'hover:bg-muted',
                    )}
                  >
                    {c === 0 ? 'Free' : money(c, currency)}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={!dirty || !!invalid || save.isPending} className="gap-2">
                  {save.isPending && <Loader2 size={14} className="animate-spin" />}
                  Save price
                </Button>
                {saved && !dirty && (
                  <span className="flex items-center gap-1 text-sm text-emerald-700">
                    <Check size={14} /> Saved — live on cygfinance.com
                  </span>
                )}
                {save.error && <span className="text-destructive text-sm">{save.error.message}</span>}
              </div>

              {pricing.data && (
                <p className="text-muted-foreground text-xs">Last changed {fmtDateTime(pricing.data.updatedAt)}</p>
              )}
            </form>
          )}
        </CardContent>
      </Card>

      {/* What the customer will see on their Generate button. */}
      <Card className="py-0">
        <CardContent className="grid gap-3 p-5">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Customer preview</p>
          <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-black/5">
            <p className="text-sm font-semibold text-[#0B1C2C]">3 statements ready to read</p>
            <p className="text-muted-foreground mb-3 text-xs">Upload everything first, then click Generate.</p>
            <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#169f96] px-4 text-sm font-medium text-white">
              <Sparkles size={14} />
              Generate · 3 new{preview > 0 ? ` · ${money(preview, currency)}` : ''}
            </span>
          </div>
          <ul className="text-muted-foreground grid gap-1.5 text-xs">
            {preview > 0 ? (
              <>
                <li className="flex gap-2">
                  <CreditCard size={13} className="mt-0.5 shrink-0" /> Card is saved by Stripe for next time
                </li>
                <li className="flex gap-2">
                  <Tag size={13} className="mt-0.5 shrink-0" /> Promo codes are entered before paying
                </li>
              </>
            ) : (
              <li className="flex gap-2">
                <Check size={13} className="mt-0.5 shrink-0" /> Free — Generate runs straight away, no card asked
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
