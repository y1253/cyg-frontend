import { useState } from 'react';
import {
  endOfMonth, format, startOfMonth, startOfYear, subDays, subMonths,
} from 'date-fns';
import { CalendarIcon, X } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import type { FileDateRange } from '@/api/companyFiles';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
/** Local midnight — never `new Date('2026-03-01')`, which is UTC and lands a day early. */
const day = (s: string) => new Date(`${s}T00:00:00`);

const PRESETS: { label: string; range: () => [Date, Date] }[] = [
  { label: 'Today', range: () => [new Date(), new Date()] },
  { label: 'Last 7 days', range: () => [subDays(new Date(), 6), new Date()] },
  { label: 'Last 30 days', range: () => [subDays(new Date(), 29), new Date()] },
  { label: 'This month', range: () => [startOfMonth(new Date()), new Date()] },
  {
    label: 'Last month',
    range: () => {
      const m = subMonths(new Date(), 1);
      return [startOfMonth(m), endOfMonth(m)];
    },
  },
  { label: 'This year', range: () => [startOfYear(new Date()), new Date()] },
];

/** "Mar 1 – Mar 31, 2026", "From Mar 1, 2026", or "Any date". */
// eslint-disable-next-line react-refresh/only-export-components
export function fileDateRangeLabel(range: FileDateRange): string {
  const { from, to } = range;
  if (from && to) {
    if (from === to) return format(day(from), 'MMM d, yyyy');
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    return `${format(day(from), sameYear ? 'MMM d' : 'MMM d, yyyy')} – ${format(day(to), 'MMM d, yyyy')}`;
  }
  if (from) return `From ${format(day(from), 'MMM d, yyyy')}`;
  if (to) return `Until ${format(day(to), 'MMM d, yyyy')}`;
  return 'Any date';
}

/**
 * The Attachments folder's date filter (step2.md 2026-11-10): a range calendar with quick
 * presets. Emits local YYYY-MM-DD days, both inclusive.
 */
export function FileDateFilter({
  value,
  onChange,
}: {
  value: FileDateRange;
  onChange: (next: FileDateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = Boolean(value.from || value.to);
  const selected: DateRange | undefined = active
    ? { from: value.from ? day(value.from) : undefined, to: value.to ? day(value.to) : undefined }
    : undefined;

  const apply = (from: Date, to: Date) => {
    onChange({ from: ymd(from), to: ymd(to) });
    setOpen(false);
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground',
            active ? 'border-teal-300 text-teal-800' : 'text-muted-foreground',
          )}
        >
          <CalendarIcon size={14} />
          {fileDateRangeLabel(value)}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="flex flex-col sm:flex-row">
            <div className="flex flex-wrap gap-1 border-b p-2 sm:w-36 sm:flex-col sm:flex-nowrap sm:border-r sm:border-b-0">
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => apply(...p.range())}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <Calendar
              mode="range"
              numberOfMonths={1}
              selected={selected}
              defaultMonth={selected?.from ?? new Date()}
              disabled={{ after: new Date() }}
              onSelect={(r) => {
                if (!r?.from) {
                  onChange({});
                  return;
                }
                // The first click is a one-day range; the second click sets its end.
                onChange({ from: ymd(r.from), to: ymd(r.to ?? r.from) });
                if (r.to && r.to.getTime() !== r.from.getTime()) setOpen(false);
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
      {active && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear date filter"
          title="Clear date filter"
          onClick={() => onChange({})}
        >
          <X />
        </Button>
      )}
    </div>
  );
}
