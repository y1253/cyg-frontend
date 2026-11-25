import { useState } from 'react';
import { Check, Gauge, Loader2 } from 'lucide-react';
import type { SubscriptionPlanInput } from '@/api/customerBilling';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSubscriptionPlan } from '@/hooks/useSubscriptionPlan';
import { useUpdateSubscriptionPlan } from '@/hooks/useUpdateSubscriptionPlan';
import { fmtDateTime } from '../customer-format';

type Field = keyof SubscriptionPlanInput;

const FIELDS: { key: Field; label: string; hint: string; min: number; max: number; suffix?: string }[] = [
  { key: 'monthlyTransactionLimit', label: 'Monthly transaction limit', hint: 'New transactions a subscriber may add per month', min: 1, max: 10_000_000 },
  { key: 'warnPercent', label: 'Warn at', hint: 'Tell the customer once this much is used', min: 50, max: 99, suffix: '%' },
  { key: 'trialTransactions', label: 'Trial transactions', hint: 'Free trial allowance', min: 0, max: 100_000 },
  { key: 'trialTexts', label: 'Trial AI texts', hint: 'Texts / WhatsApps the AI sends', min: 0, max: 100_000 },
  { key: 'trialCallMinutes', label: 'Trial AI call minutes', hint: 'Every started minute counts', min: 0, max: 100_000 },
];

/** Shown while the plan loads, and the first-read defaults. */
const DEFAULTS: SubscriptionPlanInput = {
  monthlyTransactionLimit: 30_000,
  warnPercent: 80,
  trialTransactions: 100,
  trialTexts: 15,
  trialCallMinutes: 20,
};

/**
 * ADMIN: the plan every subscriber is on — their monthly transaction limit — and the free
 * trial's three allowances (it ends when any one is used up). The customer API reads the row
 * on every check, so a save is live at once.
 */
export function PlanCard() {
  const plan = useSubscriptionPlan();
  const save = useUpdateSubscriptionPlan();
  const [draft, setDraft] = useState<Partial<Record<Field, string>>>({});
  const [saved, setSaved] = useState(false);

  const current = plan.data ?? DEFAULTS;
  const text = (k: Field) => draft[k] ?? String(current[k]);

  const problems: Partial<Record<Field, string>> = {};
  const changes: Partial<SubscriptionPlanInput> = {};
  for (const f of FIELDS) {
    const raw = draft[f.key];
    if (raw === undefined) continue;
    const t = raw.trim().replace(/,/g, '');
    const n = Number(t);
    if (!/^\d+$/.test(t) || n < f.min || n > f.max)
      problems[f.key] = `A whole number from ${f.min.toLocaleString()} to ${f.max.toLocaleString()}`;
    else if (n !== current[f.key]) changes[f.key] = n;
  }
  const invalid = Object.keys(problems).length > 0;
  const dirty = Object.keys(changes).length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid || !dirty) return;
    setSaved(false);
    save.mutate(changes, {
      onSuccess: () => {
        setDraft({});
        setSaved(true);
      },
    });
  };

  return (
    <Card className="py-0">
      <CardContent className="p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <Gauge size={18} />
          </span>
          <div>
            <h3 className="font-semibold">Plan</h3>
            <p className="text-muted-foreground text-sm">
              The subscription's monthly transaction limit, and the free trial — it ends as soon as any one allowance is
              used up. Live on cygfinance.com as soon as you save.
            </p>
          </div>
        </div>

        {plan.isLoading ? (
          <div className="bg-muted h-24 animate-pulse rounded-lg" />
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {FIELDS.map(f => (
                <div key={f.key} className="grid content-start gap-1.5">
                  <Label htmlFor={`plan-${f.key}`}>{f.label}</Label>
                  <div className="relative">
                    <Input
                      id={`plan-${f.key}`}
                      inputMode="numeric"
                      value={text(f.key)}
                      onChange={e => {
                        setDraft(d => ({ ...d, [f.key]: e.target.value }));
                        setSaved(false);
                      }}
                      className={f.suffix ? 'pr-7 tabular-nums' : 'tabular-nums'}
                    />
                    {f.suffix && (
                      <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">
                        {f.suffix}
                      </span>
                    )}
                  </div>
                  <p className={problems[f.key] ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
                    {problems[f.key] ?? f.hint}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={!dirty || invalid || save.isPending} className="gap-2">
                {save.isPending && <Loader2 size={14} className="animate-spin" />}
                Save plan
              </Button>
              {dirty && (
                <Button type="button" variant="ghost" onClick={() => setDraft({})}>
                  Undo changes
                </Button>
              )}
              {saved && !dirty && (
                <span className="flex items-center gap-1 text-sm text-emerald-700">
                  <Check size={14} /> Saved — live on cygfinance.com
                </span>
              )}
              {save.error && <span className="text-destructive text-sm">{save.error.message}</span>}
              {plan.data && (
                <span className="text-muted-foreground ml-auto text-xs">Last changed {fmtDateTime(plan.data.updatedAt)}</span>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
