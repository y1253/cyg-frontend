import { useState } from 'react';
import {
  PRICE_FIELD_LABEL,
  PROVIDER_PRICE_FIELDS,
  type CommProvider,
  type ProviderPriceField,
} from '@/api/commCosts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateCommProvider } from '@/hooks/useUpdateCommProvider';

const text = (v: number | null) => (v === null ? '' : String(v));

/** Set a provider's prices (and pricing pages) by hand — the weekly check then leaves them alone. */
export function ProviderPriceDialog({ provider, onClose }: { provider: CommProvider | null; onClose: () => void }) {
  return (
    <Dialog open={!!provider} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        {provider && <PriceForm key={provider.id} provider={provider} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function PriceForm({ provider, onClose }: { provider: CommProvider; onClose: () => void }) {
  const save = useUpdateCommProvider();
  const [values, setValues] = useState<Record<ProviderPriceField, string>>(
    () => Object.fromEntries(PROVIDER_PRICE_FIELDS.map(k => [k, text(provider[k])])) as Record<ProviderPriceField, string>,
  );
  const [pricingUrl, setPricingUrl] = useState(provider.pricingUrl ?? '');
  const [voicePricingUrl, setVoicePricingUrl] = useState(provider.voicePricingUrl ?? '');
  const parsed = Object.fromEntries(
    PROVIDER_PRICE_FIELDS.map(k => {
      const raw = values[k].trim();
      return [k, raw === '' ? null : Number(raw)];
    }),
  ) as Record<ProviderPriceField, number | null>;
  const invalid = PROVIDER_PRICE_FIELDS.some(k => {
    const v = parsed[k];
    return v !== null && (!Number.isFinite(v) || v < 0 || v > 10);
  });
  const badUrl = [pricingUrl, voicePricingUrl].some(u => u.trim() !== '' && !/^https:\/\/\S+$/.test(u.trim()));

  return (
    <>
      <DialogHeader>
        <DialogTitle>Prices of {provider.label}</DialogTitle>
        <DialogDescription>
          US dollars, for US / Canadian numbers. Prices set here are kept — the weekly check stops updating them until
          you switch back to automatic. Texts and calls recorded while a price was missing are priced now.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-3">
        {PROVIDER_PRICE_FIELDS.map(k => (
          <div key={k} className="grid gap-1.5">
            <Label htmlFor={`comm-price-${k}`}>{PRICE_FIELD_LABEL[k].label}</Label>
            <Input
              id={`comm-price-${k}`}
              inputMode="decimal"
              value={values[k]}
              onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))}
              placeholder="—"
            />
            <p className="text-muted-foreground text-[11px]">$ {PRICE_FIELD_LABEL[k].unit}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="comm-pricing-url">Pricing page</Label>
          <Input id="comm-pricing-url" value={pricingUrl} onChange={e => setPricingUrl(e.target.value)} placeholder="https://…" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="comm-voice-pricing-url">Voice pricing page</Label>
          <Input
            id="comm-voice-pricing-url"
            value={voicePricingUrl}
            onChange={e => setVoicePricingUrl(e.target.value)}
            placeholder="https://… (optional)"
          />
          <p className="text-muted-foreground text-[11px]">The weekly check reads these pages for the prices.</p>
        </div>
      </div>
      {save.error && <p className="text-destructive text-sm">{save.error.message}</p>}
      <DialogFooter className="gap-2 sm:justify-between">
        {provider.priceSource === 'MANUAL' ? (
          <Button
            variant="ghost"
            disabled={save.isPending}
            onClick={() => save.mutate({ id: provider.id, input: { automatic: true } }, { onSuccess: onClose })}
          >
            Back to automatic
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={save.isPending || invalid || badUrl}
            onClick={() =>
              save.mutate(
                {
                  id: provider.id,
                  input: { ...parsed, pricingUrl: pricingUrl.trim() || null, voicePricingUrl: voicePricingUrl.trim() || null },
                },
                { onSuccess: onClose },
              )
            }
          >
            {save.isPending ? 'Saving…' : 'Save prices'}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
