import { ChevronRight } from 'lucide-react';
import type { CompanySummary } from '@/api/companies';
import { CountBadge } from './CountBadge';

export function CompanyRow({
  company,
  uncompleted,
  onClick,
}: {
  company: CompanySummary;
  // Undefined when the company has no Gmail account connected — no count exists,
  // which is different from a count of zero, so no badge is rendered.
  uncompleted: number | undefined;
  onClick: () => void;
}) {
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
        {company.urgentTodos > 0 && (
          <CountBadge tone="purple">{company.urgentTodos} 25d overdue</CountBadge>
        )}
        {company.importantTodos > 0 && (
          <CountBadge tone="amber">{company.importantTodos} important</CountBadge>
        )}
        {uncompleted !== undefined && (
          <CountBadge tone="red">{uncompleted} uncompleted</CountBadge>
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
