// Shared constants and helpers for recurring-schedule cycle pickers.
// Keep this the single source of truth so day-of-month behavior stays consistent
// across the Register wizard, AddTaskDialog, TaskDialog, and the schedule editor.

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const ORDINALS = ["1st", "2nd", "3rd", "4th"];

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Sentinel stored in `cycleDay` meaning "the last day of the month", regardless
 * of how many days the month has. Used by the date-based cycle types
 * (MONTHLY_DATE / QUARTERLY / YEARLY). The day picker lists 1–28 then this value.
 * Must match the backend `LAST_DAY_OF_MONTH` in compute-next-due.ts.
 */
export const LAST_DAY_OF_MONTH = 0;

/** Highest selectable concrete day (every month has at least 28 days). */
export const MAX_MONTH_DAY = 28;

/** Returns "st" | "nd" | "rd" | "th" for a day number. */
export function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/**
 * Human label for a day-of-month value: "the last day" for the sentinel,
 * otherwise "the 15th". `cycleDay` may arrive as a number or string.
 */
export function monthDayLabel(value: number | string): string {
  const n = Number(value);
  if (n === LAST_DAY_OF_MONTH) return "the last day";
  return `the ${n}${ordinalSuffix(n)}`;
}
