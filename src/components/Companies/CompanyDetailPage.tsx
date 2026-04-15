import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, ChevronDown, ChevronUp, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCompany } from '@/hooks/useCompany';
import { useUsers } from '@/hooks/useUsers';
import { useAssignCompany } from '@/hooks/useAssignCompany';
import { useResolveTodo } from '@/hooks/useResolveTodo';
import { useAuth } from '@/context/AuthContext';
import { useTaskSchedules } from '@/hooks/useTaskSchedules';
import { useDeleteTodo, useSetTodoCycle, useRemoveTodoCycle } from '@/hooks/useTodoActions';
import { AddTaskDialog } from './AddTaskDialog';
import type { TodoItem } from '@/api/companies';
import type { AppTaskSchedule } from '@/api/taskSchedules';

// ─── Urgency helpers ──────────────────────────────────────────────────────────

type UrgencyTier = 'overdue' | 'soon' | 'warning' | 'normal';

function getTodoUrgency(dueDate: string | null): UrgencyTier {
  if (!dueDate) return 'normal';
  const diffDays = (new Date(dueDate).getTime() - Date.now()) / 86_400_000;
  if (diffDays < 0) return 'overdue';
  if (diffDays < 2) return 'soon';
  if (diffDays < 5) return 'warning';
  return 'normal';
}

const urgencyBadge: Record<UrgencyTier, { label: string; className: string }> = {
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-700 border-red-200' },
  soon: { label: '< 2 days', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  warning: { label: '< 5 days', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  normal: { label: '', className: '' },
};

// Border+bg for open todos
function rowBg(tier: UrgencyTier, isRecurring: boolean): string {
  if (isRecurring) {
    if (tier === 'overdue') return 'border-red-300 bg-blue-50/80';
    if (tier === 'soon')    return 'border-orange-300 bg-blue-50/80';
    if (tier === 'warning') return 'border-yellow-300 bg-blue-50/80';
    return 'border-blue-200 bg-blue-50/60';
  }
  if (tier === 'overdue') return 'border-red-200 bg-red-50';
  if (tier === 'soon')    return 'border-orange-200 bg-orange-50';
  if (tier === 'warning') return 'border-yellow-200 bg-yellow-50';
  return 'border-border bg-background';
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Cycle badge (circular) ───────────────────────────────────────────────────

function CycleBadge({ days }: { days: number }) {
  return (
    <span
      title={`Repeats every ${days} days`}
      className="w-9 h-9 rounded-full bg-blue-100 border-2 border-blue-300 text-blue-700
                 flex flex-col items-center justify-center shrink-0 leading-none gap-0.5"
    >
      <RefreshCw size={9} />
      <span className="text-[9px] font-bold">{days}d</span>
    </span>
  );
}

// ─── Todo row ─────────────────────────────────────────────────────────────────

function TodoRow({
  todo,
  cycleDays,
  isAdmin,
  onToggle,
  togglePending,
  onDelete,
  onSetCycle,
  onRemoveCycle,
}: {
  todo: TodoItem;
  cycleDays: number | null;
  isAdmin: boolean;
  onToggle: () => void;
  togglePending: boolean;
  onDelete: () => void;
  onSetCycle: (cycle: number) => void;
  onRemoveCycle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [addCycleOpen, setAddCycleOpen] = useState(false);
  const [cycleInput, setCycleInput] = useState('30');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemoveCycle, setConfirmRemoveCycle] = useState(false);

  const isRecurring = !!todo.scheduleId;
  const tier = getTodoUrgency(todo.dueDate);
  const badge = urgencyBadge[tier];
  const bg = todo.resolved
    ? 'border-border bg-muted/20 opacity-70'
    : rowBg(tier, isRecurring);

  const hasDescription = !!todo.task.description;

  return (
    <>
      <div className={`rounded-lg border px-4 py-3 transition-all ${bg}`}>
        {/* Main row */}
        <div className="flex items-center gap-3">
          {/* Checkbox toggle */}
          <button
            type="button"
            onClick={onToggle}
            disabled={togglePending}
            aria-label={todo.resolved ? 'Mark as open' : 'Mark as resolved'}
            className="shrink-0 disabled:opacity-50"
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
              ${todo.resolved
                ? 'bg-green-500 border-green-500'
                : 'border-muted-foreground hover:border-primary bg-background'
              }`}
            >
              {todo.resolved && <Check size={11} className="text-white" strokeWidth={3} />}
            </div>
          </button>

          {/* Cycle badge */}
          {isRecurring && cycleDays && !todo.resolved && (
            <CycleBadge days={cycleDays} />
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm font-medium leading-snug ${todo.resolved ? 'line-through text-muted-foreground' : ''}`}>
                {todo.task.title}
              </p>
              {!todo.resolved && badge.label && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${badge.className}`}>
                  {badge.label}
                </span>
              )}
            </div>
            {!todo.resolved && todo.dueDate && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Due {formatDate(todo.dueDate)}
              </p>
            )}
            {todo.resolved && todo.resolvedAt && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Resolved {formatDate(todo.resolvedAt)}
              </p>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Details expand */}
            {hasDescription && (
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 px-1"
              >
                {expanded ? <><ChevronUp size={13} /> Hide</> : <><ChevronDown size={13} /> Details</>}
              </button>
            )}

            {/* Admin actions */}
            {isAdmin && !todo.resolved && (
              <>
                {isRecurring ? (
                  <button
                    type="button"
                    title="Remove cycle"
                    onClick={() => setConfirmRemoveCycle(true)}
                    className="w-7 h-7 flex items-center justify-center rounded text-blue-500 hover:bg-blue-100 transition-colors"
                  >
                    <X size={13} />
                  </button>
                ) : (
                  <button
                    type="button"
                    title="Make recurring"
                    onClick={() => { setAddCycleOpen(v => !v); setCycleInput('30'); }}
                    className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <RefreshCw size={13} />
                  </button>
                )}
                <button
                  type="button"
                  title="Delete task"
                  onClick={() => setConfirmDelete(true)}
                  className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Expanded description */}
        {expanded && hasDescription && (
          <div className="mt-2 ml-8 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed border-t border-border/50 pt-2">
            {todo.task.description}
          </div>
        )}

        {/* Inline add-cycle form */}
        {addCycleOpen && !isRecurring && (
          <div className="mt-2 ml-8 flex items-center gap-2 border-t border-border/50 pt-2">
            <span className="text-xs text-muted-foreground">Repeat every</span>
            <Input
              type="number"
              min={1}
              value={cycleInput}
              onChange={e => setCycleInput(e.target.value)}
              className="h-7 w-20 text-xs px-2"
              autoFocus
            />
            <span className="text-xs text-muted-foreground">days</span>
            <Button
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => {
                const n = Number(cycleInput);
                if (n >= 1) { onSetCycle(n); setAddCycleOpen(false); }
              }}
            >
              Set
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs px-2"
              onClick={() => setAddCycleOpen(false)}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Remove cycle confirm */}
      <Dialog open={confirmRemoveCycle} onOpenChange={setConfirmRemoveCycle}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Remove Recurrence</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Stop recurring for <span className="font-medium text-foreground">{todo.task.title}</span>?
            This todo stays open but won't repeat after it's resolved.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmRemoveCycle(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={() => { onRemoveCycle(); setConfirmRemoveCycle(false); }}>
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Task</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <span className="font-medium text-foreground">{todo.task.title}</span> from this company?
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={() => { onDelete(); setConfirmDelete(false); }}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
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

type Tab = 'details' | 'tasks' | 'resolved';

function TabBar({
  active,
  onChange,
  openCount,
  resolvedCount,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  openCount: number;
  resolvedCount: number;
}) {
  const tabs: { key: Tab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'tasks',   label: `Tasks (${openCount})` },
    { key: 'resolved', label: `Resolved (${resolvedCount})` },
  ];

  return (
    <div className="flex border-b">
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            active === key
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {label}
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
  const [addTaskOpen, setAddTaskOpen] = useState(false);

  const { data: company, isLoading, isError } = useCompany(companyId);
  const { data: users = [] } = useUsers();
  const { data: schedules = [] } = useTaskSchedules(companyId);
  const assignMutation = useAssignCompany();
  const resolveMutation = useResolveTodo(companyId);
  const deleteMutation = useDeleteTodo(companyId);
  const setCycleMutation = useSetTodoCycle(companyId);
  const removeCycleMutation = useRemoveTodoCycle(companyId);

  if (isLoading) return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;
  if (isError || !company) return <div className="p-8 text-destructive text-sm">Company not found.</div>;

  const regularUsers = users.filter(u => u.role === 'USER');
  const openTodos = company.todos.filter(t => !t.resolved);
  const resolvedTodos = company.todos.filter(t => t.resolved);

  // Build a map: scheduleId → cycle days
  const scheduleMap = new Map<number, number>(schedules.map((s: AppTaskSchedule) => [s.id, s.cycle]));

  function getCycleDays(todo: TodoItem): number | null {
    if (!todo.scheduleId) return null;
    return scheduleMap.get(todo.scheduleId) ?? null;
  }

  function handleAssign(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    assignMutation.mutate({ companyId, userId: val === '' ? null : Number(val) });
  }

  function todoRowProps(todo: TodoItem) {
    return {
      todo,
      cycleDays: getCycleDays(todo),
      isAdmin,
      onToggle: () => resolveMutation.mutate(todo.id),
      togglePending: resolveMutation.isPending,
      onDelete: () => deleteMutation.mutate(todo.id),
      onSetCycle: (cycle: number) => setCycleMutation.mutate({ id: todo.id, cycle }),
      onRemoveCycle: () => removeCycleMutation.mutate(todo.id),
    };
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
          {company.assignedUser
            ? <>Assigned to <span className="font-medium text-foreground">{company.assignedUser.name}</span></>
            : <span className="text-orange-600 font-medium">Unassigned</span>
          }
        </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-lg border bg-background px-4 py-3 text-center">
            <p className="text-2xl font-bold">{openTodos.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Open Tasks</p>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3 text-center">
            <p className="text-2xl font-bold text-yellow-600">
              {openTodos.filter(t => ['overdue','soon','warning'].includes(getTodoUrgency(t.dueDate))).length}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Urgent</p>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3 text-center">
            <p className="text-2xl font-bold text-green-600">{resolvedTodos.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Resolved</p>
          </div>
        </div>

        <TabBar
          active={tab}
          onChange={setTab}
          openCount={openTodos.length}
          resolvedCount={resolvedTodos.length}
        />
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
                  <Field label="Store Phone Number" value={company.contactInfo.storeNumber} />
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
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                  {assignMutation.isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
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
          <div className="flex flex-col gap-4 max-w-3xl">
            {isAdmin && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setAddTaskOpen(true)}
                >
                  <Plus size={14} /> Add Task
                </Button>
              </div>
            )}

            {openTodos.length === 0 ? (
              <p className="text-sm text-muted-foreground">All tasks resolved.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {openTodos.map(todo => (
                  <TodoRow key={todo.id} {...todoRowProps(todo)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Resolved tab ── */}
        {tab === 'resolved' && (
          <div className="flex flex-col gap-2 max-w-3xl">
            {resolvedTodos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No resolved tasks yet.</p>
            ) : (
              resolvedTodos.map(todo => (
                <TodoRow key={todo.id} {...todoRowProps(todo)} />
              ))
            )}
          </div>
        )}
      </div>

      <AddTaskDialog open={addTaskOpen} onOpenChange={setAddTaskOpen} companyId={companyId} />
    </div>
  );
}
