import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useCompanies } from '@/hooks/useCompanies';
import { useGmailUncompletedCounts } from '@/hooks/useGmailUncompletedCounts';
import { CompanyListSkeleton } from './CompanyListSkeleton';
import { CompanyRow } from './CompanyRow';
import { DashboardToolbar } from './DashboardToolbar';
import { StatsStrip } from './StatsStrip';
import type { StatusFilter } from './types';

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

  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const totalTodos     = companies.reduce((s, c) => s + c.totalTodos,     0);
  const urgentTodos    = companies.reduce((s, c) => s + c.urgentTodos,    0);
  const importantTodos = companies.reduce((s, c) => s + c.importantTodos, 0);

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
          {isFiltered ? 'No companies match your search.' : 'No companies yet.'}
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
