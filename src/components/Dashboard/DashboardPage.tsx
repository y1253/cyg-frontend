import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { useCompanies } from '@/hooks/useCompanies';
import type { CompanySummary } from '@/api/companies';

type StatusFilter = 'all' | 'overdue' | 'urgent' | 'unassigned';

// ─── Company row ──────────────────────────────────────────────────────────────

function CompanyRow({ company, onClick }: { company: CompanySummary; onClick: () => void }) {
  const hasOverdue = company.overdueTodos > 0;
  const hasUrgent  = company.urgentTodos > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left flex items-center gap-5 px-4 py-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
    >
      {/* Name + meta */}
      <div className="flex-1 flex items-baseline gap-3 min-w-0">
        <p className="font-medium text-[13px] truncate shrink-0 max-w-[280px]">
          {company.businessName}
        </p>
        <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
          {company.country ?? '—'}
          {' · '}
          {company.assignedUser ? (
            company.assignedUser.name
          ) : (
            <span className="text-orange-500 font-medium">Unassigned</span>
          )}
        </p>
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-2 shrink-0">
        {hasOverdue && (
          <span className="text-[10px] font-medium text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 leading-none">
            {company.overdueTodos} overdue
          </span>
        )}
        {hasUrgent && (
          <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 leading-none">
            {company.urgentTodos} urgent
          </span>
        )}
        <span className="text-[11px] text-muted-foreground w-16 text-right tabular-nums">
          {company.totalTodos === 0 ? 'no tasks' : `${company.totalTodos} tasks`}
        </span>
      </div>

      <ChevronRight
        size={14}
        className="text-muted-foreground/25 group-hover:text-muted-foreground/60 transition-colors shrink-0"
      />
    </button>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow({ wide }: { wide?: boolean }) {
  return (
    <div className="flex items-center gap-5 px-4 py-3 rounded-lg border bg-background animate-pulse">
      <div className={`h-3 bg-muted rounded ${wide ? 'w-56' : 'w-40'}`} />
      <div className="h-2.5 bg-muted rounded w-32 hidden sm:block" />
      <div className="ml-auto h-2.5 bg-muted rounded w-14" />
    </div>
  );
}

// ─── Stats strip ──────────────────────────────────────────────────────────────

function StatsStrip({
  count,
  total,
  urgent,
  overdue,
}: {
  count: number;
  total: number;
  urgent: number;
  overdue: number;
}) {
  const sep = <span className="text-muted-foreground/25 select-none">·</span>;
  return (
    <div className="flex items-center gap-2.5 text-[12px] tabular-nums">
      <span>
        <span className="font-medium">{count}</span>
        <span className="text-muted-foreground ml-1">companies</span>
      </span>
      {sep}
      <span>
        <span className="font-medium">{total}</span>
        <span className="text-muted-foreground ml-1">open tasks</span>
      </span>
      {urgent > 0 && (
        <>
          {sep}
          <span className="font-medium text-amber-600">{urgent}</span>
          <span className="text-muted-foreground">urgent</span>
        </>
      )}
      {overdue > 0 && (
        <>
          {sep}
          <span className="font-medium text-red-600">{overdue}</span>
          <span className="text-muted-foreground">overdue</span>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const isAdmin   = user?.role === 'ADMIN';

  const { data: companies = [], isLoading } = useCompanies();

  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const totalTodos   = companies.reduce((s, c) => s + c.totalTodos,   0);
  const urgentTodos  = companies.reduce((s, c) => s + c.urgentTodos,  0);
  const overdueTodos = companies.reduce((s, c) => s + c.overdueTodos, 0);
  const urgentOnly   = urgentTodos;

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter(c => {
      if (q) {
        const name = c.businessName.toLowerCase().includes(q);
        const user = c.assignedUser?.name.toLowerCase().includes(q) ?? false;
        if (!name && !user) return false;
      }
      if (isAdmin && statusFilter !== 'all') {
        if (statusFilter === 'overdue'    && c.overdueTodos === 0)            return false;
        if (statusFilter === 'urgent'     && c.urgentTodos === 0) return false;
        if (statusFilter === 'unassigned' && c.assignedUser !== null)         return false;
      }
      return true;
    });
  }, [companies, search, statusFilter, isAdmin]);

  const isFiltered = search.trim() !== '' || (isAdmin && statusFilter !== 'all');

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month:   'long',
    day:     'numeric',
  });

  return (
    <div className="px-6 py-6 max-w-4xl mx-auto flex flex-col gap-5">

      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight">
            {isAdmin ? 'All Companies' : 'My Companies'}
          </h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">{today}</p>
        </div>
        {!isLoading && (
          <StatsStrip
            count={companies.length}
            total={totalTodos}
            urgent={urgentOnly}
            overdue={overdueTodos}
          />
        )}
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-xs w-full">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            className="pl-8 h-8 text-[12px]"
            placeholder="Search companies or assignees…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {isAdmin && (
          <Select
            value={statusFilter}
            onValueChange={v => setStatusFilter((v ?? 'all') as StatusFilter)}
          >
            <SelectTrigger className="w-28 h-8 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>
        )}
        {isFiltered && !isLoading && (
          <span className="text-[11px] text-muted-foreground">
            {filteredCompanies.length} of {companies.length}
          </span>
        )}
      </div>

      {/* Company list */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[52, 40, 60, 35, 50, 45].map((w, i) => (
            <SkeletonRow key={i} wide={w > 48} />
          ))}
        </div>
      ) : filteredCompanies.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          {isFiltered ? 'No companies match your search.' : 'No companies yet.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredCompanies.map(company => (
            <CompanyRow
              key={company.id}
              company={company}
              onClick={() => navigate(`/companies/${company.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
