import { Link } from 'react-router-dom';
import { CreditCard, ExternalLink, Receipt } from 'lucide-react';
import { money, type BillingTransaction } from '@/api/customerBilling';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtAgo, fmtDateTime } from '../customer-format';
import { TRANSACTION_KIND, TRANSACTION_STATUS, cardText } from './billing-format';

/** A Stripe link, or a dash. */
function DocLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline"
    >
      {label} <ExternalLink size={12} />
    </a>
  );
}

/**
 * Subscription money events: when, who (unless `hideCustomer`), what kind, the amount, the
 * card, the status — FAILED in red with Stripe's reason — and the invoice / receipt.
 */
export function TransactionsTable({
  transactions,
  hideCustomer = false,
  emptyText = 'No transactions yet.',
}: {
  transactions: BillingTransaction[];
  hideCustomer?: boolean;
  emptyText?: string;
}) {
  if (!transactions.length)
    return (
      <div className="px-6 py-12 text-center">
        <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <Receipt size={20} />
        </span>
        <p className="text-muted-foreground text-sm">{emptyText}</p>
      </div>
    );

  return (
    <Table>
      <TableHeader className="bg-muted/40">
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">Date</TableHead>
          {!hideCustomer && <TableHead>Customer</TableHead>}
          <TableHead className="hidden md:table-cell">Kind</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="hidden lg:table-cell">Card</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="pr-4 text-right">Invoice</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map(t => {
          const status = TRANSACTION_STATUS[t.status];
          const card = cardText(t);
          const failed = t.status === 'FAILED' || t.status === 'ACTION_REQUIRED';
          return (
            <TableRow key={t.id} className={failed ? 'bg-red-50/40' : undefined}>
              <TableCell className="pl-4">
                <p className="text-sm whitespace-nowrap">{fmtDateTime(t.occurredAt)}</p>
                <p className="text-muted-foreground text-xs">{fmtAgo(t.occurredAt)}</p>
              </TableCell>
              {!hideCustomer && (
                <TableCell>
                  <Link to={`/admin/customers/${t.customer.id}`} className="block min-w-0 hover:underline">
                    <p className="truncate text-sm font-medium">{t.customer.name}</p>
                    <p className="text-muted-foreground truncate text-xs">{t.customer.email}</p>
                  </Link>
                </TableCell>
              )}
              <TableCell className="hidden text-sm md:table-cell">
                {TRANSACTION_KIND[t.kind]}
                {t.promoCode && (
                  <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold">{t.promoCode}</span>
                )}
              </TableCell>
              <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums">
                {t.status === 'FREE' ? 'Free' : money(t.amountCents, t.currency)}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {card ? (
                  <span className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                    <CreditCard size={14} className="text-muted-foreground" />
                    {card}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
              </TableCell>
              <TableCell className="max-w-[280px]">
                <Badge variant="outline" className={status.className}>
                  {status.label}
                </Badge>
                {failed && (t.failureMessage || t.declineCode || t.failureCode) && (
                  <p className="mt-1 text-xs text-red-700">
                    {t.failureMessage ?? 'Declined'}
                    {(t.declineCode || t.failureCode) && (
                      <span className="font-mono"> ({t.declineCode ?? t.failureCode})</span>
                    )}
                  </p>
                )}
                {failed && t.nextRetryAt && (
                  <p className="text-muted-foreground text-xs">Next retry {fmtDateTime(t.nextRetryAt)}</p>
                )}
              </TableCell>
              <TableCell className="pr-4 text-right">
                <div className="flex flex-col items-end gap-0.5">
                  <DocLink href={t.hostedInvoiceUrl} label="Invoice" />
                  <DocLink href={t.receiptUrl} label="Receipt" />
                  {!t.hostedInvoiceUrl && !t.receiptUrl && <DocLink href={t.invoicePdfUrl} label="PDF" />}
                  {!t.hostedInvoiceUrl && !t.receiptUrl && !t.invoicePdfUrl && (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
