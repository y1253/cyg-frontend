/**
 * How many messages "Complete till here" is about to affect, for the confirm dialog.
 *
 * ⚠️ An ESTIMATE, and the dialog says "up to". The server is what decides: it rebuilds the
 * conversation itself and can see messages older than this view's cap, and it skips rows
 * that are already complete. So this number can be lower than the truth, and the toast
 * afterwards reports the server's own `completed` rather than this.
 *
 * It exists because a confirm dialog that cannot name a number is not much of a confirm —
 * "Mark messages complete?" gives somebody nothing to weigh, and this action is the one
 * with no bulk undo.
 *
 * Mirrors the ordering rule in server `communications/complete-until.util.ts#idsUpTo`:
 * sort by time with an id tie-break, then cut at the anchor. The tie-break matters for the
 * same reason it does there — WhatsApp timestamps arrive in whole seconds.
 */
export interface CountableMessage {
  id: string;
  /** ISO. */
  at: string;
  /** Already complete — excluded, because completing it again changes nothing. */
  isCompleted?: boolean;
  /**
   * A message this user sent. Excluded ONLY where the server excludes it too: WhatsApp
   * refuses to change an outbound row, and an internal message you sent has no recipient
   * row of your own. A text or an email you sent IS completable, so callers there leave
   * this unset.
   */
  isOwn?: boolean;
}

export function countCompletableUpTo(
  messages: readonly CountableMessage[],
  anchorId: string,
): number {
  const ordered = [...messages].sort((a, b) => {
    const at = new Date(a.at).getTime() - new Date(b.at).getTime();
    if (at !== 0) return at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const index = ordered.findIndex((m) => m.id === anchorId);
  if (index === -1) return 0;
  return ordered
    .slice(0, index + 1)
    .filter((m) => !m.isCompleted && !m.isOwn).length;
}
