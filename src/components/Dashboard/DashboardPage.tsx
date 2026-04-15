import { useNavigate } from 'react-router-dom';
import { AlertCircle, Building2, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { useCompanies } from '@/hooks/useCompanies';
import type { CompanySummary } from '@/api/companies';

// ─── Urgency dot ──────────────────────────────────────────────────────────────

function UrgencyDot({ overdue, urgent }: { overdue: number; urgent: number }) {
  if (overdue > 0)
    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />;
  if (urgent > 0)
    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500 shrink-0" />;
  return <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />;
}

// ─── Company row ──────────────────────────────────────────────────────────────

function CompanyRow({ company, onClick }: { company: CompanySummary; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center justify-between gap-4 rounded-lg border bg-background px-4 py-3 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <UrgencyDot overdue={company.overdueTodos} urgent={company.urgentTodos} />
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{company.businessName}</p>
          <p className="text-xs text-muted-foreground">
            {company.country ?? '—'} ·{' '}
            {company.assignedUser ? (
              company.assignedUser.name
            ) : (
              <span className="text-orange-600 font-medium">Unassigned</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {company.overdueTodos > 0 && (
          <span className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
            {company.overdueTodos} overdue
          </span>
        )}
        {company.urgentTodos > company.overdueTodos && (
          <span className="text-xs font-medium text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full px-2 py-0.5">
            {company.urgentTodos - company.overdueTodos} urgent
          </span>
        )}
        <span className="text-xs text-muted-foreground">{company.totalTodos} tasks</span>
        <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-5 flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
          <p className={`text-3xl font-bold ${color}`}>{value}</p>
        </div>
        <div className={`mt-0.5 ${color} opacity-70`}>{icon}</div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';

  const { data: companies = [], isLoading } = useCompanies();

  const totalTodos = companies.reduce((s, c) => s + c.totalTodos, 0);
  const urgentTodos = companies.reduce((s, c) => s + c.urgentTodos, 0);
  const overdueTodos = companies.reduce((s, c) => s + c.overdueTodos, 0);
  const unassigned = companies.filter(c => c.assignedUser === null);

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-semibold">Welcome back, {user?.name}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isAdmin
            ? 'All companies and tasks are shown below.'
            : 'Your assigned companies and tasks are shown below.'}
        </p>
      </div>

      {/* Stats */}
      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Total Open Tasks"
            value={totalTodos}
            color="text-foreground"
            icon={<CheckCircle2 size={22} />}
          />
          <StatCard
            label="Urgent (< 5 days)"
            value={urgentTodos}
            color="text-yellow-600"
            icon={<Clock size={22} />}
          />
          <StatCard
            label="Overdue"
            value={overdueTodos}
            color="text-red-600"
            icon={<AlertCircle size={22} />}
          />
        </div>
      )}

      {/* Unassigned companies banner (admin only) */}
      {isAdmin && !isLoading && unassigned.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="text-orange-500 shrink-0 mt-0.5" size={18} />
          <div className="text-sm">
            <span className="font-semibold text-orange-700">
              {unassigned.length === 1 ? '1 company has' : `${unassigned.length} companies have`} no assigned user:
            </span>{' '}
            <span className="text-orange-700">{unassigned.map(c => c.businessName).join(', ')}</span>
            <span className="text-orange-600"> — click a company below to assign a user.</span>
          </div>
        </div>
      )}

      {/* Company list */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Building2 size={16} className="text-muted-foreground" />
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            {isAdmin ? 'All Companies' : 'My Companies'} ({companies.length})
          </h3>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No companies found.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {companies.map(company => (
              <CompanyRow
                key={company.id}
                company={company}
                onClick={() => navigate(`/companies/${company.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
