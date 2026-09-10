import type { ReactNode } from 'react';

/**
 * A fact that does not exist in the codebase yet, marked so it cannot ship unnoticed.
 *
 * The legal entity name, mailing address and support phone are genuinely unknown here —
 * every phone string in the client is demo data (`Acme Bookkeeping` / `+1 438 256 1210`).
 * Inventing them would be worse than leaving them blank: The Campaign Registry vets the
 * brand's contact details against the registration, and "missing contact information" and
 * "website mismatch" are both named rejection reasons, so a plausible-looking wrong address
 * fails exactly the same way an absent one does — but silently.
 *
 * Hence amber, bracketed and monospaced: an unfilled placeholder is meant to be visible
 * from across the room on the rendered page, not something you have to grep for. `AMBER`
 * is the brand's own warning colour (`lib/brand.ts`).
 */
export function LegalPlaceholder({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-[#E8B14C]/15 px-1.5 py-0.5 font-mono text-[13px] font-medium text-[#8A6220]">
      [[{children}]]
    </span>
  );
}
