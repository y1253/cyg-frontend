import { Receipt } from 'lucide-react';
import { money } from '@/api/customerBilling';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { useCustomerPayments } from '@/hooks/useCustomerPayments';
import { PaymentsTable } from './PaymentsTable';

/** Customer detail page: this customer's payments and what they have paid in total. */
export function CustomerPaymentsCard({ customerId }: { customerId: number }) {
  const { data, isLoading, isError } = useCustomerPayments(customerId);
  const payments = data?.payments ?? [];
  const currency = payments[0]?.currency ?? 'cad';

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b py-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Receipt size={14} className="text-muted-foreground" />
            Payments
            <span className="text-muted-foreground font-normal">· {payments.length}</span>
          </CardTitle>
          <p className="text-muted-foreground text-xs">Every Generate this customer paid for, or got free with a promo code.</p>
        </div>
        {payments.length > 0 && (
          <div className="text-right">
            <p className="text-lg leading-tight font-semibold tabular-nums">{money(data?.totalCents ?? 0, currency)}</p>
            <p className="text-muted-foreground text-xs">total paid</p>
          </div>
        )}
      </CardHeader>
      {isLoading ? (
        <div className="p-4">
          <div className="bg-muted h-12 animate-pulse rounded-md" />
        </div>
      ) : isError ? (
        <p className="text-destructive p-6 text-center text-sm">Could not load payments.</p>
      ) : (
        <PaymentsTable payments={payments} hideCustomer emptyText="This customer has not paid for a Generate yet." />
      )}
    </Card>
  );
}
