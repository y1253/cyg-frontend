import type { CustomerAuthType, StatementStatus } from '@/api/customers';

/** A moment (sign-up, upload, read) in the viewer's own time: "Oct 11, 2026, 3:42 PM". */
export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/** A date-only `YYYY-MM-DD`, parsed as LOCAL midnight so it never slips a day. */
export function fmtDay(ymd: string | null): string {
  if (!ymd) return '—';
  return new Date(ymd + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "Sep 1 – Sep 30, 2026" for a statement period. */
export function fmtPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  if (!start || !end) return fmtDay(start ?? end);
  return `${fmtDay(start)} – ${fmtDay(end)}`;
}

/** "just now", "5 min ago", "3 days ago", … then the date. */
export function fmtAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return fmtDay(iso.slice(0, 10));
}

export const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export const pct = (n: number) =>
  `${n.toLocaleString(undefined, { maximumFractionDigits: 3 })}%`;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export const AUTH_LABEL: Record<CustomerAuthType, string> = {
  GOOGLE: 'Google',
  PASSWORD: 'Password',
};

/** Label + Tailwind classes per statement status — what the customer sees, plus the in-between states. */
export const STATUS_STYLE: Record<StatementStatus, { label: string; className: string }> = {
  UPLOADED: { label: 'Uploaded', className: 'bg-slate-100 text-slate-700' },
  PENDING: { label: 'Queued', className: 'bg-sky-100 text-sky-800' },
  PROCESSING: { label: 'Reading…', className: 'bg-sky-100 text-sky-800' },
  DONE: { label: 'Done', className: 'bg-emerald-100 text-emerald-800' },
  NEEDS_REVIEW: { label: 'Needs review', className: 'bg-amber-100 text-amber-800' },
  FAILED: { label: 'Failed', className: 'bg-red-100 text-red-800' },
};
