import type { Placeholder } from '@/api/phoneSettings';

/**
 * Accepted spellings of each token, normalised (lowercased, spaces stripped).
 *
 * Mirrors `KEY_ALIASES` in `server/src/phone-settings/phone-message.util.ts`. The two must
 * stay in step: this drives only the as-you-type preview, so a mismatch would show an
 * admin one thing and play the caller another.
 */
const ALIASES: Record<string, string> = {
  company: 'company',
  companyname: 'company',
  business: 'company',
  businessname: 'company',
  phone: 'phone',
  number: 'phone',
  supportnumber: 'phone',
  hours: 'hours',
  todayshours: 'hours',
};

const TOKEN_RE = /\{\s*([a-z][a-z ]*?)\s*\}/gi;

/**
 * A LOCAL preview of the placeholder substitution.
 *
 * Deliberately mirrors the server's rules — ONE pass, and an unknown token left VERBATIM —
 * so the preview never promises something different from what a caller gets. The server is
 * still the authority: `POST /phone-settings/preview` renders against the real company,
 * and this is only the instant feedback while typing.
 */
export function renderPreview(
  template: string,
  placeholders: Placeholder[],
  values: Record<string, string>,
): string {
  const byKey = new Map(
    placeholders.map((p) => [p.key.toLowerCase(), values[p.key] ?? p.example]),
  );
  return template.replace(TOKEN_RE, (match, raw: string) => {
    const key = ALIASES[raw.toLowerCase().replace(/\s+/g, '')];
    if (!key) return match;
    return byKey.get(key) ?? '';
  });
}
