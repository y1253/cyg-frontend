import { ChevronRight } from 'lucide-react';
import type { CompanySummary } from '@/api/companies';
import { CountBadge } from './CountBadge';
import { isQuietCompany } from './quiet-company';

export function CompanyRow({
  company,
  uncompleted,
  missedCalls,
  internal = false,
  onClick,
}: {
  company: CompanySummary;
  // Summed across every channel the company has — mailbox, calls and texts. A company
  // with only a support number still gets a count; it used to get nothing, which drew
  // no badge and hid a phone backlog entirely.
  //
  // Undefined means UNKNOWN (no channel connected, or every one of them failed), which
  // is different from a count of zero, so no badge is rendered.
  uncompleted: number | undefined;
  // Unread missed calls, voicemails included. This no longer draws a badge — that moved
  // to the header, where it stays visible from inside a company (`MissedCallsIndicator`).
  //
  // ⚠️ Still passed, and still needed: it is what keeps a company with unanswered callers
  // out of the recessed "quiet" treatment below. Dropping the prop would grey out exactly
  // the rows that want attention. Undefined means unknown (no number, or its sweep
  // failed), which counts as quiet the same way an absent `uncompleted` does.
  missedCalls?: number;
  // The user's own internal "Cyg Finance" workspace: teal treatment, pinned to the
  // top of the dashboard, and none of the task counts apply (it holds messages and
  // private links, not todos).
  internal?: boolean;
  onClick: () => void;
}) {
  // Nothing pending and no tag of its own — recede so the rows that do want
  // attention are the ones that stand out. Hover still lifts it back.
  const quiet = isQuietCompany(company, uncompleted, internal, missedCalls);

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        // Below `sm` the row is two lines — name and chevron up top, meta and badges
        // beneath — because a company name, a country, an assignee and up to three
        // badges cannot share 390px without either truncating to nothing or pushing
        // the page into a horizontal scroll. From `sm` it is the single row it was.
        'group w-full rounded-lg border px-4 py-3 text-left transition-colors',
        'flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-5',
        internal
          ? 'border-teal-300 bg-teal-50/60 hover:bg-teal-50'
          : quiet
            ? 'border-muted bg-muted/30 hover:bg-muted/60'
            : 'bg-background hover:bg-muted/50',
      ].join(' ')}
    >
      {/* Name + meta. The chevron rides this line on a phone so the name has a right
          edge to truncate against rather than running under it. */}
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <p
          className={[
            'min-w-0 flex-1 truncate text-[13px] font-medium sm:max-w-[280px] sm:flex-none sm:shrink-0',
            internal ? 'text-teal-800' : quiet ? 'text-muted-foreground' : '',
          ].join(' ')}
        >
          {company.businessName}
        </p>
        <ChevronRight
          size={14}
          className="shrink-0 text-muted-foreground/25 sm:hidden"
        />
        <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
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

      {/* Status badges. On a phone this row also carries the meta the name line gave
          up, and it wraps rather than overflowing. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap sm:shrink-0">
        <p className="truncate text-[11px] text-muted-foreground sm:hidden">
          {internal ? (
            <span className="font-medium text-teal-600">Internal · Messages &amp; Links</span>
          ) : (
            <>
              {company.country ?? '—'}
              {' · '}
              {company.assignedUser ? (
                company.assignedUser.name
              ) : (
                <span className="font-medium text-orange-500">Unassigned</span>
              )}
            </>
          )}
        </p>
        {!internal && company.urgentTodos > 0 && (
          <CountBadge tone="purple">{company.urgentTodos} 25d overdue</CountBadge>
        )}
        {!internal && company.importantTodos > 0 && (
          <CountBadge tone="amber">{company.importantTodos} important</CountBadge>
        )}
        {uncompleted !== undefined && (
          <CountBadge tone={uncompleted === 0 ? 'muted' : 'red'}>
            {uncompleted} uncompleted
          </CountBadge>
        )}
        {!internal && (
          <span className="text-[11px] tabular-nums text-muted-foreground sm:w-16 sm:text-right">
            {company.totalTodos === 0 ? 'no tasks' : `${company.totalTodos} tasks`}
          </span>
        )}
      </div>

      <ChevronRight
        size={14}
        className="hidden shrink-0 text-muted-foreground/25 transition-colors group-hover:text-muted-foreground/60 sm:block"
      />
    </button>
  );
}
