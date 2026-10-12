import { useNavigate } from 'react-router-dom';
import { CreditCard, ExternalLink, Receipt } from 'lucide-react';
import { money, type CustomerPayment } from '@/api/customerBilling';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtAgo, fmtDateTime } from '../customer-format';
import { PAYMENT_STATUS, cardText } from './billing-format';

/**
 * Payment rows: when, who (unless `hideCustomer`), what was charged against the list price,
 * the promo, the card (brand + last 4 — no number is stored), status and Stripe's receipt.
 */
export function PaymentsTable({
  payments,
  hideCustomer = false,
  emptyText = 'No payments yet.',
}: {
  payments: CustomerPayment[];
  hideCustomer?: boolean;
  emptyText?: string;
}) {
  const navigate = useNavigate();

  if (!payments.length)
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
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="hidden md:table-cell">Promo</TableHead>
          <TableHead className="hidden sm:table-cell">Card</TableHead>
          <TableHead className="hidden text-right lg:table-cell">Statements</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="pr-4 text-right">Receipt</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map(p => {
          const status = PAYMENT_STATUS[p.status];
          const card = cardText(p);
          const discounted = p.amountCents !== p.listPriceCents;
          return (
            <TableRow key={p.id}>
              <TableCell className="pl-4">
                <p className="text-sm whitespace-nowrap">{fmtDateTime(p.createdAt)}</p>
                <p className="text-muted-foreground text-xs">{fmtAgo(p.createdAt)}</p>
              </TableCell>
              {!hideCustomer && (
                <TableCell>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/customers/${p.customer.id}`)}
                    className="min-w-0 text-left hover:underline"
                  >
                    <p className="truncate text-sm font-medium">{p.customer.name}</p>
                    <p className="text-muted-foreground truncate text-xs">{p.customer.email}</p>
                  </button>
                </TableCell>
              )}
              <TableCell className="text-right whitespace-nowrap">
                <p className="font-semibold tabular-nums">{p.amountCents === 0 ? 'Free' : money(p.amountCents, p.currency)}</p>
                {discounted && (
                  <p className="text-muted-foreground text-xs tabular-nums line-through">{money(p.listPriceCents, p.currency)}</p>
                )}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {p.promoCode ? (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold">{p.promoCode}</span>
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {card ? (
                  <span className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                    <CreditCard size={14} className="text-muted-foreground" />
                    {card}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums lg:table-cell">{p.statementsQueued}</TableCell>
              <TableCell>
                <Badge variant="outline" className={status.className}>
                  {status.label}
                </Badge>
              </TableCell>
              <TableCell className="pr-4 text-right">
                {p.receiptUrl ? (
                  <a
                    href={p.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline"
                  >
                    View <ExternalLink size={12} />
                  </a>
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
