import { useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChevronDown, ChevronRight, GripVertical, Loader2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMergeCustomerNames } from '@/hooks/useCustomerNames';
import { namesFullKey, useCustomerNamesFull, useEditNames } from '@/hooks/useCustomerNamesFull';
import type { CustomerNameRule, MergeNamesBody } from '@/api/customerRules';
import {
  NamesApiError,
  type FullSubName,
  type NameAnswer,
  type NameDescription,
} from '@/api/customerNames';
import { usePointerDrag } from '@/lib/pointer-drag';
import { cn } from '@/lib/utils';
import { pickLabel, pickValue } from '@/lib/name-picks';
import { NameEditor } from './NameEditor';

/** A name or sub-name — what is merged, or merged into. */
type End =
  | { kind: 'name'; name: string; wrapper: boolean; unclarified: boolean }
  | { kind: 'sub'; id: number; name: string; parent: string; category: string };

const label = (e: End) => e.name;

/**
 * Why `from` cannot be dropped on `to` (null = it can) — the customer API's own rules, so a
 * refused drop shows no-drop instead of failing on the server.
 */
function refusal(from: End, to: End): string | null {
  if (from.kind === 'name' && from.unclarified) return 'Unclarified name cannot be merged';
  if (to.kind === 'name' && to.unclarified) return 'Nothing can be merged into Unclarified name';
  // 2026-11-27: a name with sub-names merges sub by sub (the customer API's `mergeWrapper`).
  if (from.kind === 'name' && to.kind === 'name' && from.name === to.name) return 'Same name';
  if (from.kind === 'name' && to.kind === 'sub' && to.parent === from.name)
    return 'That is one of its own sub-names';
  if (from.kind === 'sub' && to.kind === 'sub' && from.id === to.id) return 'Same sub-name';
  if (from.kind === 'sub' && to.kind === 'name' && to.name === from.parent)
    return `It is already under ${from.parent}`;
  return null;
}

function bodyOf(from: End, to: End): MergeNamesBody {
  if (from.kind === 'name')
    return to.kind === 'name'
      ? { from: from.name, into: to.name }
      : { from: from.name, intoSubNameId: to.id };
  return to.kind === 'name'
    ? { fromSubNameId: from.id, into: to.name }
    : { fromSubNameId: from.id, intoSubNameId: to.id };
}

function mergeText(from: End, to: End): string[] {
  const lines: string[] = [];
  const f = label(from);
  const t = label(to);
  if (from.kind === 'name' && from.wrapper)
    lines.push(
      to.kind === 'sub'
        ? `All of ${f}'s sub-names merge into ${t} and take its category; new transactions follow.`
        : `Each sub-name of ${f} joins ${t}'s sub-name of the same category, or moves under ${t} keeping its category; new transactions follow.`,
    );
  else if (to.kind === 'name' && to.wrapper)
    lines.push(
      `Every transaction of ${f} moves under ${t}, into its sub-name of the same category (made if it has none), and new ones follow.`,
    );
  else if (to.kind === 'sub')
    lines.push(
      `Every transaction of ${f} moves under ${t} and takes its category (${to.category}) and split rules, and new ones follow.`,
    );
  else if (from.kind === 'sub')
    lines.push(
      `Every transaction of ${f} takes the plain name ${t} (no sub-name), its category and its split rules, and new ones follow.`,
    );
  else
    lines.push(
      `Every transaction of ${f} takes the name ${t}, its category and its split rules, and new ones follow.`,
    );
  lines.push(
    from.kind === 'sub'
      ? `${f} is removed — its files go along.`
      : `${f}'s own category and split rules are dropped.`,
  );
  lines.push(
    from.kind === 'name'
      ? `If this company sends bank transactions to QuickBooks, the payees are merged there too: ${f}'s QuickBooks transactions move to ${to.kind === 'sub' ? to.parent : t} and the old payee is made inactive (or simply renamed when QuickBooks has no ${to.kind === 'sub' ? to.parent : t}).`
      : 'QuickBooks is updated on the next push.',
  );
  lines.push('Dragging back cannot split them again.');
  return lines;
}

const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** What the edit dialog opens on: a NAME rule keyed by the name. */
export interface NameEdit {
  matchKey: string;
  name: string | null;
  category: string | null;
}

/** What is dragged: a name, a sub-name, or one of a name's descriptions. */
type DragItem =
  | { kind: 'end'; end: End }
  | { kind: 'desc'; key: string; description: string; owner: string };

/**
 * step11 part 2 (2026-11-26): the Rules tab's Names list — every payee name of the
 * customer's book with its sub-names; a manager drags one onto another to merge them (the
 * customer API merges and moves the QuickBooks payee along).
 * step11 part 4 (2026-11-27): the pencil renames a name / changes its category (a NAME rule)
 * and its rules show as chips.
 * 2026-11-27, later (user: "same idea like the customer system"; "dragging still unable"):
 * the list reads the customer site's whole Names-tab view, each row unfolds the
 * `NameEditor` (group, profile, split rules, custom-field defaults, descriptions), and the
 * drag is pointer-based (`usePointerDrag`) — the native HTML5 drag never started for the
 * user. A description dragged onto another name moves to it.
 */
export function CustomerNamesPanel({
  companyId,
  canEdit,
  search,
  rules,
  onEdit,
  onRemoveRule,
}: {
  companyId: number;
  canEdit: boolean;
  search: string;
  rules: CustomerNameRule[];
  onEdit: (e: NameEdit) => void;
  onRemoveRule: (r: CustomerNameRule) => void;
}) {
  const { data, isLoading, error } = useCustomerNamesFull(companyId);
  const merge = useMergeCustomerNames(companyId);
  const edit = useEditNames(companyId);
  const qc = useQueryClient();
  const [merging, setMerging] = useState<{ from: End; to: End } | null>(null);
  const [moving, setMoving] = useState<{
    key: string;
    description: string;
    to: End;
    conflict: string | null;
  } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const rulesOf = useMemo(() => {
    const map = new Map<string, { own: CustomerNameRule | null; from: CustomerNameRule[] }>();
    const at = (k: string) => {
      const key = k.toLowerCase();
      let entry = map.get(key);
      if (!entry) map.set(key, (entry = { own: null, from: [] }));
      return entry;
    };
    for (const r of rules) {
      if (r.matchType !== 'NAME') continue;
      if (r.name && r.name.toLowerCase() !== r.matchKey.toLowerCase()) at(r.name).from.push(r);
      else at(r.matchKey).own = r;
    }
    return map;
  }, [rules]);

  const subsOf = useMemo(() => {
    const map = new Map<string, FullSubName[]>();
    for (const s of data?.subNames ?? []) {
      const k = s.parent.toLowerCase();
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return map;
  }, [data]);

  /** Every drop target by its key: `n:<name>` / `s:<id>`. */
  const ends = useMemo(() => {
    const map = new Map<string, End>();
    for (const n of data?.names.names ?? []) {
      const subs = subsOf.get(n.name.toLowerCase()) ?? [];
      map.set(`n:${n.name}`, {
        kind: 'name',
        name: n.name,
        wrapper: subs.length > 0,
        unclarified: !!n.unclarified,
      });
    }
    for (const s of data?.subNames ?? [])
      map.set(`s:${s.id}`, {
        kind: 'sub',
        id: s.id,
        name: s.name,
        parent: s.parent,
        category: s.category,
      });
    return map;
  }, [data, subsOf]);

  const refuse = (item: DragItem, key: string): string | null => {
    const to = ends.get(key);
    if (!to) return 'Drop it on a name';
    if (item.kind === 'end') return refusal(item.end, to);
    if (to.kind === 'name' && to.unclarified) return 'Drop it on a real name';
    if (to.kind === 'name' && to.wrapper) return `${to.name} has sub-names — drop it on one of them`;
    if (to.name.toLowerCase() === item.owner.toLowerCase()) return 'It is already there';
    return null;
  };

  const moveDescription = (key: string, to: End, replace: boolean) => {
    edit.mutate(
      {
        method: 'PUT',
        path: '/names/description-rule',
        body: {
          matchType: 'DESCRIPTION',
          matchKey: key,
          name: to.kind === 'sub' ? to.parent : to.name,
          category: null,
          ...(to.kind === 'sub' ? { subNameId: to.id } : {}),
          ...(replace ? { replace: true } : {}),
        },
      },
      {
        onSuccess: () => setMoving(null),
        onError: (err) =>
          setMoving((m) =>
            m && err instanceof NamesApiError && err.status === 409
              ? { ...m, conflict: err.message }
              : m,
          ),
      },
    );
  };

  const { drag, start, ghost } = usePointerDrag<DragItem>({
    refuse,
    onDrop: (item, key) => {
      const to = ends.get(key)!;
      if (item.kind === 'end') {
        merge.reset();
        setMerging({ from: item.end, to });
      } else {
        edit.reset();
        setMoving({ key: item.key, description: item.description, to, conflict: null });
      }
    },
  });

  const q = search.trim().toLowerCase();
  const names = useMemo(
    () =>
      (data?.names.names ?? []).filter(
        (n) =>
          !q ||
          n.name.toLowerCase().includes(q) ||
          n.category.toLowerCase().includes(q) ||
          n.descriptions.some((d) => d.description.toLowerCase().includes(q)) ||
          (subsOf.get(n.name.toLowerCase()) ?? []).some((s) =>
            s.name.toLowerCase().includes(q),
          ),
      ),
    [data, q, subsOf],
  );

  if (isLoading)
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading names…</p>;
  if (error)
    return (
      <p className="py-8 text-center text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load the names'}
      </p>
    );
  if (!data) return null;
  if (!names.length)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {q ? 'No name matches.' : 'No names yet.'}
      </p>
    );

  const toggle = (k: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const overKey = drag?.over ?? null;
  const hintFor = (key: string): string | null =>
    drag && overKey === key ? refuse(drag.item, key) : null;
  const groupLabel = (key: string | null) =>
    key ? (data.names.groups.find((g) => g.key === key)?.label ?? null) : null;
  const defaultsOf = (match: (a: NameAnswer) => boolean) =>
    data.columns.flatMap((c) => {
      const a = data.nameAnswers.find((x) => x.columnId === c.id && match(x));
      return a?.value ? [`${c.name}: ${a.value}`] : [];
    });
  const descDrag = (owner: string) => (d: NameDescription) =>
    start(
      { kind: 'desc', key: d.key, description: d.description, owner },
      `“${d.description}”`,
    );

  return (
    <div className="flex min-w-0 flex-col">
      {ghost}
      {canEdit && (
        <p className="border-b px-4 py-2 text-xs text-muted-foreground">
          Drag a name (by its handle) onto another to merge them; open a name to set its group,
          profile, split rules, custom fields and descriptions. QuickBooks follows.
        </p>
      )}
      <ul className="divide-y">
        {names.map((n) => {
          const key = `n:${n.name}`;
          const end = ends.get(key)!;
          const subs = subsOf.get(n.name.toLowerCase()) ?? [];
          const nameRules = rulesOf.get(n.name.toLowerCase());
          const isOpen = open.has(key);
          const pick = pickLabel(data, pickValue(data, n.agencyIds, false));
          const defaults = defaultsOf((a) => a.subNameId === null && a.name === n.name);
          return (
            <li key={key}>
              <Line
                dropKey={key}
                title={n.name}
                rows={n.rows}
                total={n.total}
                over={overKey === key}
                hint={hintFor(key)}
                handle={
                  canEdit && !refusalAsSource(end)
                    ? start({ kind: 'end', end }, n.name)
                    : null
                }
                open={n.unclarified ? undefined : isOpen}
                onToggle={() => toggle(key)}
                chips={[
                  subs.length ? `${subs.length} sub-names` : n.category,
                  groupLabel(n.group),
                  pick && `Split: ${pick}`,
                  ...defaults,
                  !subs.length && n.descriptions.length
                    ? `${n.descriptions.length} description${n.descriptions.length === 1 ? '' : 's'}`
                    : null,
                ]}
                extra={
                  nameRules && (
                    <RuleChips
                      own={nameRules.own}
                      from={nameRules.from}
                      canEdit={canEdit}
                      onRemove={onRemoveRule}
                    />
                  )
                }
                actions={
                  canEdit && !n.unclarified ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title={subs.length ? 'Rename' : 'Rename or change its category'}
                      onClick={() =>
                        onEdit({
                          matchKey: n.name,
                          name: n.name,
                          category: nameRules?.own?.category ?? null,
                        })
                      }
                    >
                      <Pencil size={14} />
                    </Button>
                  ) : null
                }
              />
              {isOpen && (
                <NameEditor
                  companyId={companyId}
                  target={{ kind: 'name', name: n, wrapper: subs.length > 0 }}
                  data={data}
                  canEdit={canEdit}
                  dragDescription={descDrag(n.name)}
                />
              )}
              {subs.length > 0 && (
                <ul className="border-t border-dashed bg-muted/30">
                  {subs.map((s) => {
                    const sKey = `s:${s.id}`;
                    const sEnd = ends.get(sKey)!;
                    const sOpen = open.has(sKey);
                    const sPick = pickLabel(data, pickValue(data, s.agencyIds, !s.ownAgencies));
                    const sDescs = data.names.subDescriptions[s.id] ?? [];
                    return (
                      <li key={sKey} className="pl-6">
                        <Line
                          dropKey={sKey}
                          title={s.name}
                          rows={s.rows}
                          total={s.total}
                          over={overKey === sKey}
                          hint={hintFor(sKey)}
                          handle={canEdit ? start({ kind: 'end', end: sEnd }, s.name) : null}
                          open={sOpen}
                          onToggle={() => toggle(sKey)}
                          chips={[
                            s.category,
                            groupLabel(s.group),
                            sPick && `Split: ${sPick}`,
                            ...defaultsOf((a) => a.subNameId === s.id),
                            sDescs.length
                              ? `${sDescs.length} description${sDescs.length === 1 ? '' : 's'}`
                              : null,
                          ]}
                        />
                        {sOpen && (
                          <NameEditor
                            companyId={companyId}
                            target={{
                              kind: 'sub',
                              sub: s,
                              descriptions: sDescs,
                              contains: data.names.subContains[s.id] ?? [],
                            }}
                            data={data}
                            canEdit={canEdit}
                            dragDescription={descDrag(s.name)}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={!!merging} onOpenChange={(o) => !o && !merge.isPending && setMerging(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Merge {merging ? label(merging.from) : ''} into {merging ? label(merging.to) : ''}?
            </DialogTitle>
            <DialogDescription>
              {merging && mergeText(merging.from, merging.to).join(' ')}
            </DialogDescription>
          </DialogHeader>
          {merge.error instanceof Error && (
            <p className="text-sm text-destructive">{merge.error.message}</p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={merge.isPending} onClick={() => setMerging(null)}>
              Cancel
            </Button>
            <Button
              disabled={merge.isPending}
              onClick={() =>
                merging &&
                merge.mutate(bodyOf(merging.from, merging.to), {
                  onSuccess: () => {
                    setMerging(null);
                    void qc.invalidateQueries({ queryKey: namesFullKey(companyId) });
                  },
                })
              }
            >
              {merge.isPending && <Loader2 className="size-4 animate-spin" />}
              {merge.isPending ? 'Merging…' : 'Merge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!moving} onOpenChange={(o) => !o && !edit.isPending && setMoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move this description to {moving ? label(moving.to) : ''}?</DialogTitle>
            <DialogDescription>
              {moving &&
                `Every transaction with “${moving.description}” takes the name ${label(moving.to)}, now and on later statements and bank feeds. QuickBooks is updated on the next push.`}
            </DialogDescription>
          </DialogHeader>
          {moving?.conflict && (
            <p className="text-sm text-amber-700">
              {moving.conflict}
            </p>
          )}
          {edit.error instanceof Error && !moving?.conflict && (
            <p className="text-sm text-destructive">{edit.error.message}</p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={edit.isPending} onClick={() => setMoving(null)}>
              Cancel
            </Button>
            <Button
              disabled={edit.isPending}
              onClick={() => moving && moveDescription(moving.key, moving.to, !!moving.conflict)}
            >
              {edit.isPending && <Loader2 className="size-4 animate-spin" />}
              {moving?.conflict ? 'Take it away and move' : 'Move'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A name that can never be dragged (the server refuses it as a source). */
function refusalAsSource(e: End): boolean {
  return e.kind === 'name' && e.unclarified;
}

/** The NAME rules of a name: its own one, and payees renamed to it. */
function RuleChips({
  own,
  from,
  canEdit,
  onRemove,
}: {
  own: CustomerNameRule | null;
  from: CustomerNameRule[];
  canEdit: boolean;
  onRemove: (r: CustomerNameRule) => void;
}) {
  const chip = (r: CustomerNameRule, text: ReactNode, title: string) => (
    <span
      key={r.id}
      title={title}
      className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
    >
      <span className="truncate">{text}</span>
      {canEdit && (
        <button
          type="button"
          title="Remove this rule"
          className="shrink-0 hover:text-destructive"
          onClick={() => onRemove(r)}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
  return (
    <>
      {own?.category &&
        chip(own, `rule: ${own.category}`, 'The customer’s rule puts this name in this category')}
      {from.map((r) =>
        chip(
          r,
          <>
            {r.matchKey} <ArrowRight className="inline size-3" />
          </>,
          `“${r.matchKey}” is renamed to this name${r.category ? ` (${r.category})` : ''}`,
        ),
      )}
    </>
  );
}

/** One row: handle, name (+ chevron), chips wrapping under it, amount and rows, actions. */
function Line({
  dropKey,
  title,
  rows,
  total,
  over,
  hint,
  handle,
  open,
  onToggle,
  chips,
  extra,
  actions,
}: {
  dropKey: string;
  title: string;
  rows: number;
  total: number;
  over: boolean;
  hint: string | null;
  handle: ((e: ReactPointerEvent) => void) | null;
  open?: boolean;
  onToggle: () => void;
  chips: Array<string | null | false>;
  extra?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      data-drop-key={dropKey}
      className={cn(
        'flex min-w-0 items-start gap-2 px-4 py-2 text-sm transition-colors',
        over && !hint && 'bg-teal-50 ring-1 ring-inset ring-teal-400',
        over && hint && 'bg-muted',
      )}
    >
      {handle ? (
        <span
          onPointerDown={handle}
          title="Drag onto another name to merge"
          className="mt-0.5 shrink-0 cursor-grab touch-none select-none text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="size-4" />
        </span>
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {open === undefined ? (
          <span className="min-w-0 truncate font-medium">{title}</span>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            className="flex min-w-0 items-center gap-1 text-left font-medium"
            title={open ? 'Close its settings' : 'Open its settings'}
          >
            {open ? (
              <ChevronDown className="size-3.5 shrink-0" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{title}</span>
          </button>
        )}
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {hint ? (
            <span className="text-foreground">{hint}</span>
          ) : (
            <>
              {chips
                .filter((c): c is string => !!c)
                .map((c, i) => (
                  <span key={i} className="min-w-0 break-words">
                    {c}
                  </span>
                ))}
              {extra}
            </>
          )}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="tabular-nums">{money(total)}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {rows} row{rows === 1 ? '' : 's'}
        </span>
      </div>
      {actions !== undefined && <span className="w-8 shrink-0">{actions}</span>}
    </div>
  );
}
