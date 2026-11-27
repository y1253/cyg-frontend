import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Loader2,
  Pencil,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCustomerNames, useMergeCustomerNames } from '@/hooks/useCustomerNames';
import type {
  CustomerName,
  CustomerNameRule,
  CustomerNameSub,
  MergeNamesBody,
} from '@/api/customerRules';
import { cn } from '@/lib/utils';

/** The drag payload type (a copy of the customer site's `name-drag.ts` idea; no shared code). */
const MIME = 'application/x-cyg-staff-name';

/** What is being dragged, or dropped on. */
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
  if (from.kind === 'name' && from.wrapper)
    return `${from.name} has sub-names — drag one of its sub-names instead`;
  if (from.kind === 'name' && to.kind === 'name' && from.name === to.name) return 'Same name';
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
  if (to.kind === 'name' && to.wrapper)
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

/**
 * step11 part 2 (2026-11-26): the Rules tab's Names list — every payee name of the
 * customer's book with its sub-names. A manager drags one onto another to merge them, like
 * the customer site's Names tab; the customer API does the merge and moves the QuickBooks
 * payee along (`mergeNamesAndQuickBooks` there).
 * step11 part 4 (2026-11-27): the same list is where a name is edited — the pencil renames it
 * or changes its category (a NAME rule, QuickBooks renamed / updated by the customer API),
 * and the rules that point at it show on its row (× removes one).
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
  const { data, isLoading, error } = useCustomerNames(companyId);
  const merge = useMergeCustomerNames(companyId);
  const [dragging, setDragging] = useState<End | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [merging, setMerging] = useState<{ from: End; to: End } | null>(null);
  const [closed, setClosed] = useState<Set<string>>(new Set());

  // NAME rules by the name they belong to: its own (keyed by it) and the ones renaming
  // another payee to it.
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

  const q = search.trim().toLowerCase();
  const names = useMemo(
    () =>
      (data ?? []).filter(
        (n) =>
          !q ||
          n.name.toLowerCase().includes(q) ||
          n.category.toLowerCase().includes(q) ||
          n.subNames.some((s) => s.name.toLowerCase().includes(q)),
      ),
    [data, q],
  );

  if (isLoading)
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading names…</p>;
  if (error)
    return (
      <p className="py-8 text-center text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load the names'}
      </p>
    );
  if (!names.length)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {q ? 'No name matches.' : 'No names yet.'}
      </p>
    );

  const keyOf = (e: End) => (e.kind === 'name' ? `n:${e.name}` : `s:${e.id}`);

  const dragProps = (e: End) =>
    canEdit && !refusalAsSource(e)
      ? {
          draggable: true,
          onDragStart: (ev: DragEvent) => {
            ev.stopPropagation();
            ev.dataTransfer.setData(MIME, keyOf(e));
            ev.dataTransfer.effectAllowed = 'move';
            setDragging(e);
          },
          onDragEnd: () => {
            setDragging(null);
            setOver(null);
          },
        }
      : {};

  const dropProps = (e: End) =>
    canEdit
      ? {
          onDragOver: (ev: DragEvent) => {
            if (!dragging || !ev.dataTransfer.types.includes(MIME)) return;
            ev.stopPropagation();
            setOver(keyOf(e));
            if (refusal(dragging, e)) {
              ev.dataTransfer.dropEffect = 'none';
              return;
            }
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'move';
          },
          onDragLeave: (ev: DragEvent) => {
            if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setOver(null);
          },
          onDrop: (ev: DragEvent) => {
            ev.preventDefault();
            ev.stopPropagation();
            setOver(null);
            if (dragging && !refusal(dragging, e)) {
              merge.reset();
              setMerging({ from: dragging, to: e });
            }
            setDragging(null);
          },
        }
      : {};

  const hintFor = (e: End): string | null =>
    dragging && over === keyOf(e) ? refusal(dragging, e) : null;

  return (
    <div className="flex flex-col">
      {canEdit && (
        <p className="border-b px-4 py-2 text-xs text-muted-foreground">
          Drag a name or sub-name onto another to merge them. QuickBooks follows when this
          company sends bank transactions there.
        </p>
      )}
      <ul className="divide-y">
        {names.map((n) => {
          const end: End = {
            kind: 'name',
            name: n.name,
            wrapper: n.wrapper,
            unclarified: n.unclarified,
          };
          const open = n.wrapper && !closed.has(n.name);
          const nameRules = rulesOf.get(n.name.toLowerCase());
          return (
            <li key={n.name}>
              <NameLine
                title={n.name}
                category={n.wrapper ? `${n.subNames.length} sub-names` : n.category}
                rows={n.rows}
                total={n.total}
                draggable={canEdit && !refusalAsSource(end)}
                over={over === keyOf(end)}
                hint={hintFor(end)}
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
                      title={n.wrapper ? 'Rename' : 'Rename or change its category'}
                      draggable={false}
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
                toggle={
                  n.wrapper
                    ? {
                        open,
                        onClick: () =>
                          setClosed((s) => {
                            const next = new Set(s);
                            if (next.has(n.name)) next.delete(n.name);
                            else next.add(n.name);
                            return next;
                          }),
                      }
                    : undefined
                }
                {...dragProps(end)}
                {...dropProps(end)}
              />
              {open && (
                <ul className="border-t border-dashed bg-muted/30">
                  {n.subNames.map((s) => (
                    <SubLine
                      key={s.id}
                      parent={n}
                      sub={s}
                      canEdit={canEdit}
                      over={over}
                      keyOf={keyOf}
                      hintFor={hintFor}
                      dragProps={dragProps}
                      dropProps={dropProps}
                    />
                  ))}
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
              Merge {merging ? label(merging.from) : ''} into{' '}
              {merging ? label(merging.to) : ''}?
            </DialogTitle>
            <DialogDescription>
              {merging && mergeText(merging.from, merging.to).join(' ')}
            </DialogDescription>
          </DialogHeader>
          {merge.error instanceof Error && (
            <p className="text-sm text-destructive">{merge.error.message}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={merge.isPending}
              onClick={() => setMerging(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={merge.isPending}
              onClick={() =>
                merging &&
                merge.mutate(bodyOf(merging.from, merging.to), {
                  onSuccess: () => setMerging(null),
                })
              }
            >
              {merge.isPending && <Loader2 className="size-4 animate-spin" />}
              {merge.isPending ? 'Merging…' : 'Merge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A name that can never be dragged (the server refuses it as a source). */
function refusalAsSource(e: End): boolean {
  return e.kind === 'name' && (e.wrapper || e.unclarified);
}

function SubLine({
  parent,
  sub,
  canEdit,
  over,
  keyOf,
  hintFor,
  dragProps,
  dropProps,
}: {
  parent: CustomerName;
  sub: CustomerNameSub;
  canEdit: boolean;
  over: string | null;
  keyOf: (e: End) => string;
  hintFor: (e: End) => string | null;
  dragProps: (e: End) => object;
  dropProps: (e: End) => object;
}) {
  const end: End = {
    kind: 'sub',
    id: sub.id,
    name: sub.name,
    parent: parent.name,
    category: sub.category,
  };
  return (
    <li className="pl-8">
      <NameLine
        title={sub.name}
        category={sub.category}
        rows={sub.rows}
        total={sub.total}
        draggable={canEdit}
        over={over === keyOf(end)}
        hint={hintFor(end)}
        {...dragProps(end)}
        {...dropProps(end)}
      />
    </li>
  );
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
      className="inline-flex max-w-[14rem] items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
    >
      <span className="truncate">{text}</span>
      {canEdit && (
        <button
          type="button"
          draggable={false}
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
    <span className="flex min-w-0 flex-wrap items-center gap-1">
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
    </span>
  );
}

function NameLine({
  title,
  category,
  rows,
  total,
  draggable,
  over,
  hint,
  toggle,
  extra,
  actions,
  ...events
}: {
  title: string;
  category: string;
  rows: number;
  total: number;
  draggable: boolean;
  over: boolean;
  hint: string | null;
  toggle?: { open: boolean; onClick: () => void };
  extra?: ReactNode;
  actions?: ReactNode;
} & Record<string, unknown>) {
  return (
    <div
      {...events}
      className={cn(
        'flex items-center gap-2 px-4 py-2 text-sm transition-colors',
        over && !hint && 'bg-teal-50 ring-1 ring-inset ring-teal-400',
        over && hint && 'bg-muted',
      )}
    >
      {draggable ? (
        <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
      ) : (
        <span className="size-4 shrink-0" />
      )}
      {toggle ? (
        <button
          type="button"
          onClick={toggle.onClick}
          className="flex min-w-0 items-center gap-1 font-medium"
        >
          {toggle.open ? (
            <ChevronDown className="size-3.5 shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{title}</span>
        </button>
      ) : (
        <span className="min-w-0 truncate font-medium">{title}</span>
      )}
      <span className="min-w-0 truncate text-xs text-muted-foreground">
        {hint ?? category}
      </span>
      <span className="min-w-0 flex-1">{!hint && extra}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {rows} row{rows === 1 ? '' : 's'}
      </span>
      <span className="w-24 shrink-0 text-right tabular-nums">{money(total)}</span>
      {actions !== undefined && <span className="w-8 shrink-0">{actions}</span>}
    </div>
  );
}
