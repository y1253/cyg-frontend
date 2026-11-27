import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { BankCell, BankColumn } from '@/api/bankTransactions';
import { useSaveBankAnswer } from '@/hooks/useBankTransactions';
import { answerProblem, typedValue } from '@/lib/custom-columns';
import { cn } from '@/lib/utils';

const NONE = '__none__';

/**
 * step11 part 4 (2026-11-27): one cell of a customer's own column (a QuickBooks class,
 * location, customer or custom field, or a column they made) on the Bank transactions tab.
 * A manager edits it in place — a DROPDOWN picks an option, the others type (the column's
 * rules enforced while typing, `answerProblem` before sending); the customer API checks it
 * again and sends a QuickBooks-linked one to QuickBooks. Read-only for everyone else.
 */
export function BankCustomCell({
  companyId,
  column,
  rowId,
  cell,
  canEdit,
}: {
  companyId: number;
  column: BankColumn;
  rowId: number;
  cell: BankCell | undefined;
  canEdit: boolean;
}) {
  const save = useSaveBankAnswer(companyId);
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const error = problem ?? (save.error instanceof Error ? save.error.message : null);
  const stored = cell?.value ?? '';

  if (!canEdit) {
    return (
      <span className={cn('block truncate text-sm', !stored && 'text-muted-foreground/60')}>
        {stored || '—'}
      </span>
    );
  }

  if (column.type === 'DROPDOWN') {
    const value =
      cell?.dropDownId != null && column.options.some((o) => o.id === cell.dropDownId)
        ? String(cell.dropDownId)
        : null;
    const items = {
      [NONE]: '—',
      ...Object.fromEntries(column.options.map((o) => [String(o.id), o.label])),
    };
    return (
      <span className="flex min-w-0 flex-col gap-0.5">
        <Select
          items={items}
          value={value}
          onValueChange={(v) => {
            const id = !v || v === NONE ? null : Number(v);
            save.mutate({
              id: rowId,
              columnId: column.id,
              value: null,
              dropDownId: id,
              label: column.options.find((o) => o.id === id)?.label ?? null,
            });
          }}
        >
          <SelectTrigger
            size="sm"
            className={cn('h-7 w-full min-w-0 text-xs', !value && 'text-muted-foreground')}
          >
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={NONE}>—</SelectItem>
            {[...column.options]
              .sort((a, b) => a.label.localeCompare(b.label))
              .map((o) => (
                <SelectItem key={o.id} value={String(o.id)}>
                  {o.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {error && <span className="text-[11px] text-destructive">{error}</span>}
      </span>
    );
  }

  const commit = () => {
    if (draft === null) return;
    const why = answerProblem(column, draft);
    if (why) {
      setProblem(why);
      return;
    }
    setProblem(null);
    const next = draft.trim();
    setDraft(null);
    if (next === stored) return;
    save.mutate({
      id: rowId,
      columnId: column.id,
      value: next || null,
      dropDownId: null,
      label: null,
    });
  };

  if (draft === null) {
    return (
      <span className="flex min-w-0 flex-col gap-0.5">
        <button
          type="button"
          onClick={() => {
            setDraft(stored);
            setProblem(null);
            save.reset();
          }}
          title="Click to edit"
          className={cn(
            'block w-full min-w-0 truncate rounded px-1 py-0.5 text-left text-sm hover:bg-black/5',
            !stored && 'text-muted-foreground/60',
          )}
        >
          {stored || '—'}
        </button>
        {error && <span className="text-[11px] text-destructive">{error}</span>}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <Input
        autoFocus
        value={draft}
        className="h-7 text-sm"
        inputMode={column.type === 'NUMBER' ? 'decimal' : undefined}
        onChange={(e) => {
          setDraft(typedValue(column, e.target.value));
          setProblem(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(null);
            setProblem(null);
          }
        }}
      />
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </span>
  );
}
