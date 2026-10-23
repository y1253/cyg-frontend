import { useMemo, useState } from 'react';
import { CalendarDays, DollarSign, Receipt, Tag } from 'lucide-react';
import { money } from '@/api/customerBilling';
import { Card, CardContent } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/SearchInput';
import { useCustomerPayments } from '@/hooks/useCustomerPayments';
import { cn } from '@/lib/utils';
import { PaymentsTable } from './PaymentsTable';

/** ADMIN: every customer payment (paid and free Generates), newest first. */
export function PaymentsPanel() {
  const { data, isLoading, isError } = useCustomerPayments();
  const [search, setSearch] = useState('');
  const payments = useMemo(() => data?.payments ?? [], [data]);
  const currency = payments[0]?.currency ?? 'cad';

  const stats = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const thisMonth = payments.filter(p => p.status === 'SUCCEEDED' && new Date(p.createdAt) >= monthStart);
    return {
      month: thisMonth.reduce((n, p) => n + p.amountCents, 0),
      monthCount: thisMonth.length,
      promo: payments.filter(p => p.promoCode).length,
    };
  }, [payments]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter(
      p =>
        p.customer.name.toLowerCase().includes(q) ||
        (p.customer.email ?? '').toLowerCase().includes(q) ||
        (p.promoCode ?? '').toLowerCase().includes(q) ||
        (p.cardLast4 ?? '').includes(q),
    );
  }, [payments, search]);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<DollarSign size={16} />} label="Total revenue" value={money(data?.totalCents ?? 0, currency)} tone="bg-emerald-50 text-emerald-700" />
        <Stat icon={<CalendarDays size={16} />} label="This month" value={money(stats.month, currency)} tone="bg-teal-50 text-teal-700" />
        <Stat icon={<Receipt size={16} />} label="Paid Generates" value={(data?.paidCount ?? 0).toLocaleString()} tone="bg-sky-50 text-sky-700" />
        <Stat icon={<Tag size={16} />} label="Used a promo code" value={stats.promo.toLocaleString()} tone="bg-violet-50 text-violet-700" />
      </div>

      {payments.length > 0 && (
        <SearchInput value={search} onChange={setSearch} placeholder="Search by customer, email, promo or last 4…" />
      )}

      <div className="bg-card overflow-hidden rounded-xl border">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="bg-muted h-12 animate-pulse rounded-md" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-destructive p-8 text-center text-sm">Could not load payments.</p>
        ) : (
          <PaymentsTable
            payments={rows}
            emptyText={payments.length ? 'No payments match your search.' : 'No payments yet — they appear here when a customer pays for a Generate.'}
          />
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <Card className="py-0">
      <CardContent className="flex items-center gap-3 p-4">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tone)}>{icon}</span>
        <div className="min-w-0">
          <p className="truncate text-xl leading-tight font-semibold tabular-nums">{value}</p>
          <p className="text-muted-foreground truncate text-xs">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
