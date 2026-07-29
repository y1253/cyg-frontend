// base-ui's `<Select.Value>` renders the RAW value in the trigger unless the
// `Select` root is given an `items` map — unlike Radix, an Item's children are
// not registered as the trigger's label. Without this a trigger shows "ADMIN",
// "overdue25" or a user id instead of a readable name.
//
// Always build the map from the same array the options are rendered from (or
// render the options from the map) so the two can't drift apart.

/** `{ [String(value)]: label }` for a list of options. */
export function selectItems<T>(
  list: readonly T[],
  getValue: (item: T, index: number) => string | number,
  getLabel: (item: T, index: number) => string,
): Record<string, string> {
  return Object.fromEntries(
    list.map((item, i) => [String(getValue(item, i)), getLabel(item, i)]),
  );
}

/**
 * Positional label arrays (WEEKDAYS, ORDINALS, MONTHS) keyed by index:
 * `{ '0': 'Sunday', '1': 'Monday', … }`. Pass `offset: 1` when the select
 * stores 1-based values (e.g. the yearly month picker).
 */
export function indexedSelectItems(
  labels: readonly string[],
  offset = 0,
): Record<string, string> {
  return selectItems(labels, (_, i) => i + offset, (label) => label);
}
