import { useEffect, useState } from 'react';
import type { KindFilter, Selection } from './types';
import type { SearchFilters } from './search-filters';

// ── Persisted view state ──────────────────────────────────────────────────────
// Where the user last was in this company's Communications tab, so a reload (or
// leaving the company and coming back) reopens the same message/folder instead of
// dumping them at the top of the inbox. Its own key — CompanyDetailPage's
// `cmp-ui-<id>` writer rewrites that whole blob and would clobber extra fields.
// Drafts/attachments are deliberately NOT persisted (a File can't be serialized);
// those survive via keep-alive only — a tab switch here, and, for the docked compose
// windows, navigating to another company and back (see ComposerContext).
export type CommUI = {
  /**
   * Schema version. v1 stored five correlated id fields; a half-restored combination
   * (a space id with no anchor time, say) produced a thread frozen at nothing. v2
   * stores one `selected` object instead, so the invalid combinations are
   * unrepresentable — and a v1 blob left in a browser from before the deploy is
   * restored for its folder and search only, never for its open item.
   */
  v?: number;
  selectedLabel?: string;
  selected?: Selection | null;
  filter?: KindFilter;
  searchInput?: string;
  filters?: SearchFilters;
};

const CURRENT_VERSION = 2;

/**
 * Is this a `Selection` we can actually render?
 *
 * Storage is not a trusted input: it survives deploys, and a shape from an older
 * build (or a hand-edited value) would otherwise open a detail view missing the very
 * field it needs.
 *
 * Exported so the notification panel can assert in a test that every feed row it can
 * render produces a Selection this accepts — a rejected one is a row that navigates and
 * then opens nothing, with no error anywhere.
 */
export function isValidSelection(value: unknown): value is Selection {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  const str = (k: string) => typeof s[k] === 'string' && s[k] !== '';
  switch (s.kind) {
    case 'email':
      return str('msgId');
    case 'chat':
      return str('spaceId') && str('msgId') && str('msgTime');
    case 'sms':
      return str('peer') && str('msgId') && str('msgTime');
    case 'call':
      return str('sid') && str('itemId');
    default:
      return false;
  }
}

const commKey = (companyId: number) => `cmp-comm-${companyId}`;

function readCommUI(companyId: number): CommUI {
  let raw: CommUI;
  try {
    raw = JSON.parse(localStorage.getItem(commKey(companyId)) ?? '{}') as CommUI;
  } catch {
    return {};
  }
  // Anything older than the current schema keeps its folder and search but drops the
  // open item, rather than being coerced into a shape it was never written in.
  if (raw.v !== CURRENT_VERSION) {
    return {
      selectedLabel: raw.selectedLabel,
      filter: raw.filter,
      searchInput: raw.searchInput,
      filters: raw.filters,
      selected: null,
    };
  }
  return { ...raw, selected: isValidSelection(raw.selected) ? raw.selected : null };
}

/**
 * Where the user left off, read once on mount.
 *
 * Split from the writer below because the caller needs this value to *seed* its
 * state, which has to happen before there is anything to persist.
 *
 * The caller is keyed by companyId in CompanyDetailPage, so this re-reads per
 * company — no cross-company bleed, and no reset effect needed.
 */
export function useRestoredCommUi(companyId: number): CommUI {
  // A lazy `useState` initializer rather than a ref: same "read exactly once"
  // semantics, but readable during render without tripping the refs rule.
  const [restored] = useState(() => readCommUI(companyId));
  return restored;
}

/** Remember where the user is, so a reload / revisit reopens the same place. */
export function usePersistCommUi(companyId: number, current: CommUI): void {
  const { selectedLabel, selected, filter, searchInput } = current;
  // The object identity changes on every render; its CONTENT is what matters.
  const selectedKey = selected ? JSON.stringify(selected) : '';
  useEffect(() => {
    try {
      localStorage.setItem(
        commKey(companyId),
        JSON.stringify({
          v: CURRENT_VERSION,
          selectedLabel,
          selected: selectedKey ? (JSON.parse(selectedKey) as Selection) : null,
          filter,
          searchInput,
        } satisfies CommUI),
      );
    } catch {
      // storage full / disabled — losing the restore point is not worth breaking on
    }
  }, [companyId, selectedLabel, selectedKey, filter, searchInput]);
}

/**
 * Point a company's Communications tab at one message before navigating to it.
 *
 * For the cold case — the tab is not mounted yet, so the live `pendingOpen` channel has
 * nobody to hear it — and so the choice survives a reload afterwards.
 *
 * READ-MODIFY-WRITE: this blob also holds the folder, the search term and the advanced
 * filters, and overwriting it would silently reset the user's view.
 *
 * The folder is forced to INBOX because the restored item has to be listable where the
 * user lands: somebody parked in DRAFTS, or in a filtered folder, would otherwise arrive
 * somewhere the message does not appear.
 */
export function writePendingCommSelection(
  companyId: number,
  selection: Selection,
  label = 'INBOX',
): void {
  try {
    const existing = readCommUI(companyId);
    localStorage.setItem(
      commKey(companyId),
      JSON.stringify({
        ...existing,
        v: CURRENT_VERSION,
        selectedLabel: label,
        selected: selection,
      } satisfies CommUI),
    );
  } catch {
    // storage full / disabled — the live pendingOpen channel still opens it.
  }
}
