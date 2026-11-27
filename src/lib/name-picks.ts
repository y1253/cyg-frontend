import type { NamesFull } from '@/api/customerNames';

/** 2026-11-27: the split-rule pick values the name editor's select uses. */
export const NONE = '__none__';
export const PARENT = '__parent__';

/** The split-rule pick of a name / sub-name as one select value. */
export function pickValue(
  data: NamesFull,
  ids: number[],
  followsParent: boolean,
): string {
  if (followsParent) return PARENT;
  if (!ids.length) return NONE;
  const set = [...ids].sort().join(',');
  const group = data.tax.groups.find((g) => [...g.agencyIds].sort().join(',') === set);
  if (group) return `g:${group.id}`;
  if (ids.length === 1) return `a:${ids[0]}`;
  return 'mixed';
}

/** The pick in words (the collapsed row's chip). */
export function pickLabel(data: NamesFull, value: string): string | null {
  if (value === NONE || value === PARENT) return null;
  if (value === 'mixed') return 'several split rules';
  const [kind, id] = value.split(':');
  if (kind === 'g') return data.tax.groups.find((g) => g.id === Number(id))?.name ?? null;
  return data.tax.agencies.find((a) => a.id === Number(id))?.name ?? null;
}

