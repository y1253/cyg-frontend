import { cn } from '@/lib/utils';
import type { FormData } from '../RegisterPage';

interface Props {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}

export function Step2Country({ data, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium text-foreground">
        Where is your business located?
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange({ country: 'USA' })}
          className={cn(
            'flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-sm font-medium transition-all',
            data.country === 'USA'
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30',
          )}
        >
          <span className="text-3xl">🇺🇸</span>
          United States
        </button>
        <button
          type="button"
          onClick={() => onChange({ country: 'CANADA' })}
          className={cn(
            'flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-sm font-medium transition-all',
            data.country === 'CANADA'
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/30',
          )}
        >
          <span className="text-3xl">🇨🇦</span>
          Canada
        </button>
      </div>
      {data.country === 'CANADA' && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
          Canadian businesses will be asked for additional legal information in a later step.
        </p>
      )}
    </div>
  );
}
