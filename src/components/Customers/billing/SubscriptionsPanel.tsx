import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users2 } from 'lucide-react';
import type { SubscriptionFilter } from '@/api/customerBilling';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSubscriptions } from '@/hooks/useSubscriptions';
import { fmtAgo } from '../customer-format';
import { SUBSCRIPTION_FILTERS, periodText, priceText } from './billing-format';
import { PlanCard } from './PlanCard';
import { AccessBadge, TrialUsageList, UsageChip } from './SubscriptionBits';

/**
 * ADMIN: the Plan card, then every customer's subscription — what they can use right now,
 * when it renews or the free months end, a failing card, this month's transactions against
 * the limit, and the free trial's usage for those who never paid.
 */
export function SubscriptionsPanel() {
  const [filter, setFilter] = useState<SubscriptionFilter>('all');
  const [search, setSearch] = useState('');
  const { data, isLoading, isError } = useSubscriptions(filter);

  const rows = useMemo(() => {
    const list = data?.subscriptions ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      r =>
        r.customer.name.toLowerCase().includes(q) ||
        (r.customer.email ?? '').toLowerCase().includes(q) ||
        (r.customer.phone ?? '').includes(q),
    );
  }, [data, search]);

  return (
    <div className="grid gap-4">
      <PlanCard />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {SUBSCRIPTION_FILTERS.map(f => (
            <Button key={f.key} size="sm" variant={filter === f.key ? 'default' : 'outline'} onClick={() => setFilter(f.key)}>
              {f.label}
              {data?.counts && <span className="ml-1 tabular-nums opacity-70">{data.counts[f.key]}</span>}
            </Button>
          ))}
        </div>
        <div className="sm:w-72">
          <SearchInput value={search} onChange={setSearch} placeholder="Search customers…" />
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
          <p className="text-destructive p-8 text-center text-sm">Could not load subscriptions.</p>
        ) : !rows.length ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <Users2 size={20} />
            </span>
            <p className="text-muted-foreground text-sm">{search ? 'No customer matches your search.' : 'No customers here.'}</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Renewal / free until</TableHead>
                <TableHead className="hidden lg:table-cell">Payment problem</TableHead>
                <TableHead>This month</TableHead>
                <TableHead className="hidden pr-4 sm:table-cell">Trial</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => {
                const price = priceText(r);
                return (
                  <TableRow key={r.customer.id}>
                    <TableCell className="pl-4">
                      <Link to={`/admin/customers/${r.customer.id}`} className="block min-w-0 hover:underline">
                        <p className="truncate text-sm font-medium">{r.customer.name}</p>
                        <p className="text-muted-foreground truncate text-xs">{r.customer.email ?? r.customer.phone ?? '—'}</p>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <AccessBadge row={r} />
                      {price && <p className="text-muted-foreground mt-1 text-xs whitespace-nowrap">{price}</p>}
                    </TableCell>
                    <TableCell className="hidden text-sm whitespace-nowrap md:table-cell">{periodText(r)}</TableCell>
                    <TableCell className="hidden max-w-[260px] lg:table-cell">
                      {r.failedSince ? (
                        <div className="text-xs text-red-700">
                          <p className="font-medium">Failing since {fmtAgo(r.failedSince)}</p>
                          {r.lastFailureMessage && <p className="line-clamp-2">{r.lastFailureMessage}</p>}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <UsageChip used={r.month.used} limit={r.month.limit} />
                      {r.transactionLimit !== null && <p className="text-muted-foreground mt-1 text-[11px]">own limit</p>}
                    </TableCell>
                    <TableCell className="hidden pr-4 sm:table-cell">
                      {r.trial ? <TrialUsageList trial={r.trial} /> : <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
