/**
 * Display helpers for support numbers.
 *
 * Distinct from `formatPhone` in `lib/utils.ts`, which formats a 10-digit string as the
 * user types it into a form. These take a stored E.164 value and render it for reading.
 */

/**
 * `+14382560856` -> `(438) 256-0856`.
 *
 * Anything that is not a NANP (+1) number is returned unchanged rather than mangled —
 * a number we cannot confidently format is still better shown raw than wrong.
 */
export function formatE164(value: string | null | undefined): string {
  if (!value) return '';
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(value.trim());
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : value;
}
