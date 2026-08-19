import { useEffect, useState } from 'react';
import type { KindFilter } from './types';

// ── Persisted view state ──────────────────────────────────────────────────────
// Where the user last was in this company's Communications tab, so a reload (or
// leaving the company and coming back) reopens the same message/folder instead of
// dumping them at the top of the inbox. Its own key — CompanyDetailPage's
// `cmp-ui-<id>` writer rewrites that whole blob and would clobber extra fields.
// Drafts/attachments are deliberately NOT persisted (a File can't be serialized);
// those survive via keep-alive only — a tab switch here, and, for the docked compose
// windows, navigating to another company and back (see ComposerContext).
export type CommUI = {
  selectedLabel?: string;
  selectedMsgId?: string | null;
  selectedSpaceId?: string | null;
  openedChatMsgId?: string | null;
  openedChatMsgTime?: string | null;
  filter?: KindFilter;
  searchInput?: string;
};

const commKey = (companyId: number) => `cmp-comm-${companyId}`;

function readCommUI(companyId: number): CommUI {
  try {
    return JSON.parse(localStorage.getItem(commKey(companyId)) ?? '{}') as CommUI;
  } catch {
    return {};
  }
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
  const {
    selectedLabel,
    selectedMsgId,
    selectedSpaceId,
    openedChatMsgId,
    openedChatMsgTime,
    filter,
    searchInput,
  } = current;
  useEffect(() => {
    try {
      localStorage.setItem(
        commKey(companyId),
        JSON.stringify({
          selectedLabel,
          selectedMsgId,
          selectedSpaceId,
          openedChatMsgId,
          openedChatMsgTime,
          filter,
          searchInput,
        } satisfies CommUI),
      );
    } catch {
      // storage full / disabled — losing the restore point is not worth breaking on
    }
  }, [
    companyId,
    selectedLabel,
    selectedMsgId,
    selectedSpaceId,
    openedChatMsgId,
    openedChatMsgTime,
    filter,
    searchInput,
  ]);
}
