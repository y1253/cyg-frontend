import { useMemo, useState } from 'react';
import { AlertTriangle, DollarSign, Receipt } from 'lucide-react';
import { money, type BillingTransactionStatus } from '@/api/customerBilling';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/SearchInput';
import { useBillingTransactions } from '@/hooks/useBillingTransactions';
import { cn } from '@/lib/utils';
import { TRANSACTION_STATUS, TRANSACTION_STATUSES } from './billing-format';
import { TransactionsTable } from './TransactionsTable';

/** ADMIN: every subscription money event (paid, failed, refunds, disputes, free promos). */
export function TransactionsPanel() {
  const [status, setStatus] = useState<BillingTransactionStatus | null>(null);
  const [search, setSearch] = useState('');
  const { data, isLoading, isError } = useBillingTransactions({ status });
  const list = useMemo(() => data?.transactions ?? [], [data]);
  const currency = list[0]?.currency ?? 'cad';

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      t =>
        t.customer.name.toLowerCase().includes(q) ||
        (t.customer.email ?? '').toLowerCase().includes(q) ||
        (t.cardLast4 ?? '').includes(q) ||
        (t.promoCode ?? '').toLowerCase().includes(q),
    );
  }, [list, search]);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          icon={<DollarSign size={16} />}
          label="Paid, last 30 days"
          value={money(data?.totals.succeededCents30d ?? 0, currency)}
          tone="bg-emerald-50 text-emerald-700"
        />
        <Stat
          icon={<Receipt size={16} />}
          label="Payments, last 30 days"
          value={(data?.totals.succeededCount30d ?? 0).toLocaleString()}
          tone="bg-teal-50 text-teal-700"
        />
        <Stat
          icon={<AlertTriangle size={16} />}
          label="Failed, last 30 days"
          value={(data?.totals.failedCount30d ?? 0).toLocaleString()}
          tone={(data?.totals.failedCount30d ?? 0) > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {([null, ...TRANSACTION_STATUSES] as const).map(s => (
            <Button key={s ?? 'all'} size="sm" variant={status === s ? 'default' : 'outline'} onClick={() => setStatus(s)}>
              {s ? TRANSACTION_STATUS[s].label : 'All'}
            </Button>
          ))}
        </div>
        <div className="sm:w-72">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by customer, last 4 or promo…" />
        </div>
      </div>

      <div className="bg-card overflow-hidden rounded-xl border">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="bg-muted h-12 animate-pulse rounded-md" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-destructive p-8 text-center text-sm">Could not load transactions.</p>
        ) : (
          <TransactionsTable
            transactions={rows}
            emptyText={
              list.length
                ? 'No transactions match your search.'
                : 'No transactions yet — they appear here when a customer subscribes, renews or a payment fails.'
            }
          />
        )}
      </div>
      {list.length >= 1000 && <p className="text-muted-foreground text-xs">Showing the latest 1,000.</p>}
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
