/**
 * Should the message list be REPLACED by a spinner?
 *
 * Only when there is nothing to replace.
 *
 * ── WHY THIS IS NOT JUST `a || b || c` ─────────────────────────────────────────
 * The inbox merges three independently-resolving sources, and phone is gated behind a
 * SECOND query — `usePhoneTimeline` only becomes enabled once `usePhoneNumber` has
 * answered. So phone flips from disabled to loading a beat AFTER email and chat have
 * already painted rows, and ORing the three `isLoading` flags wiped a list the user was
 * reading and handed them "Loading…", every single time they opened the tab. A source that
 * arrives late has to merge in behind the list, the way email's own later pages do.
 *
 * The row count rather than a per-source exemption, deliberately: chat resolves later than
 * email and has the same latent wipe, and a cold phone-only company (no mailbox, so the
 * email and chat queries are DISABLED and report `isLoading: false`) still gets its spinner
 * instead of flashing "Inbox is empty" at somebody who has calls waiting.
 *
 * ⚠️ A DISABLED query in TanStack v5 reports `isPending: true` / `isFetching: false`, so
 * `isLoading` is false — which is what lets a phone-only company render at all. Do not swap
 * any of these for `isPending`.
 */
export function showListSpinner(args: {
  isInboxLike: boolean;
  emailLoading: boolean;
  chatLoading: boolean;
  phoneLoading: boolean;
  /** Rows the view would render right now — `visibleItems`, or `emailItems` in a folder. */
  loadedRowCount: number;
}): boolean {
  const sourceLoading = args.isInboxLike
    ? args.emailLoading || args.chatLoading || args.phoneLoading
    : args.emailLoading;
  return sourceLoading && args.loadedRowCount === 0;
}
