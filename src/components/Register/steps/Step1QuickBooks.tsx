import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FormData } from '../RegisterPage';

interface Props {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}

const QB_PLANS = [
  { value: 'Essentials', label: 'QuickBooks Online Essentials' },
  { value: 'Plus', label: 'QuickBooks Online Plus' },
  { value: 'Advanced', label: 'QuickBooks Online Advanced' },
];

export function Step1QuickBooks({ data, onChange }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-3 text-sm font-medium text-foreground">
          Do you already have a QuickBooks account?
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange({ hasQbAccount: true, qbPlan: null })}
            className={cn(
              'flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all',
              data.hasQbAccount === true
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30',
            )}
          >
            <span className="text-2xl">✓</span>
            Yes, I have one
          </button>
          <button
            type="button"
            onClick={() => onChange({ hasQbAccount: false, qbPlan: null })}
            className={cn(
              'flex flex-col items-center gap-2 rounded-xl border-2 p-5 text-sm font-medium transition-all',
              data.hasQbAccount === false
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30',
            )}
          >
            <span className="text-2xl">+</span>
            No, I need one
          </button>
        </div>
      </div>

      {data.hasQbAccount === false && (
        <div className="flex flex-col gap-2">
          <Label>Which plan would you like?</Label>
          <Select
            value={data.qbPlan}
            onValueChange={val => onChange({ qbPlan: val })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a QuickBooks plan" />
            </SelectTrigger>
            <SelectContent>
              {QB_PLANS.map(p => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            We will set up the account for you once registration is complete.
          </p>
        </div>
      )}

      {data.hasQbAccount === true && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300">
          Please send an invitation to{' '}
          <span className="font-semibold">chaim@cygfinance.com</span> as your
          accountant in QuickBooks. We will follow up within a week to confirm.
        </div>
      )}
    </div>
  );
}
