/**
 * step11 part 4 (2026-11-27): the rules of a customer's own ledger columns, for the Bank
 * transactions tab — a COPY of the customer client's `lib/custom-columns.ts` (and the customer
 * API's `custom-column.util.ts`), so a cell refuses a bad answer before it is sent. The
 * customer API checks again. Keep them in step.
 */
export type CustomColumnType = 'TEXT' | 'LETTERS' | 'NUMBER' | 'DROPDOWN';

export const MAX_ANSWER_CHARS = 1000;

export interface CustomColumnRules {
  type: CustomColumnType;
  minChars: number | null;
  maxChars: number | null;
}

/** Why a typed answer breaks the column's rules, or null when it is fine (empty = clear). */
export function answerProblem(rules: CustomColumnRules, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.length > MAX_ANSWER_CHARS) return `At most ${MAX_ANSWER_CHARS} characters`;
  if (rules.type === 'NUMBER' && !/^-?\d+(?:[.,]\d+)?$/.test(v)) return 'Numbers only';
  if (rules.type === 'LETTERS' && /\d/.test(v)) return 'No digits';
  if (rules.minChars !== null && v.length < rules.minChars)
    return `At least ${rules.minChars} characters`;
  if (rules.maxChars !== null && v.length > rules.maxChars)
    return `At most ${rules.maxChars} characters`;
  return null;
}

/** What the input may hold WHILE typing (no letters in a number, nothing past the max). */
export function typedValue(rules: CustomColumnRules, next: string): string {
  let v = next;
  if (rules.type === 'NUMBER') v = v.replace(/[^\d.,-]/g, '');
  if (rules.type === 'LETTERS') v = v.replace(/\d/g, '');
  const max = rules.maxChars ?? MAX_ANSWER_CHARS;
  return v.length > max ? v.slice(0, max) : v;
}

/** What a QuickBooks-linked column is linked to, in words. */
export const QBO_KIND_LABELS: Record<string, string> = {
  CLASS: 'QuickBooks class',
  FIELD: 'QuickBooks custom field',
  LOCATION: 'QuickBooks location',
  CUSTOMER: 'QuickBooks customer',
};
