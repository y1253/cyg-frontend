import type { DayHours, WeeklyHours } from '@/api/phoneSettings';
import { WEEKDAYS } from '@/lib/cycle';
import { formatTime } from '@/lib/timezones';

/** True when this day's window runs past midnight into the next morning. */
export function isOvernight(day: DayHours): boolean {
  return day.open > day.close;
}

/**
 * `Mon–Fri 9:00 AM–5:00 PM`-style one-liner, for the collapsed read view.
 *
 * Purely cosmetic — the authority on whether a company is open is the SERVER's
 * `isOpenAt`, surfaced as `isOpenNow`. Nothing here re-implements that decision.
 */
export function summariseWeek(week: WeeklyHours): string {
  const open = week
    .map((day, index) => ({ day, index }))
    .filter((entry): entry is { day: DayHours; index: number } => entry.day !== null);
  if (open.length === 0) return 'Closed every day';

  const sameHours = open.every(
    (entry) =>
      entry.day.open === open[0].day.open && entry.day.close === open[0].day.close,
  );
  const times = `${formatTime(open[0].day.open)}–${formatTime(open[0].day.close)}`;
  const names = open.map((entry) => WEEKDAYS[entry.index].slice(0, 3));

  // A contiguous run reads far better than "Mon, Tue, Wed, Thu, Fri".
  const contiguous = open.every(
    (entry, i) => i === 0 || entry.index === open[i - 1].index + 1,
  );
  const label =
    names.length > 2 && contiguous
      ? `${names[0]}–${names[names.length - 1]}`
      : names.join(', ');

  return sameHours ? `${label} ${times}` : `${label} (varies)`;
}
