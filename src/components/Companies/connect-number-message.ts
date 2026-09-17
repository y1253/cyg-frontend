/**
 * What to tell an admin whose number search came back with nothing to buy.
 *
 * ── WHY THIS IS A FUNCTION AND NOT A SENTENCE ──────────────────────────────────
 * There are four ways to end up looking at an empty list, and they call for four
 * different responses — wait for a carrier registration, try a different area code, retry
 * in a minute, or nothing at all because numbers were actually found. The dialog used to
 * render ONE sentence for all of them, with the A2P 10DLC explanation appended whenever
 * the country toggle said USA.
 *
 * That is a confident wrong answer in two of the four cases, and it is not hypothetical:
 * while investigating this, every search — Canadian ones included — came back empty for a
 * few minutes during a provider blip, and the dialog would have blamed a US carrier rule
 * for it. An explanation that cannot be wrong is worth more than one that is usually right.
 *
 * `totalFound` is what separates them: it is what the provider returned BEFORE the
 * voice+SMS bar was applied, so "100 found, none qualify" and "none found" stop looking
 * identical from here.
 */

export type SearchOutcome = 'idle' | 'pending' | 'error' | 'success';

export interface EmptyResultInput {
  outcome: SearchOutcome;
  /** How many the provider returned before the voice+SMS bar. */
  totalFound: number;
  /** How many survived it. A message is only needed when this is 0. */
  eligibleCount: number;
  country: 'USA' | 'CANADA';
  /** Blank when the admin searched without one. */
  areaCode: string;
}

/**
 * The message, or null when there is nothing to explain (results exist, or no search has
 * run yet). Null rather than an empty string so the caller renders no box at all.
 */
export function emptyResultMessage(input: EmptyResultInput): string | null {
  const { outcome, totalFound, eligibleCount, country, areaCode } = input;

  // A FAILED request is not an empty result and gets no explanation from here — the
  // dialog already renders the provider's own error, which says more than anything this
  // could invent ("Phone service timed out" vs a generic retry line). Returning null is
  // also what guarantees the thing this file exists for: a failure can never reach the
  // A2P 10DLC branch below, which is exactly what it used to do.
  if (outcome !== 'success') return null;
  if (eligibleCount > 0) return null;

  const where = areaCode ? `area code ${areaCode}` : 'that area';

  if (totalFound === 0) {
    // Nothing was offered at all — a different problem from "offered, but unusable", and
    // one the admin can act on immediately by trying somewhere else.
    return `No numbers at all are available in ${where}. Try a different area code.`;
  }

  const count = `${totalFound} number${totalFound === 1 ? '' : 's'}`;
  const found = `${count} ${totalFound === 1 ? 'is' : 'are'} available in ${where}, but ${
    totalFound === 1 ? 'it cannot' : 'none of them can'
  } send texts.`;

  // The ONLY branch that may cite A2P 10DLC: numbers genuinely exist and were genuinely
  // rejected for lacking SMS, on a US search, which is exactly what that rule explains.
  return country === 'USA'
    ? `${found} US numbers stay voice-only until your A2P 10DLC registration completes. Canadian numbers are unaffected.`
    : `${found} A support number has to do both, so none of these can be used.`;
}
