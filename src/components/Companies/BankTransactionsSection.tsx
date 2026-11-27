import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Pencil } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchInput } from '@/components/ui/SearchInput';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { BankCategory, BankTransactionRow } from '@/api/bankTransactions';
import { BankCustomCell } from './BankCustomCell';
import { QBO_KIND_LABELS } from '@/lib/custom-columns';
import {
  useBankColumns,
  useBankCategories,
  useBankTransactions,
  useEditBankTransaction,
} from '@/hooks/useBankTransactions';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  INCOME: 'Income',
  EXPENSE: 'Expenses',
  ASSET: 'Assets',
  LIABILITY: 'Liabilities',
  EQUITY: 'Equity',
};

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtDay = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString() : '—';

function QboCell({ row }: { row: BankTransactionRow }) {
  if (!row.qbo) return null;
  if (row.qbo.error)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive" title={row.qbo.error}>
        <AlertTriangle className="size-3.5" /> Failed
      </span>
    );
  if (row.qbo.id)
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-[#2CA01C]"
        title={row.qbo.syncedAt ? `Sent ${new Date(row.qbo.syncedAt).toLocaleString()}` : undefined}
      >
        <CheckCircle2 className="size-3.5" /> Sent
      </span>
    );
  return <span className="text-xs text-muted-foreground">—</span>;
}

function EditDialog({
  companyId,
  row,
  categories,
  onClose,
}: {
  companyId: number;
  row: BankTransactionRow;
  categories: BankCategory[];
  onClose: () => void;
}) {
  const edit = useEditBankTransaction(companyId);
  const [name, setName] = useState(row.name ?? '');
  const [category, setCategory] = useState(row.category);
  const [scope, setScope] = useState<'ALWAYS' | 'ONCE'>('ALWAYS');
  const groups = useMemo(() => {
    const byType = new Map<string, BankCategory[]>();
    for (const c of categories) byType.set(c.type, [...(byType.get(c.type) ?? []), c]);
    return [...byType.entries()];
  }, [categories]);
  const labels = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.name, c.name])),
    [categories],
  );
  const nameChanged = name.trim() !== '' && name.trim() !== (row.name ?? '');
  const categoryChanged = category !== row.category;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit transaction</DialogTitle>
          <DialogDescription>
            Saved through the customer&rsquo;s books on cygfinance.com — a category is the
            name&rsquo;s category for all its transactions. When QuickBooks is on, the change is
            updated there too.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nameChanged && !categoryChanged) return onClose();
            edit.mutate(
              {
                id: row.id,
                ...(nameChanged ? { name: name.trim() } : {}),
                ...(categoryChanged ? { category } : {}),
                scope,
              },
              { onSuccess: onClose },
            );
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="txn-name">Name</Label>
            <Input id="txn-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {nameChanged && (
            <div className="flex flex-col gap-1.5">
              <Label>The new name is for</Label>
              <div className="flex gap-2">
                {(['ALWAYS', 'ONCE'] as const).map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant={scope === s ? 'default' : 'outline'}
                    onClick={() => setScope(s)}
                  >
                    {s === 'ALWAYS' ? 'Every transaction like this' : 'Only this transaction'}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Select items={labels} value={category} onValueChange={(v) => v && setCategory(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {groups.map(([type, list]) => (
                  <SelectGroup key={type}>
                    <SelectLabel>{TYPE_LABELS[type] ?? type}</SelectLabel>
                    {list.map((c) => (
                      <SelectItem key={c.name} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          {edit.isError && (
            <p className="text-sm text-destructive">{(edit.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={edit.isPending}>
              {edit.isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * step11 (2026-11-23): the company's bank transactions as the customer API categorised them
 * (name, category, account; no bank description). Management changes a name / category —
 * through the customer API, which then updates QuickBooks. Splits are shown under their
 * transaction, read-only.
 */
export function BankTransactionsSection({
  companyId,
  canEdit,
}: {
  companyId: number;
  canEdit: boolean;
}) {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const txns = useBankTransactions(companyId, q);
  const categories = useBankCategories(companyId);
  const columns = useBankColumns(companyId).data ?? [];
  const [editing, setEditing] = useState<BankTransactionRow | null>(null);
  const rows = txns.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full max-w-sm">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, category…" />
        </div>
        {txns.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {txns.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : txns.isError ? (
        <p className="text-sm text-destructive">{(txns.error as Error).message}</p>
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">
          {q ? 'Nothing matches.' : 'No bank transactions yet — connect a bank in the Details tab.'}
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                {columns.map((c) => (
                  <TableHead
                    key={c.id}
                    className="min-w-32"
                    title={c.qbo ? `Linked to the ${QBO_KIND_LABELS[c.qbo]}` : undefined}
                  >
                    {c.name}
                    {c.qbo && (
                      <span className="ml-1 rounded bg-[#2CA01C]/10 px-1 text-[10px] font-medium text-[#2CA01C]">
                        QB
                      </span>
                    )}
                  </TableHead>
                ))}
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden md:table-cell">Account</TableHead>
                <TableHead>QuickBooks</TableHead>
                {canEdit && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const split = r.kind === 'split';
                return (
                  <TableRow key={r.key} className={cn(split && 'bg-muted/30 text-muted-foreground')}>
                    <TableCell className="whitespace-nowrap">{split ? '' : fmtDay(r.date)}</TableCell>
                    <TableCell className={cn('whitespace-normal', split && 'pl-8')}>
                      {r.subName ?? r.name ?? (
                        <span className="text-muted-foreground italic">Unclarified name</span>
                      )}
                      {split && <span className="ml-1 text-xs">(split)</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {r.category}
                      </Badge>
                    </TableCell>
                    {columns.map((c) => (
                      <TableCell key={c.id} className="max-w-48">
                        <BankCustomCell
                          companyId={companyId}
                          column={c}
                          rowId={r.id}
                          cell={r.custom?.[c.id]}
                          canEdit={canEdit}
                        />
                      </TableCell>
                    ))}
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        !split && r.amount > 0 && 'text-[#2CA01C]',
                      )}
                    >
                      {money(r.amount)}
                      {r.fullAmount !== null && r.fullAmount !== r.amount && (
                        <div className="text-xs text-muted-foreground">of {money(r.fullAmount)}</div>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {split ? '' : r.account}
                    </TableCell>
                    <TableCell>
                      <QboCell row={r} />
                    </TableCell>
                    {canEdit && (
                      <TableCell className="px-1">
                        {!split && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Edit name / category"
                            disabled={!categories.data}
                            onClick={() => setEditing(r)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {txns.hasNextPage && (
        <Button
          variant="outline"
          className="self-center"
          disabled={txns.isFetchingNextPage}
          onClick={() => void txns.fetchNextPage()}
        >
          {txns.isFetchingNextPage && <Loader2 className="size-4 animate-spin" />}
          Load more
        </Button>
      )}

      {editing && categories.data && (
        <EditDialog
          companyId={companyId}
          row={editing}
          categories={categories.data}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
