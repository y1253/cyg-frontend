import { useMemo, useState } from 'react';
import { ArrowRight, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchInput } from '@/components/ui/SearchInput';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCustomerRules } from '@/hooks/useCustomerRules';
import {
  useChangeCustomerRule,
  type CustomerRuleChange,
} from '@/hooks/useChangeCustomerRule';
import type {
  CustomerCategory,
  CustomerItemRule,
  CustomerNameRule,
} from '@/api/customerRules';
import { cn } from '@/lib/utils';

type Section = 'descriptions' | 'names' | 'items';

const SECTIONS: { key: Section; label: string; hint: string }[] = [
  {
    key: 'descriptions',
    label: 'Descriptions',
    hint: 'A bank description the customer gave a name or category.',
  },
  {
    key: 'names',
    label: 'Payee names',
    hint: 'A payee the customer renamed or put in a category.',
  },
  {
    key: 'items',
    label: 'Receipt items',
    hint: 'An item on a receipt that always goes in one category.',
  },
];

const TYPE_LABELS: Record<string, string> = {
  INCOME: 'Income',
  EXPENSE: 'Expenses',
  ASSET: 'Assets',
  LIABILITY: 'Liabilities',
  EQUITY: 'Equity',
};

/** The `Select` value for "leave the category as it is" (base-ui wants a string). */
const KEEP = '__keep__';

/** What the edit dialog is working on. */
type Draft = {
  section: Section;
  mode: 'add' | 'edit';
  key: string;
  name: string;
  category: string;
};

type Removing =
  | { section: 'descriptions' | 'names'; rule: CustomerNameRule }
  | { section: 'items'; rule: CustomerItemRule };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function matches(q: string, ...values: (string | null)[]): boolean {
  if (!q) return true;
  return values.some((v) => v?.toLowerCase().includes(q));
}

/**
 * The customer's own bookkeeping rules for this company, as set on cygfinance.com: what
 * a bank description, a payee or a receipt item is renamed to and filed under. Everybody
 * who can open the company sees them; a manager can change or remove one, which re-files
 * the customer's existing rows at once (the customer API does that, not this page).
 */
export function CustomerRulesSection({
  companyId,
  canEdit,
}: {
  companyId: number;
  canEdit: boolean;
}) {
  const { data, isLoading, error } = useCustomerRules(companyId);
  const [section, setSection] = useState<Section>('descriptions');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<Removing | null>(null);
  const change = useChangeCustomerRule(companyId);

  const q = search.trim().toLowerCase();
  const descriptions = useMemo(
    () =>
      (data?.descriptions ?? []).filter((r) =>
        matches(q, r.matchKey, r.example, r.name, r.effectiveCategory),
      ),
    [data, q],
  );
  const names = useMemo(
    () =>
      (data?.names ?? []).filter((r) =>
        matches(q, r.matchKey, r.name, r.effectiveCategory),
      ),
    [data, q],
  );
  const items = useMemo(
    () => (data?.items ?? []).filter((r) => matches(q, r.itemKey, r.category)),
    [data, q],
  );
  const counts: Record<Section, number> = {
    descriptions: data?.descriptions.length ?? 0,
    names: data?.names.length ?? 0,
    items: data?.items.length ?? 0,
  };

  const openDraft = (d: Draft) => {
    change.reset();
    setDraft(d);
  };

  const askRemove = (r: Removing) => {
    change.reset();
    setRemoving(r);
  };

  const editName = (section: 'descriptions' | 'names', r: CustomerNameRule) =>
    openDraft({
      section,
      mode: 'edit',
      key: r.matchKey,
      name: r.name ?? '',
      category: r.category ?? KEEP,
    });

  const save = () => {
    if (!draft) return;
    const key = draft.key.trim();
    const category = draft.category === KEEP ? null : draft.category;
    const c: CustomerRuleChange =
      draft.section === 'items'
        ? { action: 'save-item', itemKey: key, category: category ?? '' }
        : {
            action: 'save-name',
            matchType: draft.section === 'names' ? 'NAME' : 'DESCRIPTION',
            matchKey: key,
            name: draft.name.trim() || null,
            category,
          };
    change.mutate(c, { onSuccess: () => setDraft(null) });
  };

  const remove = () => {
    if (!removing) return;
    const c: CustomerRuleChange =
      removing.section === 'items'
        ? { action: 'remove-item', itemKey: removing.rule.itemKey }
        : {
            action: 'remove-name',
            matchType: removing.rule.matchType,
            matchKey: removing.rule.matchKey,
          };
    change.mutate(c, { onSuccess: () => setRemoving(null) });
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading rules…</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-destructive py-8 text-center">
        {error instanceof Error ? error.message : 'Failed to load the customer rules'}
      </p>
    );
  }
  if (!data || data.noCustomer) {
    return (
      <Card className="max-w-3xl">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          This company has no customer account on cygfinance.com, so it has no rules.
        </CardContent>
      </Card>
    );
  }

  const hint = SECTIONS.find((s) => s.key === section)!.hint;

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Customer rules</h2>
            {!canEdit && (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <Eye size={12} /> View only
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            How this customer's bookkeeping is filed on cygfinance.com.
            {canEdit && ' A change re-files their existing rows right away.'}
          </p>
        </div>
        <div className="sm:w-64 shrink-0">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search rules"
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* ── Section switcher ── */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-full sm:w-fit overflow-x-auto [scrollbar-width:none]">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              section === s.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {s.label}
            <span
              className={cn(
                'rounded-full px-1.5 text-xs tabular-nums',
                section === s.key ? 'bg-teal-100 text-teal-800' : 'bg-background/70',
              )}
            >
              {counts[s.key]}
            </span>
          </button>
        ))}
      </div>

      <Card className="py-0 gap-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <p className="text-xs text-muted-foreground">{hint}</p>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                openDraft({ section, mode: 'add', key: '', name: '', category: KEEP })
              }
            >
              <Plus size={14} /> Add rule
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          {section === 'descriptions' && (
            <NameRulesTable
              rules={descriptions}
              kind="descriptions"
              canEdit={canEdit}
              searching={!!q}
              onEdit={(r) => editName('descriptions', r)}
              onRemove={(r) => askRemove({ section: 'descriptions', rule: r })}
            />
          )}
          {section === 'names' && (
            <NameRulesTable
              rules={names}
              kind="names"
              canEdit={canEdit}
              searching={!!q}
              onEdit={(r) => editName('names', r)}
              onRemove={(r) => askRemove({ section: 'names', rule: r })}
            />
          )}
          {section === 'items' && (
            <ItemRulesTable
              rules={items}
              canEdit={canEdit}
              searching={!!q}
              onEdit={(r) =>
                openDraft({
                  section: 'items',
                  mode: 'edit',
                  key: r.itemKey,
                  name: '',
                  category: r.category,
                })
              }
              onRemove={(r) => askRemove({ section: 'items', rule: r })}
            />
          )}
        </div>
      </Card>

      {draft && (
        <RuleDialog
          draft={draft}
          categories={data.categories}
          pending={change.isPending}
          error={change.error instanceof Error ? change.error.message : null}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={save}
        />
      )}

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove this rule?</DialogTitle>
            <DialogDescription>
              {removing?.section === 'items'
                ? `"${removing.rule.itemKey}" goes back to the category the system picks for it.`
                : `The customer's rows for "${removing?.rule.matchKey ?? ''}" go back to how the system read them.`}
            </DialogDescription>
          </DialogHeader>
          {change.error instanceof Error && removing && (
            <p className="text-sm text-destructive">{change.error.message}</p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={change.isPending} onClick={remove}>
              {change.isPending ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Empty({ searching, colSpan }: { searching: boolean; colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">
        {searching ? 'No rules match your search.' : 'The customer has no rules here yet.'}
      </TableCell>
    </TableRow>
  );
}

function CategoryBadge({ value, inherited }: { value: string | null; inherited?: boolean }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge
      variant="secondary"
      className={cn('font-normal', inherited && 'bg-transparent border border-dashed')}
      title={inherited ? "The payee name's category" : undefined}
    >
      {value}
    </Badge>
  );
}

function RowActions({
  onEdit,
  onRemove,
}: {
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button size="icon-sm" variant="ghost" title="Edit" onClick={onEdit}>
        <Pencil size={14} />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        title="Remove"
        className="text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
}

function NameRulesTable({
  rules,
  kind,
  canEdit,
  searching,
  onEdit,
  onRemove,
}: {
  rules: CustomerNameRule[];
  kind: 'descriptions' | 'names';
  canEdit: boolean;
  searching: boolean;
  onEdit: (r: CustomerNameRule) => void;
  onRemove: (r: CustomerNameRule) => void;
}) {
  const cols = canEdit ? 6 : 5;
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="pl-4">
            {kind === 'descriptions' ? 'When the description is' : 'Payee'}
          </TableHead>
          <TableHead>{kind === 'descriptions' ? 'Name' : 'Renamed to'}</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Rows</TableHead>
          <TableHead>Updated</TableHead>
          {canEdit && <TableHead className="w-20" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.length === 0 && <Empty searching={searching} colSpan={cols} />}
        {rules.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="pl-4 max-w-[22rem]">
              <div className="truncate font-medium" title={r.example ?? r.matchKey}>
                {kind === 'descriptions' ? (r.example ?? r.matchKey) : r.matchKey}
              </div>
              {kind === 'descriptions' && r.example && (
                <div className="truncate text-xs text-muted-foreground" title={r.matchKey}>
                  matches “{r.matchKey}”
                </div>
              )}
            </TableCell>
            <TableCell>
              {r.name ? (
                <span className="inline-flex items-center gap-1.5">
                  <ArrowRight size={12} className="text-teal-600 shrink-0" />
                  {r.name}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              <CategoryBadge
                value={r.effectiveCategory}
                inherited={!r.category && !!r.effectiveCategory}
              />
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {r.rows}
            </TableCell>
            <TableCell className="text-muted-foreground whitespace-nowrap">
              {fmtDate(r.updatedAt)}
            </TableCell>
            {canEdit && (
              <TableCell>
                <RowActions onEdit={() => onEdit(r)} onRemove={() => onRemove(r)} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ItemRulesTable({
  rules,
  canEdit,
  searching,
  onEdit,
  onRemove,
}: {
  rules: CustomerItemRule[];
  canEdit: boolean;
  searching: boolean;
  onEdit: (r: CustomerItemRule) => void;
  onRemove: (r: CustomerItemRule) => void;
}) {
  const cols = canEdit ? 4 : 3;
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="pl-4">Item</TableHead>
          <TableHead>Always filed under</TableHead>
          <TableHead>Updated</TableHead>
          {canEdit && <TableHead className="w-20" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.length === 0 && <Empty searching={searching} colSpan={cols} />}
        {rules.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="pl-4 font-medium capitalize">{r.itemKey}</TableCell>
            <TableCell>
              <CategoryBadge value={r.category} />
            </TableCell>
            <TableCell className="text-muted-foreground whitespace-nowrap">
              {fmtDate(r.updatedAt)}
            </TableCell>
            {canEdit && (
              <TableCell>
                <RowActions onEdit={() => onEdit(r)} onRemove={() => onRemove(r)} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RuleDialog({
  draft,
  categories,
  pending,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Draft;
  categories: CustomerCategory[];
  pending: boolean;
  error: string | null;
  onChange: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const isItem = draft.section === 'items';
  const keyLabel =
    draft.section === 'descriptions'
      ? 'When the bank description is'
      : draft.section === 'names'
        ? 'Payee name'
        : 'Receipt item';

  const groups = useMemo(() => {
    const byType = new Map<string, CustomerCategory[]>();
    for (const c of categories) {
      byType.set(c.type, [...(byType.get(c.type) ?? []), c]);
    }
    return [...byType.entries()];
  }, [categories]);
  const selectLabels = useMemo(
    () => ({
      [KEEP]: 'Leave as it is',
      ...Object.fromEntries(categories.map((c) => [c.name, c.name])),
    }),
    [categories],
  );

  const hasCategory = draft.category !== KEEP;
  const canSave =
    !!draft.key.trim() &&
    (isItem ? hasCategory : !!draft.name.trim() || hasCategory);

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{draft.mode === 'add' ? 'Add a rule' : 'Edit rule'}</DialogTitle>
          <DialogDescription>
            Saved for this customer's books. Their existing rows move right away, and every
            statement or receipt they upload later follows it.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave && !pending) onSave();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-key">{keyLabel}</Label>
            <Input
              id="rule-key"
              value={draft.key}
              readOnly={draft.mode === 'edit'}
              className={cn(draft.mode === 'edit' && 'bg-muted text-muted-foreground')}
              placeholder={isItem ? 'e.g. Pampers' : 'e.g. POS WALMART TORONTO'}
              onChange={(e) => onChange({ ...draft, key: e.target.value })}
            />
          </div>

          {!isItem && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rule-name">
                {draft.section === 'names' ? 'Rename to' : 'Name'}{' '}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="rule-name"
                value={draft.name}
                placeholder="Leave empty to keep the name"
                onChange={(e) => onChange({ ...draft, name: e.target.value })}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Select
              items={selectLabels}
              value={isItem && draft.category === KEEP ? null : draft.category}
              onValueChange={(v) => onChange({ ...draft, category: v ?? KEEP })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {!isItem && <SelectItem value={KEEP}>Leave as it is</SelectItem>}
                {groups.map(([type, list]) => (
                  <SelectGroup key={type}>
                    <SelectLabel>{TYPE_LABELS[type] ?? type}</SelectLabel>
                    {list.map((c) => (
                      <SelectItem key={c.name} value={c.name}>
                        {c.name}
                        {c.custom && (
                          <span className="ml-1 text-xs text-muted-foreground">(theirs)</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave || pending}>
              {pending ? 'Saving…' : 'Save rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
