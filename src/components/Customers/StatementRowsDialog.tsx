import type { CustomerStatement } from '@/api/customers';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useStatementTransactions } from '@/hooks/useStatementTransactions';
import { cn } from '@/lib/utils';
import { STATUS_STYLE, fmtDay, fmtPeriod, money } from './customer-format';

/**
 * One statement's rows exactly as the AI read them, in statement order. Not the
 * customer's combined ledger: no starting-balance rows and no tax lines (those are
 * computed on read by the customer app).
 */
export function StatementRowsDialog({
  customerId,
  statement,
  onClose,
}: {
  customerId: number;
  statement: CustomerStatement | null;
  onClose: () => void;
}) {
  const { data: rows = [], isLoading, isError } = useStatementTransactions(customerId, statement?.id ?? null);
  const net = rows.reduce((cents, r) => cents + Math.round(r.amount * 100), 0) / 100;

  return (
    <Dialog open={!!statement} onOpenChange={o => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{statement?.filename}</DialogTitle>
          {statement && (
            <DialogDescription>
              {[statement.bankName, statement.accountName].filter(Boolean).join(' · ') || 'Bank statement'}
              {' · '}
              {fmtPeriod(statement.periodStart, statement.periodEnd)}
              {' · '}
              {STATUS_STYLE[statement.status].label}
            </DialogDescription>
          )}
        </DialogHeader>
        {statement?.error && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{statement.error}</p>
        )}

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
          {isLoading ? (
            <p className="text-muted-foreground p-6 text-center text-sm">Loading rows…</p>
          ) : isError ? (
            <p className="text-destructive p-6 text-center text-sm">Could not load the rows.</p>
          ) : !rows.length ? (
            <p className="text-muted-foreground p-6 text-center text-sm">No rows were read from this statement.</p>
          ) : (
            <Table>
              <TableHeader className="bg-muted/60 sticky top-0">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-28 pl-3">Date</TableHead>
                  <TableHead className="w-36">Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-28 text-right">Amount</TableHead>
                  <TableHead className="w-40">Debit</TableHead>
                  <TableHead className="w-40 pr-3">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground pl-3 whitespace-nowrap">
                      {fmtDay(r.postingDate ?? r.pendingDate)}
                    </TableCell>
                    <TableCell className="max-w-[9rem] truncate font-medium" title={r.name ?? undefined}>
                      {r.name ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="max-w-[18rem] truncate" title={r.description}>
                      {r.description}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold whitespace-nowrap tabular-nums',
                        r.amount < 0 ? 'text-red-600' : 'text-emerald-700',
                      )}
                    >
                      {money(r.amount)}
                    </TableCell>
                    <TableCell>
                      <Account name={r.debitAccount} offset={r.debitAccount === r.offsetAccount} />
                    </TableCell>
                    <TableCell className="pr-3">
                      <Account name={r.creditAccount} offset={r.creditAccount === r.offsetAccount} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={3} className="pl-3 font-medium">
                    {rows.length.toLocaleString()} row{rows.length === 1 ? '' : 's'}
                  </TableCell>
                  <TableCell
                    className={cn('text-right font-bold tabular-nums', net < 0 ? 'text-red-600' : 'text-emerald-700')}
                  >
                    {money(net)}
                  </TableCell>
                  <TableCell colSpan={2} className="text-muted-foreground pr-3 text-sm">
                    net change
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The AI-chosen account (the offset) as a chip; the bank side as plain text. */
function Account({ name, offset }: { name: string; offset: boolean }) {
  return offset ? (
    <span className="inline-flex max-w-full truncate rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800" title={name}>
      {name}
    </span>
  ) : (
    <span className="text-muted-foreground block truncate text-sm" title={name}>
      {name}
    </span>
  );
}
