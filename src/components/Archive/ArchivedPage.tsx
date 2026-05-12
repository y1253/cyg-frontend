import { useNavigate } from 'react-router-dom';
import { Archive, ChevronRight } from 'lucide-react';
import { useDeletedCompanies } from '@/hooks/useDeletedCompanies';
import type { DeletedCompanySummary } from '@/api/companies';

function ArchivedRow({ company, onClick }: { company: DeletedCompanySummary; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left flex items-center gap-4 px-4 py-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors opacity-80 hover:opacity-100"
    >
      <Archive size={14} className="text-muted-foreground/60 shrink-0" />
      <div className="flex-1 flex items-baseline gap-3 min-w-0">
        <p className="font-medium text-[13px] truncate shrink-0 max-w-[280px]">
          {company.businessName}
        </p>
        <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
          {company.country ?? '—'}
        </p>
      </div>
      <p className="text-[11px] text-muted-foreground shrink-0">
        Deleted{' '}
        {new Date(company.deletedAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </p>
      <ChevronRight
        size={14}
        className="text-muted-foreground/25 group-hover:text-muted-foreground/60 transition-colors shrink-0"
      />
    </button>
  );
}

export function ArchivedPage() {
  const navigate = useNavigate();
  const { data: companies = [], isLoading } = useDeletedCompanies();

  return (
    <div className="px-6 py-6 max-w-4xl mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight">Archived Companies</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {companies.length > 0
            ? `${companies.length} archived ${companies.length === 1 ? 'company' : 'companies'}`
            : 'Soft-deleted companies — restore or permanently remove them.'}
        </p>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[60, 40, 52].map((w, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-lg border bg-background animate-pulse">
              <div className="h-3 bg-muted rounded w-4" />
              <div className={`h-3 bg-muted rounded`} style={{ width: `${w * 3}px` }} />
              <div className="ml-auto h-2.5 bg-muted rounded w-28" />
            </div>
          ))}
        </div>
      ) : companies.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No archived companies.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {companies.map(company => (
            <ArchivedRow
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
