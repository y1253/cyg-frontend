import type { CompanySummary } from '@/api/companies';

/**
 * Is there nothing to do for this company right now?
 *
 * A "quiet" company is rendered recessed on the dashboard so the rows that
 * actually want attention stand out. It has to be true that nothing is pending
 * AND that the row is carrying no tag of its own — a tag is a call to action, so
 * a row showing one is never quiet however empty the rest of it is.
 *
 * `uncompleted === undefined` means the company has no mailbox connected at all
 * (the counts map simply omits it), which counts as quiet: there is no inbox, so
 * there is nothing in it. That is a deliberate product decision, not an
 * oversight — the alternative reading is that an unconnected mailbox is setup
 * work still owed, in which case this should require `uncompleted === 0`.
 *
 * `urgentTodos` and `importantTodos` are already implied by `totalTodos === 0`
 * (the server derives all three from the same open-todo set), but they are
 * spelled out so the rule stays correct if those counters are ever redefined.
 */
export function isQuietCompany(
  company: CompanySummary,
  uncompleted: number | undefined,
  internal: boolean,
): boolean {
  // The internal workspace has its own teal treatment and no todos apply to it.
  if (internal) return false;

  return (
    (uncompleted === undefined || uncompleted === 0) &&
    company.totalTodos === 0 &&
    company.urgentTodos === 0 &&
    company.importantTodos === 0 &&
    company.assignedUser !== null
  );
}
