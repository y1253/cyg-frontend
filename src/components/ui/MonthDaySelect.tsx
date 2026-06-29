import { cn } from "@/lib/utils";
import { LAST_DAY_OF_MONTH, MAX_MONTH_DAY } from "@/lib/cycle";

interface MonthDaySelectProps {
  /** Current cycleDay value (1–28, or LAST_DAY_OF_MONTH = 0). Accepts string/number. */
  value: number | string;
  /** Called with the selected day as a number (0 = last day of month). */
  onChange: (value: number) => void;
  id?: string;
  className?: string;
}

/**
 * Day-of-month picker for date-based recurring cycles. Lists 1–28 then a
 * "Last day of month" option (value 0) that always resolves to the real last
 * day of whatever month it is. Single source of truth for this control.
 */
export function MonthDaySelect({ value, onChange, id, className }: MonthDaySelectProps) {
  return (
    <select
      id={id}
      value={String(value)}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring",
        className,
      )}
    >
      {Array.from({ length: MAX_MONTH_DAY }, (_, i) => i + 1).map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
      <option value={LAST_DAY_OF_MONTH}>Last day of month</option>
    </select>
  );
}
