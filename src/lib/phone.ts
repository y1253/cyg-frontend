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

/**
 * A number as a person typed or pasted it -> E.164, or null when it cannot be one.
 *
 * Accepts `(438) 256-1210`, `438-256-1210`, `4382561210`, `14382561210` and an already
 * well-formed `+14382561210`. Anything else needs its country code spelled out with a
 * `+`, because guessing one would silently dial the wrong country.
 *
 * Lives here rather than beside a dialog because both the SMS composer and the dialpad
 * need exactly this, and a second copy would drift.
 */
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  // A bare 10-digit number is NANP; 11 digits starting with 1 is the same number
  // written out.
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}
