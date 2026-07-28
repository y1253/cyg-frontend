import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useCompanies } from '@/hooks/useCompanies';
import { useGmailUncompletedCounts } from '@/hooks/useGmailUncompletedCounts';
import { CompanyListSkeleton } from './CompanyListSkeleton';
import { CompanyRow } from './CompanyRow';
import { DashboardToolbar } from './DashboardToolbar';
import { StatsStrip } from './StatsStrip';
import type { AssigneeFilter, StatusFilter } from './types';
import type { AssignedUser } from '@/api/companies';

export function DashboardPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const isAdmin   = user?.role === 'ADMIN';

  const { data: allCompanies = [], isLoading } = useCompanies();
  // Resolves after the company list — badges fill in once it lands.
  const { data: uncompletedCounts } = useGmailUncompletedCounts();

  // The internal "Cyg Finance" workspace is pinned to the top and excluded from
  // search, filters and the stats strip — it is not a client company. The server
  // only ever returns the CALLER's own workspace (admins included), so `find` is
  // unambiguous here.
  const internalCompany = allCompanies.find(c => c.isInternal);
  const companies = useMemo(
    () => allCompanies.filter(c => !c.isInternal),
    [allCompanies],
  );

  const [search,         setSearch]         = useState('');
  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all');

  // Only users who actually hold a company — the list comes off the rows already
  // on screen, so there is no second request and no option that returns nothing.
  const assignees = useMemo(() => {
    const byId = new Map<number, AssignedUser>();
    for (const c of companies) {
      if (c.assignedUser) byId.set(c.assignedUser.id, c.assignedUser);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [companies]);

  // Reassigning away the last company of the picked user would leave the filter
  // pointing at an option that no longer exists; fall back rather than go blank.
  const activeAssignee: AssigneeFilter =
    assignees.some(u => u.id === assigneeFilter) ? assigneeFilter : 'all';

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter(c => {
      if (q) {
        const name = c.businessName.toLowerCase().includes(q);
        const user = c.assignedUser?.name.toLowerCase().includes(q) ?? false;
        if (!name && !user) return false;
      }
      if (isAdmin && statusFilter !== 'all') {
        if (statusFilter === 'overdue25'  && c.urgentTodos === 0)    return false;
        if (statusFilter === 'important'  && c.importantTodos === 0) return false;
        if (statusFilter === 'unassigned' && c.assignedUser !== null) return false;
      }
      if (isAdmin && activeAssignee !== 'all' && c.assignedUser?.id !== activeAssignee) {
        return false;
      }
      return true;
    });
  }, [companies, search, statusFilter, activeAssignee, isAdmin]);

  // Stats follow the filters, so picking a user reads as that user's workload.
  const totalTodos     = filteredCompanies.reduce((s, c) => s + c.totalTodos,     0);
  const urgentTodos    = filteredCompanies.reduce((s, c) => s + c.urgentTodos,    0);
  const importantTodos = filteredCompanies.reduce((s, c) => s + c.importantTodos, 0);

  const isFiltered =
    search.trim() !== '' ||
    (isAdmin && (statusFilter !== 'all' || activeAssignee !== 'all'));

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
            count={filteredCompanies.length}
            total={totalTodos}
            urgent={urgentTodos}
            important={importantTodos}
          />
        )}
      </div>

      <DashboardToolbar
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        assignees={assignees}
        assigneeFilter={activeAssignee}
        onAssigneeFilterChange={setAssigneeFilter}
        isAdmin={isAdmin}
        showCount={isFiltered && !isLoading}
        filteredCount={filteredCompanies.length}
        totalCount={companies.length}
      />

      {/* Internal workspace — always first, never filtered out */}
      {!isLoading && internalCompany && (
        <CompanyRow
          company={internalCompany}
          internal
          uncompleted={uncompletedCounts?.[internalCompany.id]}
          onClick={() => navigate(`/companies/${internalCompany.id}`)}
        />
      )}

      {/* Company list */}
      {isLoading ? (
        <CompanyListSkeleton />
      ) : filteredCompanies.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          {isFiltered ? 'No companies match your filters.' : 'No companies yet.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredCompanies.map(company => (
            <CompanyRow
              key={company.id}
              company={company}
              uncompleted={uncompletedCounts?.[company.id]}
              onClick={() => navigate(`/companies/${company.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
