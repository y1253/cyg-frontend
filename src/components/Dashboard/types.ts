export type StatusFilter = 'all' | 'important' | 'overdue25' | 'unassigned';

/** Options for the status filter — also the Select's `items`, so the trigger
 *  reads "Overdue 25d" instead of the raw `overdue25`. */
export const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  overdue25: 'Overdue 25d',
  important: 'Important',
  unassigned: 'Unassigned',
};

/** `'all'` or the id of the user whose companies to show. */
export type AssigneeFilter = number | 'all';
