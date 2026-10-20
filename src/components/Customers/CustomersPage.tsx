import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, ListOrdered, UserRound, Users2 } from 'lucide-react';
import type { CustomerSummary } from '@/api/customers';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCustomers } from '@/hooks/useCustomers';
import { cn } from '@/lib/utils';
import { CustomerAvatar } from './CustomerAvatar';
import { AUTH_LABEL, fmtAgo, fmtDateTime } from './customer-format';
import { PaymentsPanel } from './billing/PaymentsPanel';
import { CustomerSiteShell } from './CustomerSiteShell';
import { CUSTOMER_SITE_TABS, type CustomerSiteTab } from './customer-site-tabs';
import { IntakeNumbersPanel } from './intake/IntakeNumbersPanel';
import { AiRulesPanel } from './ai/AiRulesPanel';
import { PricingPanel } from './billing/PricingPanel';
import { PromoCodesPanel } from './billing/PromoCodesPanel';

type Sort = 'newest' | 'oldest' | 'active';

const SORT_LABELS: Record<Sort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  active: 'Most active',
};

const SORTERS: Record<Sort, (a: CustomerSummary, b: CustomerSummary) => number> = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  active: (a, b) =>
    b.transactionCount - a.transactionCount ||
    b.statementCount - a.statementCount ||
    b.createdAt.localeCompare(a.createdAt),
};

/**
 * ADMIN: the public site (cygfinance.com) — its customers, the numbers they text receipts
 * to, the Generate price, promo codes and payments. The tab lives in `?tab=` so a link (or a reload) lands on the same one.
 */
export function CustomersPage() {
  const [params] = useSearchParams();
  const raw = params.get('tab');
  const tab: CustomerSiteTab = CUSTOMER_SITE_TABS.some(t => t.key === raw) ? (raw as CustomerSiteTab) : 'customers';
  const current = CUSTOMER_SITE_TABS.find(t => t.key === tab)!;

  return (
    <CustomerSiteShell active={tab} blurb={current.blurb}>
      {tab === 'customers' && <CustomersList />}
      {tab === 'numbers' && <IntakeNumbersPanel />}
      {tab === 'ai' && <AiRulesPanel />}
      {tab === 'pricing' && <PricingPanel />}
      {tab === 'promo' && <PromoCodesPanel />}
      {tab === 'payments' && <PaymentsPanel />}
    </CustomerSiteShell>
  );
}

/** Every customer who signed up on the public site. Click one for their statements and rows. */
function CustomersList() {
  const navigate = useNavigate();
  const { data: customers = [], isLoading, isError } = useCustomers();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('newest');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers
      .filter(c => !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      .sort(SORTERS[sort]);
  }, [customers, search, sort]);

  const stats = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    return {
      total: customers.filter(c => !c.deletedAt).length,
      thisMonth: customers.filter(c => new Date(c.createdAt) >= monthStart).length,
      statements: customers.reduce((n, c) => n + c.statementCount, 0),
      transactions: customers.reduce((n, c) => n + c.transactionCount, 0),
    };
  }, [customers]);

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Users2 size={16} />} label="Customers" value={stats.total} tone="bg-indigo-50 text-indigo-700" />
        <Stat icon={<UserRound size={16} />} label="Signed up this month" value={stats.thisMonth} tone="bg-sky-50 text-sky-700" />
        <Stat icon={<FileText size={16} />} label="Statements uploaded" value={stats.statements} tone="bg-violet-50 text-violet-700" />
        <Stat icon={<ListOrdered size={16} />} label="Transactions read" value={stats.transactions} tone="bg-amber-50 text-amber-700" />
      </div>

      {customers.length > 0 && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by name or email…" />
          </div>
          <Select items={SORT_LABELS} value={sort} onValueChange={v => setSort((v as Sort | null) ?? 'newest')}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="bg-card overflow-hidden rounded-xl border">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="bg-muted h-12 animate-pulse rounded-md" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-destructive p-8 text-center text-sm">Could not load customers.</p>
        ) : !rows.length ? (
          <div className="px-6 py-14 text-center">
            <Users2 className="text-muted-foreground mx-auto mb-2" size={28} />
            <p className="font-medium">{customers.length ? 'No customers match your search.' : 'No customers yet'}</p>
            {!customers.length && (
              <p className="text-muted-foreground mt-1 text-sm">They appear here when somebody signs up on cygfinance.com.</p>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Customer</TableHead>
                <TableHead>Sign-in</TableHead>
                <TableHead>Signed up</TableHead>
                <TableHead className="hidden md:table-cell">Last login</TableHead>
                <TableHead className="text-right">Statements</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="hidden pr-4 lg:table-cell">Last upload</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(c => (
                <TableRow
                  key={c.id}
                  onClick={() => navigate(`/admin/customers/${c.id}`)}
                  className={cn('cursor-pointer', c.deletedAt && 'opacity-55')}
                >
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <CustomerAvatar name={c.name} url={c.avatarUrl} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-medium">
                          {c.name}
                          {c.deletedAt && <Badge variant="outline" className="text-[10px]">Deleted</Badge>}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">{c.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={c.authType === 'GOOGLE' ? 'border-sky-300 text-sky-700' : ''}>
                      {AUTH_LABEL[c.authType]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm whitespace-nowrap">{fmtDateTime(c.createdAt)}</p>
                    <p className="text-muted-foreground text-xs">{fmtAgo(c.createdAt)}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-sm whitespace-nowrap md:table-cell">
                    {fmtAgo(c.lastLoginAt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.statementCount.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.transactionCount.toLocaleString()}</TableCell>
                  <TableCell className="text-muted-foreground hidden pr-4 text-sm whitespace-nowrap lg:table-cell">
                    {c.lastUploadAt ? fmtAgo(c.lastUploadAt) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <Card className="py-0">
      <CardContent className="flex items-center gap-3 p-4">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tone)}>{icon}</span>
        <div className="min-w-0">
          <p className="text-xl leading-tight font-semibold tabular-nums">{value.toLocaleString()}</p>
          <p className="text-muted-foreground truncate text-xs">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
