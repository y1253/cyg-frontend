import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCompany } from '@/hooks/useCompany';
import { useUsers } from '@/hooks/useUsers';
import { useAssignCompany } from '@/hooks/useAssignCompany';
import { useResolveTodo } from '@/hooks/useResolveTodo';
import { useAuth } from '@/context/AuthContext';
import type { TodoItem } from '@/api/companies';

// ─── Urgency helpers ──────────────────────────────────────────────────────────

type UrgencyTier = 'overdue' | 'soon' | 'warning' | 'normal';

function getTodoUrgency(dueDate: string | null, resolved: boolean): UrgencyTier {
  if (resolved || !dueDate) return 'normal';
  const diffDays = (new Date(dueDate).getTime() - Date.now()) / 86_400_000;
  if (diffDays < 0) return 'overdue';
  if (diffDays < 2) return 'soon';
  if (diffDays < 5) return 'warning';
  return 'normal';
}

const urgencyStyles: Record<UrgencyTier, string> = {
  overdue: 'border-red-200 bg-red-50',
  soon: 'border-orange-200 bg-orange-50',
  warning: 'border-yellow-200 bg-yellow-50',
  normal: 'border-border bg-background',
};

const urgencyBadge: Record<UrgencyTier, { label: string; className: string }> = {
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-700 border-red-200' },
  soon: { label: '< 2 days', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  warning: { label: '< 5 days', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  normal: { label: '', className: '' },
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Todo row ─────────────────────────────────────────────────────────────────

function TodoRow({
  todo,
  onToggle,
  isPending,
}: {
  todo: TodoItem;
  onToggle: () => void;
  isPending: boolean;
}) {
  const tier = getTodoUrgency(todo.dueDate, todo.resolved);
  const rowStyle = todo.resolved ? 'border-border bg-muted/30 opacity-60' : urgencyStyles[tier];
  const badge = urgencyBadge[tier];

  return (
    <div className={`flex items-start gap-4 rounded-lg border px-4 py-3 transition-all ${rowStyle}`}>
      {/* Resolve toggle */}
      <button
        type="button"
        onClick={onToggle}
        disabled={isPending}
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
        aria-label={todo.resolved ? 'Mark as open' : 'Mark as resolved'}
      >
        {todo.resolved ? (
          <CheckCircle2 size={20} className="text-green-500" />
        ) : (
          <Circle size={20} />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug ${todo.resolved ? 'line-through text-muted-foreground' : ''}`}>
          {todo.task.title}
        </p>
        {todo.task.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{todo.task.description}</p>
        )}
        {todo.resolved && todo.resolvedAt && (
          <p className="text-xs text-muted-foreground mt-1">
            Resolved {formatDate(todo.resolvedAt)}
          </p>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 shrink-0">
        {!todo.resolved && todo.dueDate && (
          <span className="text-xs text-muted-foreground">Due {formatDate(todo.dueDate)}</span>
        )}
        {!todo.resolved && badge.label && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${badge.className}`}>
            {badge.label}
          </span>
        )}
        {todo.resolved && (
          <Badge variant="secondary" className="text-xs">Done</Badge>
        )}
      </div>
    </div>
  );
}

// ─── Info field ───────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type Tab = 'details' | 'tasks';

function TabBar({ active, onChange, taskCount }: { active: Tab; onChange: (t: Tab) => void; taskCount: number }) {
  return (
    <div className="flex border-b">
      {(['details', 'tasks'] as Tab[]).map(tab => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            active === tab
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab === 'details' ? 'Details' : `Tasks (${taskCount})`}
        </button>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const companyId = Number(id);

  const [tab, setTab] = useState<Tab>('tasks');

  const { data: company, isLoading, isError } = useCompany(companyId);
  const { data: users = [] } = useUsers();
  const assignMutation = useAssignCompany();
  const resolveMutation = useResolveTodo(companyId);

  if (isLoading) {
    return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;
  }
  if (isError || !company) {
    return <div className="p-8 text-destructive text-sm">Company not found.</div>;
  }

  const regularUsers = users.filter(u => u.role === 'USER');
  const openTodos = company.todos.filter(t => !t.resolved);
  const resolvedTodos = company.todos.filter(t => t.resolved);

  function handleAssign(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    assignMutation.mutate({ companyId, userId: val === '' ? null : Number(val) });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold">{company.businessName}</h1>
          <Badge variant={company.status ? 'default' : 'secondary'}>
            {company.status ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {company.country ?? '—'} · Registered {formatDate(company.createdAt)} ·{' '}
          {company.assignedUser ? (
            <>Assigned to <span className="font-medium text-foreground">{company.assignedUser.name}</span></>
          ) : (
            <span className="text-orange-600 font-medium">Unassigned</span>
          )}
        </p>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-lg border bg-background px-4 py-3 text-center">
            <p className="text-2xl font-bold">{company.todos.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Tasks</p>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3 text-center">
            <p className="text-2xl font-bold text-yellow-600">{openTodos.filter(t => ['overdue', 'soon', 'warning'].includes(getTodoUrgency(t.dueDate, false))).length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Urgent</p>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3 text-center">
            <p className="text-2xl font-bold text-green-600">{resolvedTodos.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Resolved</p>
          </div>
        </div>

        <TabBar active={tab} onChange={setTab} taskCount={company.todos.length} />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">

        {/* ── Details tab ── */}
        {tab === 'details' && (
          <div className="flex flex-col gap-4 max-w-3xl">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Company Info</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Field label="Business Name" value={company.businessName} />
                <Field label="Country" value={company.country} />
                <Field label="Business Type" value={company.businessType} />
                <Field label="Company Type" value={company.companyType} />
                <Field label="QB Plan" value={company.qbPlan} />
                {company.companyActivity && (
                  <div className="col-span-2 sm:col-span-3">
                    <Field label="Activity" value={company.companyActivity} />
                  </div>
                )}
              </CardContent>
            </Card>

            {company.contactInfo && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Contact</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field label="Name" value={company.contactInfo.personalName} />
                  <Field label="Email" value={company.contactInfo.privateEmail} />
                  <Field label="Phone" value={company.contactInfo.privatePhone} />
                  <Field label="Store / Unit" value={company.contactInfo.storeNumber} />
                </CardContent>
              </Card>
            )}

            {company.legalInfo && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Legal (Canada)</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field label="NEQ" value={company.legalInfo.neq} />
                  <Field label="Revenue QC ID" value={company.legalInfo.revenueQcId} />
                  <Field label="CRA BN" value={company.legalInfo.craBn} />
                  <Field label="Fiscal Year" value={company.legalInfo.fiscalYear} />
                </CardContent>
              </Card>
            )}

            {company.accountant && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Accountant</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Field label="Name" value={company.accountant.name} />
                  <Field label="Email" value={company.accountant.email} />
                  <Field label="Phone" value={company.accountant.phone} />
                </CardContent>
              </Card>
            )}

            {isAdmin && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Assigned User</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-3">
                  <select
                    className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={company.assignedUser?.id ?? ''}
                    onChange={handleAssign}
                    disabled={assignMutation.isPending}
                  >
                    <option value="">— Unassigned —</option>
                    {regularUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                  {assignMutation.isPending && (
                    <span className="text-xs text-muted-foreground">Saving…</span>
                  )}
                  {assignMutation.isError && (
                    <span className="text-xs text-destructive">
                      {assignMutation.error instanceof Error ? assignMutation.error.message : 'Error'}
                    </span>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Tasks tab ── */}
        {tab === 'tasks' && (
          <div className="flex flex-col gap-6 max-w-3xl">
            {/* Open tasks */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Open ({openTodos.length})
              </h3>
              {openTodos.length === 0 ? (
                <p className="text-sm text-muted-foreground">All tasks resolved.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {openTodos.map(todo => (
                    <TodoRow
                      key={todo.id}
                      todo={todo}
                      onToggle={() => resolveMutation.mutate(todo.id)}
                      isPending={resolveMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Resolved tasks */}
            {resolvedTodos.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Resolved ({resolvedTodos.length})
                </h3>
                <div className="flex flex-col gap-2">
                  {resolvedTodos.map(todo => (
                    <TodoRow
                      key={todo.id}
                      todo={todo}
                      onToggle={() => resolveMutation.mutate(todo.id)}
                      isPending={resolveMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
