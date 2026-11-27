import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { ArrowRight, GripVertical, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CustomerItemRule, CustomerProduct } from '@/api/customerRules';
import { useChangeCustomerRule } from '@/hooks/useChangeCustomerRule';
import { cn } from '@/lib/utils';

/** The drag payload type — its own, so a name can never be dropped on an item. */
const MIME = 'application/x-cyg-staff-item';

const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const keyOf = (s: string) => s.trim().toLowerCase();

/**
 * 2026-11-27 (user: "the receipt items should be draggable"): every item on the customer's
 * receipts. A manager drags one onto another to MERGE them — every receipt line of the
 * dragged item takes the target's name and category, and later receipts follow (the customer
 * API's `mergeItems`). The pencil sets an item's category (a rule); the chips show its rule and
 * the items merged into it (× removes that rule). Rules with no receipt lines are listed after.
 * Stacked rows — never wider than the card.
 */
export function ReceiptItemsPanel({
  companyId,
  canEdit,
  search,
  products,
  rules,
  onEdit,
  onRemove,
}: {
  companyId: number;
  canEdit: boolean;
  search: string;
  products: CustomerProduct[];
  rules: CustomerItemRule[];
  onEdit: (itemKey: string, category: string) => void;
  onRemove: (rule: CustomerItemRule) => void;
}) {
  const change = useChangeCustomerRule(companyId);
  const [dragging, setDragging] = useState<CustomerProduct | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [merging, setMerging] = useState<{ from: CustomerProduct; to: CustomerProduct } | null>(
    null,
  );

  const q = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      products.filter(
        (p) => !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
      ),
    [products, q],
  );
  const ruleOf = useMemo(() => new Map(rules.map((r) => [r.itemKey, r])), [rules]);
  // Items merged into a product (their rule renames them to it).
  const mergedInto = useMemo(() => {
    const map = new Map<string, CustomerItemRule[]>();
    for (const r of rules) {
      if (!r.name) continue;
      const k = keyOf(r.name);
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return map;
  }, [rules]);
  // Rules of items with no receipt lines that are not merges either.
  const orphans = useMemo(() => {
    const known = new Set(products.map((p) => p.itemKey));
    return rules.filter(
      (r) => !r.name && !known.has(r.itemKey) && (!q || r.itemKey.includes(q)),
    );
  }, [products, rules, q]);

  const dragProps = (p: CustomerProduct) =>
    canEdit
      ? {
          draggable: true,
          onDragStart: (ev: DragEvent) => {
            ev.dataTransfer.setData(MIME, p.itemKey);
            ev.dataTransfer.effectAllowed = 'move';
            setDragging(p);
          },
          onDragEnd: () => {
            setDragging(null);
            setOver(null);
          },
          onDragOver: (ev: DragEvent) => {
            if (!dragging || !ev.dataTransfer.types.includes(MIME)) return;
            setOver(p.itemKey);
            if (dragging.itemKey === p.itemKey) {
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
            setOver(null);
            if (dragging && dragging.itemKey !== p.itemKey) {
              change.reset();
              setMerging({ from: dragging, to: p });
            }
            setDragging(null);
          },
        }
      : {};

  if (!shown.length && !orphans.length)
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {q ? 'No item matches.' : 'No receipt items yet.'}
      </p>
    );

  return (
    <div className="flex min-w-0 flex-col">
      {canEdit && shown.length > 1 && (
        <p className="border-b px-4 py-2 text-xs text-muted-foreground">
          Drag an item onto another to merge them into one product.
        </p>
      )}
      <ul className="divide-y">
        {shown.map((p) => {
          const rule = ruleOf.get(p.itemKey);
          const merged = mergedInto.get(keyOf(p.name)) ?? [];
          return (
            <li
              key={p.itemKey}
              {...dragProps(p)}
              className={cn(
                'flex min-w-0 items-start gap-2 px-4 py-2 text-sm transition-colors',
                over === p.itemKey &&
                  dragging?.itemKey !== p.itemKey &&
                  'bg-teal-50 ring-1 ring-inset ring-teal-400',
              )}
            >
              {canEdit ? (
                <GripVertical className="mt-0.5 size-4 shrink-0 cursor-grab text-muted-foreground" />
              ) : (
                <span className="size-4 shrink-0" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="min-w-0 truncate font-medium">{p.name}</span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="max-w-full truncate font-normal">
                    {p.category}
                  </Badge>
                  {rule && !rule.name && (
                    <Chip
                      text="rule"
                      title="The customer’s rule puts this item in this category"
                      onRemove={canEdit ? () => onRemove(rule) : undefined}
                    />
                  )}
                  {merged.map((r) => (
                    <Chip
                      key={r.id}
                      text={
                        <>
                          {r.itemKey} <ArrowRight className="inline size-3" />
                        </>
                      }
                      title={`“${r.itemKey}” was merged into this item`}
                      onRemove={canEdit ? () => onRemove(r) : undefined}
                    />
                  ))}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="tabular-nums">{money(p.total)}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {p.rows} line{p.rows === 1 ? '' : 's'}
                </span>
              </div>
              {canEdit && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title="Change its category"
                  draggable={false}
                  onClick={() => onEdit(p.itemKey, rule?.category ?? p.category)}
                >
                  <Pencil size={14} />
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {orphans.length > 0 && (
        <>
          <p className="border-t px-4 py-2 text-xs font-medium text-muted-foreground">
            Rules for items with no receipt lines yet
          </p>
          <ul className="divide-y">
            {orphans.map((r) => (
              <li key={r.id} className="flex min-w-0 items-start gap-2 px-4 py-2 text-sm">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="min-w-0 truncate font-medium capitalize">{r.itemKey}</span>
                  <span className="text-xs text-muted-foreground">
                    always filed under {r.category}
                  </span>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Edit"
                      onClick={() => onEdit(r.itemKey, r.category)}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Remove"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(r)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog
        open={!!merging}
        onOpenChange={(o) => !o && !change.isPending && setMerging(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Merge {merging?.from.name} into {merging?.to.name}?
            </DialogTitle>
            <DialogDescription>
              {merging &&
                `Every receipt line of ${merging.from.name} becomes ${merging.to.name} and goes in ${merging.to.category}; later receipts with ${merging.from.name} follow. If this company sends bank transactions to QuickBooks, they are updated there too.`}
            </DialogDescription>
          </DialogHeader>
          {change.error instanceof Error && (
            <p className="text-sm text-destructive">{change.error.message}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={change.isPending}
              onClick={() => setMerging(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={change.isPending}
              onClick={() =>
                merging &&
                change.mutate(
                  {
                    action: 'merge-items',
                    from: merging.from.itemKey,
                    into: merging.to.itemKey,
                  },
                  { onSuccess: () => setMerging(null) },
                )
              }
            >
              {change.isPending && <Loader2 className="size-4 animate-spin" />}
              {change.isPending ? 'Merging…' : 'Merge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Chip({
  text,
  title,
  onRemove,
}: {
  text: ReactNode;
  title: string;
  onRemove?: () => void;
}) {
  return (
    <span
      title={title}
      className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
    >
      <span className="truncate">{text}</span>
      {onRemove && (
        <button
          type="button"
          draggable={false}
          title="Remove this rule"
          className="shrink-0 hover:text-destructive"
          onClick={onRemove}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}
