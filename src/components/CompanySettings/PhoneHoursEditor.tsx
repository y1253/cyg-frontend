import { Checkbox } from '@/components/ui/checkbox';
import { WEEKDAYS } from '@/lib/cycle';
import { formatTime } from '@/lib/timezones';
import { isOvernight } from '@/lib/weekly-hours';
import type { DayHours, WeeklyHours } from '@/api/phoneSettings';

const DEFAULT_DAY: DayHours = { open: '09:00', close: '17:00' };

/**
 * The 7-row weekly hours grid, shared by the global page and the per-company card.
 *
 * Row order is Sunday → Saturday, driven by `WEEKDAYS` from `lib/cycle.ts` so the index
 * base matches the server's `WeeklyHours` and `TaskSchedule.cycleDay`.
 *
 * Times use a native `<input type="time">`: it already gives back `"HH:mm"` 24-hour —
 * exactly the stored format — while showing the viewer their own locale's clock. Building
 * a custom picker would mean re-deriving that conversion by hand.
 */
export function PhoneHoursEditor({
  value,
  onChange,
  disabled,
}: {
  value: WeeklyHours;
  onChange: (next: WeeklyHours) => void;
  disabled?: boolean;
}) {
  const setDay = (index: number, day: DayHours | null) => {
    const next = [...value];
    next[index] = day;
    onChange(next);
  };

  /**
   * Copy Monday onto Tue–Fri. Typing five identical rows is the actual friction here, and
   * a Mon–Fri office is the overwhelmingly common case.
   */
  const copyMondayToWeekdays = () => {
    const monday = value[1];
    const next = [...value];
    for (let i = 2; i <= 5; i++) next[i] = monday ? { ...monday } : null;
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {WEEKDAYS.map((name, index) => {
        const day = value[index] ?? null;
        const closed = day === null;
        return (
          <div key={name} className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm">{name}</span>

              <label className="flex w-20 shrink-0 items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <Checkbox
                  checked={!closed}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    setDay(index, checked ? { ...DEFAULT_DAY } : null)
                  }
                />
                Open
              </label>

              {closed ? (
                <span className="text-sm text-muted-foreground">Closed all day</span>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={day.open}
                    disabled={disabled}
                    onChange={(e) => setDay(index, { ...day, open: e.target.value })}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <input
                    type="time"
                    value={day.close}
                    disabled={disabled}
                    onChange={(e) => setDay(index, { ...day, close: e.target.value })}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  />
                </div>
              )}
            </div>

            {/* A close time at or before the open time is almost always a typo, but it is
                also how a genuine overnight line is expressed — so this explains what the
                server will do rather than rejecting it. */}
            {day && isOvernight(day) && (
              <p className="ml-24 pl-3 text-xs text-amber-600">
                Runs overnight into the next morning — open until{' '}
                {formatTime(day.close)} the following day.
              </p>
            )}
            {day && day.open === day.close && (
              <p className="ml-24 pl-3 text-xs text-amber-600">
                Opening and closing times are the same, so this day counts as closed. For
                24 hours, use 00:00 to 23:59.
              </p>
            )}
          </div>
        );
      })}

      <button
        type="button"
        disabled={disabled}
        onClick={copyMondayToWeekdays}
        className="self-start text-xs text-primary hover:underline disabled:opacity-50"
      >
        Copy Monday to Tuesday–Friday
      </button>
    </div>
  );
}
