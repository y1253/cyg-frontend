import { ChevronRight } from 'lucide-react';
import type { CompanySummary } from '@/api/companies';
import { CountBadge } from './CountBadge';

export function CompanyRow({
  company,
  uncompleted,
  internal = false,
  onClick,
}: {
  company: CompanySummary;
  // Undefined when the company has no Gmail account connected — no count exists,
  // which is different from a count of zero, so no badge is rendered.
  uncompleted: number | undefined;
  // The user's own internal "Cyg Finance" workspace: teal treatment, pinned to the
  // top of the dashboard, and none of the task counts apply (it holds messages and
  // private links, not todos).
  internal?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group w-full text-left flex items-center gap-5 px-4 py-3 rounded-lg border transition-colors',
        internal
          ? 'border-teal-300 bg-teal-50/60 hover:bg-teal-50'
          : 'bg-background hover:bg-muted/50',
      ].join(' ')}
    >
      {/* Name + meta */}
      <div className="flex-1 flex items-baseline gap-3 min-w-0">
        <p
          className={[
            'font-medium text-[13px] truncate shrink-0 max-w-[280px]',
            internal ? 'text-teal-800' : '',
          ].join(' ')}
        >
          {company.businessName}
        </p>
        <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
          {internal ? (
            <span className="text-teal-600 font-medium">Internal · Messages & Links</span>
          ) : (
            <>
              {company.country ?? '—'}
              {' · '}
              {company.assignedUser ? (
                company.assignedUser.name
              ) : (
                <span className="text-orange-500 font-medium">Unassigned</span>
              )}
            </>
          )}
        </p>
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-2 shrink-0">
        {!internal && company.urgentTodos > 0 && (
          <CountBadge tone="purple">{company.urgentTodos} 25d overdue</CountBadge>
        )}
        {!internal && company.importantTodos > 0 && (
          <CountBadge tone="amber">{company.importantTodos} important</CountBadge>
        )}
        {uncompleted !== undefined && (
          <CountBadge tone="red">{uncompleted} uncompleted</CountBadge>
        )}
        {!internal && (
          <span className="text-[11px] text-muted-foreground w-16 text-right tabular-nums">
            {company.totalTodos === 0 ? 'no tasks' : `${company.totalTodos} tasks`}
          </span>
        )}
      </div>

      <ChevronRight
        size={14}
        className="text-muted-foreground/25 group-hover:text-muted-foreground/60 transition-colors shrink-0"
      />
    </button>
  );
}
