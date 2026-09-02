/**
 * The timezone menu.
 *
 * A CURATED list, not `Intl.supportedValuesOf('timeZone')` — that returns ~450 entries and
 * this firm's clients are in Canada and the US. The server accepts **any** valid IANA id
 * (it validates against ICU itself), so this list is a convenience, never a constraint: a
 * zone stored outside it still resolves correctly and is shown here as-is.
 *
 * Quebec first, matching `PHONE_DEFAULT_REGIONS_CA` and the QC-specific fields throughout
 * the schema.
 */
export const TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/Toronto', label: 'Eastern — Toronto / Montreal' },
  { value: 'America/Halifax', label: 'Atlantic — Halifax' },
  { value: 'America/St_Johns', label: 'Newfoundland — St. John’s' },
  { value: 'America/Winnipeg', label: 'Central — Winnipeg' },
  { value: 'America/Regina', label: 'Central (no DST) — Regina' },
  { value: 'America/Edmonton', label: 'Mountain — Edmonton / Calgary' },
  { value: 'America/Vancouver', label: 'Pacific — Vancouver' },
  { value: 'America/New_York', label: 'Eastern (US) — New York' },
  { value: 'America/Chicago', label: 'Central (US) — Chicago' },
  { value: 'America/Denver', label: 'Mountain (US) — Denver' },
  { value: 'America/Phoenix', label: 'Mountain (no DST) — Phoenix' },
  { value: 'America/Los_Angeles', label: 'Pacific (US) — Los Angeles' },
  { value: 'UTC', label: 'UTC' },
];

/**
 * The menu, guaranteed to contain `current`.
 *
 * Without this, a zone set outside the curated list (through the API, or after the list is
 * trimmed) renders as an empty Select and the admin's next save silently rewrites it.
 */
export function timezoneOptions(current: string): { value: string; label: string }[] {
  if (TIMEZONES.some((t) => t.value === current)) return TIMEZONES;
  return [{ value: current, label: current }, ...TIMEZONES];
}

/** `{ value: label }`, the shape the local shadcn `Select` takes as its `items` prop. */
export function timezoneItems(current: string): Record<string, string> {
  return Object.fromEntries(timezoneOptions(current).map((t) => [t.value, t.label]));
}

/** The viewer's own zone, for the "your computer is in …" hint. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** `"09:00"` → `"9:00 AM"`. Display only; the stored value is always 24-hour `HH:mm`. */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}
