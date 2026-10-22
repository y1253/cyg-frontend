import { useState } from 'react';
import type { AiModelPrice, AiModelPriceInput } from '@/api/aiCosts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateAiModelPrice } from '@/hooks/useUpdateAiModelPrice';

type Field = keyof Omit<AiModelPriceInput, 'automatic'>;

const FIELDS: { key: Field; label: string; hint: string }[] = [
  { key: 'inputPerMTok', label: 'Input', hint: '$ per 1M tokens' },
  { key: 'cachedInputPerMTok', label: 'Cached input', hint: '$ per 1M tokens (blank = input price)' },
  { key: 'outputPerMTok', label: 'Output', hint: '$ per 1M tokens' },
  { key: 'audioInputPerMTok', label: 'Audio input', hint: '$ per 1M tokens (blank = input price)' },
  { key: 'audioOutputPerMTok', label: 'Audio output', hint: '$ per 1M tokens (blank = output price)' },
  { key: 'perMinute', label: 'Per audio minute', hint: '$ per minute (transcription)' },
];

const text = (v: number | null) => (v === null ? '' : String(v));

/** Set a model's price by hand — the weekly LiteLLM check then leaves it alone. */
export function ModelPriceDialog({ model, onClose }: { model: AiModelPrice | null; onClose: () => void }) {
  return (
    <Dialog open={!!model} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {model && <PriceForm key={model.id} model={model} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function PriceForm({ model, onClose }: { model: AiModelPrice; onClose: () => void }) {
  const save = useUpdateAiModelPrice();
  const [values, setValues] = useState<Record<Field, string>>(() => ({
    inputPerMTok: text(model.inputPerMTok),
    cachedInputPerMTok: text(model.cachedInputPerMTok),
    outputPerMTok: text(model.outputPerMTok),
    audioInputPerMTok: text(model.audioInputPerMTok),
    audioOutputPerMTok: text(model.audioOutputPerMTok),
    perMinute: text(model.perMinute),
  }));
  const parsed = Object.fromEntries(
    FIELDS.map(f => {
      const raw = values[f.key].trim();
      return [f.key, raw === '' ? null : Number(raw)];
    }),
  ) as Record<Field, number | null>;
  const invalid = FIELDS.some(f => {
    const v = parsed[f.key];
    return v !== null && (!Number.isFinite(v) || v < 0);
  });
  const empty = parsed.inputPerMTok === null && parsed.outputPerMTok === null && parsed.perMinute === null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Price of {model.name}</DialogTitle>
        <DialogDescription>
          What OpenAI charges for this model. A price set here is kept — the weekly check stops updating it until
          you switch back to automatic. Calls made while it had no price are priced now.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(f => (
          <div key={f.key} className="grid gap-1.5">
            <Label htmlFor={`price-${f.key}`}>{f.label}</Label>
            <Input
              id={`price-${f.key}`}
              inputMode="decimal"
              value={values[f.key]}
              onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
              placeholder="—"
            />
            <p className="text-muted-foreground text-[11px]">{f.hint}</p>
          </div>
        ))}
      </div>
      {save.error && <p className="text-destructive text-sm">{save.error.message}</p>}
      <DialogFooter className="gap-2 sm:justify-between">
        {model.priceSource === 'MANUAL' ? (
          <Button
            variant="ghost"
            disabled={save.isPending}
            onClick={() => save.mutate({ id: model.id, input: { automatic: true } }, { onSuccess: onClose })}
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
            disabled={save.isPending || invalid || empty}
            onClick={() => save.mutate({ id: model.id, input: parsed }, { onSuccess: onClose })}
          >
            {save.isPending ? 'Saving…' : 'Save price'}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
