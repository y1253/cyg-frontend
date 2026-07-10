import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { Archive, Ban, CalendarIcon, ChevronDown, ChevronUp, Eye, EyeOff, ExternalLink, GripHorizontal, Pencil, Plus, Power, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MonthDaySelect } from '@/components/ui/MonthDaySelect';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useDeleteTodo, useSetTodoCycle, useRemoveTodoCycle, useSnoozeTodo, useUnsnoozeTodo } from '@/hooks/useTodoActions';
import { useLinks, useCreateLink, useUpdateLink, useDeleteLink } from '@/hooks/useLinks';
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote } from '@/hooks/useNotes';
import { useToggleSchedule, useUpdateSchedule, useToggleScheduleImportant, useUpdateScheduleUserNote, useDeleteSchedule } from '@/hooks/useTaskSchedules';
import { useUpdateCompany } from '@/hooks/useUpdateCompany';
import { useDeleteCompany } from '@/hooks/useDeleteCompany';
import { usePermanentDeleteCompany, useRestoreCompany } from '@/hooks/useDeletedCompanies';
import { useGmailAccount } from '@/hooks/useGmailAccount';
import { useGmailUncompletedCount } from '@/hooks/useGmailUncompletedCount';
import { useDisconnectGmail } from '@/hooks/useDisconnectGmail';
import { fetchAuthUrl } from '@/api/gmail';
import { AddTaskDialog } from './AddTaskDialog';
import { CommunicationsTab } from './CommunicationsTab';
import type { TodoItem } from '@/api/companies';
import type { AppTaskSchedule } from '@/api/taskSchedules';
import type { CompanyLink } from '@/api/links';
import type { CompanyNote } from '@/api/notes';

// ─── Global localStorage helpers ─────────────────────────────────────────────

const GLOBAL_UI_KEY = 'cyg-ui-prefs';
const getGlobalUI = () => {
  try { return JSON.parse(localStorage.getItem(GLOBAL_UI_KEY) ?? '{}'); } catch { return {}; }
};

const COLLAPSED_TODOS_KEY = 'cyg-collapsed-todos';
const getCollapsedTodoIds = (): Set<number> => {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_TODOS_KEY) ?? '[]')); } catch { return new Set(); }
};
const saveCollapsedTodoId = (id: number, collapsed: boolean) => {
  try {
    const ids = getCollapsedTodoIds();
    collapsed ? ids.add(id) : ids.delete(id);
    localStorage.setItem(COLLAPSED_TODOS_KEY, JSON.stringify([...ids]));
  } catch {}
};

// ─── Urgency helpers ──────────────────────────────────────────────────────────

type UrgencyTier = 'urgent' | 'overdue' | 'soon' | 'warning' | 'normal';

function getTodoUrgency(dueDate: string | null): UrgencyTier {
  if (!dueDate) return 'normal';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate.slice(0, 10) + 'T00:00:00');
  const diffDays = (due.getTime() - today.getTime()) / 86_400_000;
  if (diffDays < -25) return 'urgent';
  if (diffDays < 0) return 'overdue';
  if (diffDays < 1) return 'soon';
  return 'normal';
}

const urgencyBadge: Record<UrgencyTier, { label: string; className: string }> = {
  urgent:  { label: 'Overdue 25 days', className: 'bg-purple-100 text-purple-800 border-purple-300' },
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-700 border-red-200' },
  soon: { label: 'Due today', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  warning: { label: '< 5 days', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  normal: { label: '', className: '' },
};

// Border+bg for open todos
function rowBg(tier: UrgencyTier, isRecurring: boolean, isImportant: boolean): string {
  if (isRecurring) {
    if (tier === 'urgent')  return 'border-purple-400 bg-purple-100/80';
    if (tier === 'overdue') return 'border-red-300 bg-blue-50/80';
    if (tier === 'soon')    return 'border-orange-300 bg-blue-50/80';
    if (tier === 'warning') return 'border-yellow-300 bg-blue-50/80';
    if (isImportant)        return 'border-amber-300 bg-blue-50/60';
    return 'border-blue-200 bg-blue-50/60';
  }
  if (tier === 'urgent')  return 'border-purple-300 bg-purple-100';
  if (tier === 'overdue') return 'border-red-200 bg-red-50';
  if (tier === 'soon')    return 'border-orange-200 bg-orange-50';
  if (tier === 'warning') return 'border-yellow-200 bg-yellow-50';
  if (isImportant)        return 'border-amber-300 bg-amber-50/50';
  return 'border-border bg-background';
}

function overdueLabel(dueDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate.slice(0, 10) + 'T00:00:00');
  const days = Math.round((today.getTime() - due.getTime()) / 86_400_000);
  return days === 1 ? '1 day overdue' : `${days} days overdue`;
}

function renderWithLinks(text: string): React.ReactNode {
  // Matches https://... , http://... , www.xxx , and bare domains like hi.com
  const urlRegex = /https?:\/\/[^\s]+|(?:[a-zA-Z][a-zA-Z0-9\-]*\.)+[a-zA-Z]{2,6}(?:\/[^\s]*)?/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const raw = match[0].replace(/[.,;:!?)\]]+$/, ''); // strip trailing punctuation
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    parts.push(
      <a
        key={match.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline cursor-pointer hover:text-blue-800 break-all"
        onClick={e => e.stopPropagation()}
      >
        {raw}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Cycle format helpers ─────────────────────────────────────────────────────

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = ['', '1st', '2nd', '3rd', '4th'];

function ordinal(n: number): string {
  return ORDINALS[n] ?? `${n}th`;
}

// Day-of-month phrase that understands the "last day of month" sentinel (0).
function cycleDayPhrase(cycleDay: number | null | undefined): string {
  const d = cycleDay ?? 1;
  return d === 0 ? 'last day' : ordinal(d);
}

function formatCycle(s: AppTaskSchedule): string {
  switch (s.cycleType) {
    case 'MONTHLY_DATE':
      return `Every ${cycleDayPhrase(s.cycleDay)} of the month`;
    case 'WEEKLY_DAY':
      return `Every ${WEEKDAYS[s.cycleDay ?? 0]}`;
    case 'MONTHLY_WEEKDAY':
      return `Every ${ordinal(s.cycleNth ?? 1)} ${WEEKDAYS[s.cycleDay ?? 0]}`;
    case 'QUARTERLY':
      return `Every quarter (${cycleDayPhrase(s.cycleDay)} of month)`;
    case 'YEARLY':
      return `Every year on ${MONTHS[(s.cycleNth ?? 1) - 1]?.label ?? 'Jan'} ${cycleDayPhrase(s.cycleDay)}`;
    default:
      return `Every ${s.cycle} days`;
  }
}

// ─── Cycle badge (circular) ───────────────────────────────────────────────────

function CycleBadge({ schedule }: { schedule: AppTaskSchedule }) {
  const label = formatCycle(schedule);
  return (
    <span
      title={label}
      className="w-9 h-9 rounded-full bg-blue-100 border-2 border-blue-300 text-blue-700
                 flex flex-col items-center justify-center shrink-0 leading-none gap-0.5"
    >
      <RefreshCw size={9} />
      <span className="text-[9px] font-bold leading-tight text-center px-0.5">{label.replace('Every ', '')}</span>
    </span>
  );
}

// ─── Completion checkbox with celebration animation ───────────────────────────

const PARTICLE_CONFIG = [
  { angle:   0, dist: 18, color: '#4ade80' },
  { angle:  45, dist: 20, color: '#34d399' },
  { angle:  90, dist: 18, color: '#2dd4bf' },
  { angle: 135, dist: 22, color: '#86efac' },
  { angle: 180, dist: 18, color: '#4ade80' },
  { angle: 225, dist: 20, color: '#6ee7b7' },
  { angle: 270, dist: 18, color: '#34d399' },
  { angle: 315, dist: 22, color: '#a7f3d0' },
];

function CompletionCheckbox({
  resolved,
  pending,
  celebrating,
  onToggle,
}: {
  resolved: boolean;
  pending: boolean;
  celebrating: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-label={resolved ? 'Mark as open' : 'Mark as resolved'}
      className="relative shrink-0 w-6 h-6 flex items-center justify-center disabled:opacity-40 group"
    >
      {/* Particle burst — only while celebrating */}
      {celebrating && PARTICLE_CONFIG.map((p, i) => {
        const rad = (p.angle * Math.PI) / 180;
        const tx = Math.round(Math.cos(rad) * p.dist);
        const ty = Math.round(Math.sin(rad) * p.dist);
        return (
          <span
            key={i}
            aria-hidden
            className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full pointer-events-none animate-todo-particle"
            style={{ backgroundColor: p.color, '--tx': `${tx}px`, '--ty': `${ty}px`, animationDelay: `${i * 18}ms` } as React.CSSProperties}
          />
        );
      })}

      {/* SVG circle + animated checkmark */}
      <svg
        viewBox="0 0 20 20"
        className={`w-5 h-5 overflow-visible ${celebrating ? 'animate-todo-circle-spring' : ''}`}
        aria-hidden
      >
        {/* Ring / filled circle */}
        <circle
          cx="10" cy="10" r="8.5"
          strokeWidth="1.5"
          fill={resolved ? '#22c55e' : 'none'}
          stroke={resolved ? '#22c55e' : 'currentColor'}
          className={`transition-colors duration-200 ${!resolved ? 'text-muted-foreground group-hover:text-foreground' : ''}`}
        />
        {/* Checkmark — draws itself in when celebrating, static otherwise */}
        {resolved && (
          <path
            d="M5 10.5 L8.5 14 L15 7.5"
            fill="none"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={celebrating ? 'animate-todo-check-draw' : ''}
            style={{ strokeDasharray: 16, strokeDashoffset: celebrating ? 16 : 0 }}
          />
        )}
      </svg>
    </button>
  );
}

// ─── Todo row ─────────────────────────────────────────────────────────────────

function TodoRow({
  todo,
  schedule,
  adminNote,
  userNote,
  isAdmin,
  isImportant,
  onToggle,
  togglePending,
  onDelete,
  onSetCycle,
  onRemoveCycle,
  onSnooze,
  expandSignal,
}: {
  todo: TodoItem;
  schedule: AppTaskSchedule | null;
  adminNote: string | null;
  userNote: string | null;
  isAdmin: boolean;
  isImportant: boolean;
  onToggle: () => void;
  togglePending: boolean;
  onDelete: () => void;
  onSetCycle: (cycle: number) => void;
  onRemoveCycle: () => void;
  onSnooze: (days: number) => void;
  expandSignal?: { expanded: boolean; seq: number };
}) {
  const [expanded, setExpanded] = useState(() => !getCollapsedTodoIds().has(todo.id));

  useEffect(() => {
    if (expandSignal && expandSignal.seq > 0) {
      setExpanded(expandSignal.expanded);
      saveCollapsedTodoId(todo.id, !expandSignal.expanded);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandSignal?.seq]);
  const [addCycleOpen, setAddCycleOpen] = useState(false);
  const [cycleInput, setCycleInput] = useState('30');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemoveCycle, setConfirmRemoveCycle] = useState(false);
  const [confirmResolve, setConfirmResolve] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozeDaysInput, setSnoozeDaysInput] = useState('2');

  // `celebrating` fires immediately on click (particles + spring)
  const [celebrating, setCelebrating] = useState(false);
  // `rowPulse` fires when the server confirms resolve (checkmark draw + row glow)
  const [rowPulse, setRowPulse] = useState(false);
  const prevResolved = useRef(todo.resolved);

  useEffect(() => {
    if (!prevResolved.current && todo.resolved) {
      setRowPulse(true);
      const t = setTimeout(() => setRowPulse(false), 1600);
      return () => clearTimeout(t);
    }
    prevResolved.current = todo.resolved;
  }, [todo.resolved]);

  const isRecurring = !!todo.scheduleId;
  const tier = getTodoUrgency(todo.dueDate);
  const badge = urgencyBadge[tier];
  const bg = todo.resolved
    ? 'border-border bg-muted/20 opacity-70'
    : rowBg(tier, isRecurring, isImportant);

  const hasDescription = !!todo.task.description;
  const hasNote = !!adminNote || !!userNote;

  function handleToggle() {
    if (!todo.resolved) {
      setConfirmResolve(true);
    } else {
      onToggle();
    }
  }

  function doResolve() {
    setCelebrating(true);
    setTimeout(() => setCelebrating(false), 1200);
    onToggle();
    setConfirmResolve(false);
  }

  return (
    <>
      <div className={`rounded-lg border px-4 py-3 transition-all ${bg} ${rowPulse ? 'animate-todo-row-pulse' : ''}`}>
        {/* Main row */}
        <div className="flex items-center gap-3">
          <CompletionCheckbox
            resolved={todo.resolved}
            pending={togglePending}
            celebrating={celebrating || rowPulse}
            onToggle={handleToggle}
          />

          {/* Cycle badge */}
          {isRecurring && schedule && !todo.resolved && (
            <CycleBadge schedule={schedule} />
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {isImportant && !todo.resolved && (
                <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-300 shrink-0">
                  Important
                </span>
              )}
              <p className={`text-sm font-medium leading-snug flex items-center gap-2 ${todo.resolved ? 'line-through text-muted-foreground' : ''}`}>
                {todo.task.orderNumber != null && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-semibold shrink-0">
                    {todo.task.orderNumber}
                  </span>
                )}
                {todo.task.title}
              </p>
              {!todo.resolved && badge.label && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${badge.className}`}>
                  {(tier === 'overdue' || tier === 'urgent') && todo.dueDate ? overdueLabel(todo.dueDate) : badge.label}
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
            {!expanded && adminNote && (
              <p className="text-xs text-amber-600 mt-0.5 truncate">
                📝 {adminNote.length > 45 ? adminNote.slice(0, 45) + '…' : adminNote}
              </p>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Details expand */}
            {(hasDescription || hasNote) && (
              <button
                type="button"
                onClick={() => setExpanded(v => { const next = !v; saveCollapsedTodoId(todo.id, !next); return next; })}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 px-1"
              >
                {expanded ? <><ChevronUp size={13} /> Hide</> : <><ChevronDown size={13} /> Details</>}
              </button>
            )}

            {/* Snooze button — available to all users when task is snoozable */}
            {todo.task.isSnoozable && !todo.resolved && (
              <button
                type="button"
                title="Snooze"
                onClick={() => { setSnoozeOpen(v => !v); setSnoozeDaysInput('2'); }}
                className={`h-7 px-2 rounded text-[11px] font-semibold transition-colors ${
                  snoozeOpen
                    ? 'text-slate-700 bg-slate-100 border border-slate-300'
                    : 'text-muted-foreground hover:text-slate-700 hover:bg-slate-50 border border-transparent'
                }`}
              >
                Snooze
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

        {/* Expanded description + note */}
        {expanded && (hasDescription || hasNote) && (
          <div className="mt-2 ml-8 border-t border-border/50 pt-2 flex flex-col gap-1.5">
            {hasDescription && (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {todo.task.description}
              </p>
            )}
            {adminNote && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 whitespace-pre-wrap leading-relaxed">
                📝 {renderWithLinks(adminNote)}
              </p>
            )}
            {userNote && (
              <p className="text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded px-2 py-1 whitespace-pre-wrap leading-relaxed">
                🗒️ {renderWithLinks(userNote)}
              </p>
            )}
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

        {/* Inline snooze form */}
        {snoozeOpen && todo.task.isSnoozable && !todo.resolved && (
          <div className="mt-2 ml-8 flex flex-col gap-2 border-t border-border/50 pt-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Snooze for</span>
              {[1, 2, 3, 7].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSnoozeDaysInput(String(d))}
                  className={`h-6 px-2 rounded text-xs transition-colors ${
                    snoozeDaysInput === String(d)
                      ? 'bg-slate-200 text-slate-800 font-medium'
                      : 'text-muted-foreground hover:bg-slate-100'
                  }`}
                >
                  {d}d
                </button>
              ))}
              <Input
                type="number"
                min={1}
                max={90}
                value={snoozeDaysInput}
                onChange={e => setSnoozeDaysInput(e.target.value)}
                className="h-7 w-16 text-xs px-2"
                placeholder="days"
              />
              <span className="text-xs text-muted-foreground">days</span>
              <Button
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => {
                  const n = Number(snoozeDaysInput);
                  if (n >= 1) { onSnooze(n); setSnoozeOpen(false); }
                }}
              >
                Snooze
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2"
                onClick={() => setSnoozeOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Resolve confirm */}
      <Dialog open={confirmResolve} onOpenChange={setConfirmResolve}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Complete Task?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Confirm that you've completed{' '}
            <span className="font-semibold text-foreground">{todo.task.title}</span>
            {todo.dueDate && (
              <>
                {' '}due on{' '}
                <span className="font-semibold text-foreground">
                  {new Date(todo.dueDate.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-CA', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </span>
              </>
            )}
            .
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmResolve(false)}>Cancel</Button>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={doResolve}>
              Mark Complete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

// ─── Shared constants ─────────────────────────────────────────────────────────

const BUSINESS_TYPES = [
  { value: 'REAL_ESTATE', label: 'Real Estate' },
  { value: 'ADVERTISING', label: 'Advertising' },
  { value: 'RETAIL', label: 'Retail' },
  { value: 'CONSTRUCTION', label: 'Construction' },
  { value: 'TECHNOLOGY', label: 'Technology' },
  { value: 'HEALTHCARE', label: 'Healthcare' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'OTHER', label: 'Other' },
];

const COMPANY_TYPES = [
  { value: 'CORPORATION', label: 'Corporation' },
  { value: 'LLC', label: 'LLC' },
  { value: 'SOLE_PROPRIETOR', label: 'Sole Proprietor' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
  { value: 'NON_PROFIT', label: 'Non-Profit' },
  { value: 'OTHER', label: 'Other' },
];

const MONTHS = [
  { value: '01', label: 'January',   maxDay: 31 },
  { value: '02', label: 'February',  maxDay: 29 },
  { value: '03', label: 'March',     maxDay: 31 },
  { value: '04', label: 'April',     maxDay: 30 },
  { value: '05', label: 'May',       maxDay: 31 },
  { value: '06', label: 'June',      maxDay: 30 },
  { value: '07', label: 'July',      maxDay: 31 },
  { value: '08', label: 'August',    maxDay: 31 },
  { value: '09', label: 'September', maxDay: 30 },
  { value: '10', label: 'October',   maxDay: 31 },
  { value: '11', label: 'November',  maxDay: 30 },
  { value: '12', label: 'December',  maxDay: 31 },
];

// ─── Info field ───────────────────────────────────────────────────────────────

function formatFiscalYear(date: string | null | undefined): string | null {
  if (!date) return null;
  const m = date.match(/^2000-(\d{2})-(\d{2})/);
  if (!m) return date;
  return new Date(2000, parseInt(m[1]) - 1, parseInt(m[2])).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

// ─── Editable card header ─────────────────────────────────────────────────────

function EditableCardHeader({
  title,
  editing,
  saving,
  onEdit,
  onSave,
  onCancel,
  error,
}: {
  title: string;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  error?: string | null;
}) {
  return (
    <CardHeader className="pb-3 flex-row items-center justify-between">
      <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      {editing ? (
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-destructive">{error}</span>}
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 text-xs px-3" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Pencil size={13} />
        </button>
      )}
    </CardHeader>
  );
}

// ─── Fiscal year picker (month + day) ─────────────────────────────────────────

function FiscalYearPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const parts = value ? value.split('-') : [];
  const selectedMonth = parts.length >= 2 ? parts[1] : null;
  const selectedDay   = parts.length >= 3 ? parts[2] : null;
  const maxDays = selectedMonth ? (MONTHS.find(m => m.value === selectedMonth)?.maxDay ?? 31) : 31;

  function handleMonth(m: string | null) {
    if (!m) { onChange(''); return; }
    const max = MONTHS.find(x => x.value === m)?.maxDay ?? 31;
    const day = selectedDay && parseInt(selectedDay) <= max ? selectedDay : '01';
    onChange(`2000-${m}-${day}`);
  }

  function handleDay(d: string | null) {
    if (!d || !selectedMonth) return;
    onChange(`2000-${selectedMonth}-${d}`);
  }

  return (
    <div className="flex gap-2">
      <Select value={selectedMonth} onValueChange={handleMonth}>
        <SelectTrigger className="flex-1 h-8 text-sm">
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={selectedDay} onValueChange={handleDay}>
        <SelectTrigger className="w-20 h-8 text-sm">
          <SelectValue placeholder="Day" />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: maxDays }, (_, i) => {
            const d = (i + 1).toString().padStart(2, '0');
            return <SelectItem key={d} value={d}>{i + 1}</SelectItem>;
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type Tab = 'details' | 'tasks' | 'resolved' | 'links' | 'schedules' | 'communications';

// ─── Company Notes section ────────────────────────────────────────────────────

function CompanyNotesSection({
  companyId,
  isAdmin,
  compact = false,
}: {
  companyId: number;
  isAdmin: boolean;
  compact?: boolean;
}) {
  const { data: notes = [] } = useNotes(companyId);
  const createNote = useCreateNote(companyId);
  const updateNote = useUpdateNote(companyId);
  const deleteNote = useDeleteNote(companyId);

  const [notesMaxH, setNotesMaxH] = useState(160);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  function onDragStart(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: notesMaxH };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientY - dragRef.current.startY;
      setNotesMaxH(Math.min(320, Math.max(72, dragRef.current.startH + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startAdd() { setAdding(true); setNewContent(''); }
  function cancelAdd() { setAdding(false); setNewContent(''); }

  function submitAdd() {
    const content = newContent.trim();
    if (!content) return;
    createNote.mutate({ companyId, content }, {
      onSuccess: () => { setAdding(false); setNewContent(''); },
    });
  }

  function startEdit(note: CompanyNote) {
    setEditingId(note.id);
    setEditContent(note.content);
  }

  function cancelEditNote() { setEditingId(null); setEditContent(''); }

  function submitEdit() {
    if (!editingId) return;
    const content = editContent.trim();
    if (!content) return;
    updateNote.mutate({ id: editingId, content }, {
      onSuccess: () => { setEditingId(null); setEditContent(''); },
    });
  }

  function confirmDelete(id: number) { setDeleteConfirmId(id); }

  function submitDelete() {
    if (!deleteConfirmId) return;
    deleteNote.mutate(deleteConfirmId, {
      onSuccess: () => setDeleteConfirmId(null),
    });
  }

  if (!isAdmin && notes.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border bg-amber-50/50 border-amber-200">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-amber-200">
        <span className="text-sm font-semibold text-amber-900">Notes</span>
        {isAdmin && !adding && !compact && (
          <button
            type="button"
            onClick={startAdd}
            className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 font-medium"
          >
            <Plus size={13} /> Add Note
          </button>
        )}
      </div>

      <div className="divide-y divide-amber-100 overflow-y-auto notes-scroll" style={{ maxHeight: compact ? 72 : notesMaxH }}>
        {/* Add note form */}
        {adding && (
          <div className="px-4 py-3 flex flex-col gap-2">
            <textarea
              autoFocus
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="Write a note…"
              rows={3}
              className="w-full text-sm rounded border border-amber-300 bg-white px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" onClick={submitAdd} disabled={createNote.isPending || !newContent.trim()}>
                Save
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelAdd}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {notes.length === 0 && !adding && (
          <p className="px-4 py-3 text-xs text-amber-700/70 italic">No notes yet.</p>
        )}

        {notes.map(note => (
          <div key={note.id} className="px-4 py-3">
            {editingId === note.id ? (
              <div className="flex flex-col gap-2">
                <textarea
                  autoFocus
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  rows={3}
                  className="w-full text-sm rounded border border-amber-300 bg-white px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={submitEdit} disabled={updateNote.isPending || !editContent.trim()}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEditNote}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : deleteConfirmId === note.id ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-destructive flex-1">Delete this note?</span>
                <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={submitDelete} disabled={deleteNote.isPending}>
                  Delete
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setDeleteConfirmId(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-amber-950 whitespace-pre-wrap break-words">{note.content}</p>
                  <p className="text-[11px] text-amber-600/70 mt-1">
                    {new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    {note.updatedAt !== note.createdAt && ' · edited'}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(note)}
                      className="p-1 rounded text-amber-600 hover:text-amber-900 hover:bg-amber-100"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDelete(note.id)}
                      className="p-1 rounded text-amber-600 hover:text-destructive hover:bg-red-50"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {!compact && (
        <div
          onMouseDown={onDragStart}
          className="flex items-center justify-center h-4 cursor-row-resize select-none border-t border-amber-100 hover:bg-amber-100/60 transition-colors rounded-b-lg"
        >
          <GripHorizontal size={14} className="text-amber-300" />
        </div>
      )}
    </div>
  );
}

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
    { key: 'links', label: 'Links' },
    { key: 'schedules' as Tab, label: 'Schedules' },
    { key: 'communications' as Tab, label: 'Communications' },
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

// ─── Links section ───────────────────────────────────────────────────────────

function LinkPasswordField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Optional"
        className="pr-10"
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function LinksSection({ companyId }: { companyId: number }) {
  const { data: links = [], isLoading } = useLinks(companyId);
  const createMutation = useCreateLink(companyId);
  const updateMutation = useUpdateLink(companyId);
  const deleteMutation = useDeleteLink(companyId);

  const [addOpen, setAddOpen] = useState(false);
  const [addLabel, setAddLabel] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addUsername, setAddUsername] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addNote, setAddNote] = useState('');

  const [editId, setEditId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editNote, setEditNote] = useState('');

  const [deleteId, setDeleteId] = useState<number | null>(null);
  // Ids of links whose password is currently revealed (per-row eye toggle).
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  function toggleReveal(id: number) {
    setRevealed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function faviconUrl(url: string) {
    try {
      const domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch {
      return null;
    }
  }

  function resetAdd() {
    setAddOpen(false);
    setAddLabel('');
    setAddUrl('');
    setAddUsername('');
    setAddPassword('');
    setAddNote('');
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addLabel || !addUrl) return;
    createMutation.mutate(
      {
        companyId,
        label: addLabel,
        url: addUrl,
        username: addUsername.trim() || undefined,
        password: addPassword || undefined,
        note: addNote.trim() || undefined,
      },
      { onSuccess: resetAdd },
    );
  }

  function openEdit(link: CompanyLink) {
    setEditId(link.id);
    setEditLabel(link.label);
    setEditUrl(link.url);
    setEditUsername(link.username ?? '');
    setEditPassword(link.password ?? '');
    setEditNote(link.note ?? '');
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    updateMutation.mutate(
      {
        id: editId,
        data: {
          label: editLabel,
          url: editUrl,
          username: editUsername.trim(),
          password: editPassword,
          note: editNote.trim(),
        },
      },
      { onSuccess: () => setEditId(null) },
    );
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading links…</p>;

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddOpen(v => !v)}>
          <Plus size={14} /> Add Link
        </Button>
      </div>

      {/* Inline add form */}
      {addOpen && (
        <form onSubmit={handleAdd} className="rounded-lg border bg-muted/30 p-4 flex flex-col gap-3">
          <p className="text-sm font-medium">New Link</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-link-label">Label</Label>
            <Input
              id="add-link-label"
              value={addLabel}
              onChange={e => setAddLabel(e.target.value)}
              placeholder="e.g. TD Bank"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-link-url">URL</Label>
            <Input
              id="add-link-url"
              value={addUrl}
              onChange={e => setAddUrl(e.target.value)}
              placeholder="https://..."
              maxLength={2048}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-link-username">Username <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="add-link-username"
              value={addUsername}
              onChange={e => setAddUsername(e.target.value)}
              placeholder="Optional"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-link-password">Password <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <LinkPasswordField id="add-link-password" value={addPassword} onChange={setAddPassword} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-link-note">Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              id="add-link-note"
              value={addNote}
              onChange={e => setAddNote(e.target.value)}
              placeholder="Optional"
              rows={2}
            />
          </div>
          {createMutation.isError && (
            <p className="text-xs text-destructive">
              {createMutation.error instanceof Error ? createMutation.error.message : 'Error'}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={resetAdd}>Cancel</Button>
            <Button type="submit" size="sm" disabled={!addLabel || !addUrl || createMutation.isPending}>
              {createMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      )}

      {/* Empty state */}
      {links.length === 0 && !addOpen && (
        <p className="text-sm text-muted-foreground">No links added yet.</p>
      )}

      {/* Links list */}
      {links.map(link => (
        <div key={link.id}>
          {editId === link.id ? (
            <form onSubmit={handleUpdate} className="rounded-lg border bg-muted/30 p-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Label</Label>
                <Input value={editLabel} onChange={e => setEditLabel(e.target.value)} autoFocus />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>URL</Label>
                <Input value={editUrl} onChange={e => setEditUrl(e.target.value)} maxLength={2048} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Username <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input value={editUsername} onChange={e => setEditUsername(e.target.value)} placeholder="Optional" autoComplete="off" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Password <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <LinkPasswordField id={`edit-link-password-${link.id}`} value={editPassword} onChange={setEditPassword} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Optional" rows={2} />
              </div>
              {updateMutation.isError && (
                <p className="text-xs text-destructive">
                  {updateMutation.error instanceof Error ? updateMutation.error.message : 'Error'}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditId(null)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="rounded-lg border bg-background px-4 py-3 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                {faviconUrl(link.url) && (
                  <img
                    src={faviconUrl(link.url)!}
                    alt=""
                    aria-hidden
                    className="w-5 h-5 shrink-0 rounded-sm object-contain"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <a
                  href={link.url.startsWith('http') ? link.url : `https://${link.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-sm font-medium hover:underline flex items-center gap-1.5"
                >
                  {link.label}
                  <ExternalLink size={12} className="text-muted-foreground" />
                </a>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Edit link"
                    onClick={() => openEdit(link)}
                    className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    title="Delete link"
                    onClick={() => setDeleteId(link.id)}
                    className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Credentials + note */}
              {(link.username || link.password || link.note) && (
                <div className="pl-8 flex flex-col gap-1.5 text-xs">
                  {link.username && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-16 shrink-0">Username</span>
                      <span className="font-medium break-all">{link.username}</span>
                    </div>
                  )}
                  {link.password && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-16 shrink-0">Password</span>
                      <span className="font-medium font-mono break-all">
                        {revealed.has(link.id) ? link.password : '••••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleReveal(link.id)}
                        className="flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={revealed.has(link.id) ? 'Hide password' : 'Show password'}
                      >
                        {revealed.has(link.id) ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  )}
                  {link.note && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground w-16 shrink-0">Note</span>
                      <span className="whitespace-pre-wrap break-words">{link.note}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Delete confirm dialog */}
      <Dialog open={deleteId !== null} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Link</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <span className="font-medium text-foreground">
              {links.find(l => l.id === deleteId)?.label}
            </span>?
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteId !== null) {
                  deleteMutation.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
                }
              }}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Schedules section (admin only) ──────────────────────────────────────────

type CycleTypeLocal = 'DAYS' | 'MONTHLY_DATE' | 'WEEKLY_DAY' | 'MONTHLY_WEEKDAY' | 'QUARTERLY' | 'YEARLY';

function SchedulesSection({
  companyId,
  schedules,
  isAdmin,
  onDeleteSchedule,
}: {
  companyId: number;
  schedules: AppTaskSchedule[];
  isAdmin: boolean;
  onDeleteSchedule: (id: number) => void;
}) {
  const updateMutation = useUpdateSchedule(companyId);
  const toggleMutation = useToggleSchedule(companyId);
  const toggleImportantMutation = useToggleScheduleImportant(companyId);
  const updateUserNoteMutation = useUpdateScheduleUserNote(companyId);
  const [confirmDeleteScheduleId, setConfirmDeleteScheduleId] = useState<number | null>(null);

  const [editId, setEditId] = useState<number | null>(null);
  const [editCycleType, setEditCycleType] = useState<CycleTypeLocal>('DAYS');
  const [editCycle, setEditCycle] = useState('');
  const [editCycleDay, setEditCycleDay] = useState(0);
  const [editCycleNth, setEditCycleNth] = useState(1);
  const [editNote, setEditNote] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [userNoteEditId, setUserNoteEditId] = useState<number | null>(null);
  const [userNoteInput, setUserNoteInput] = useState('');
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const filtered = query
    ? schedules.filter(
        s =>
          s.task.title.toLowerCase().includes(query) ||
          (s.note ?? '').toLowerCase().includes(query),
      )
    : schedules;

  const byOrderNumber = (a: AppTaskSchedule, b: AppTaskSchedule) => {
    const an = a.task.orderNumber ?? Infinity;
    const bn = b.task.orderNumber ?? Infinity;
    if (an !== bn) return an - bn;
    return a.task.title.localeCompare(b.task.title);
  };
  const active = filtered.filter(s => !s.deletedAt).sort(byOrderNumber);
  const disabled = filtered.filter(s => !!s.deletedAt).sort(byOrderNumber);

  if (schedules.length === 0) {
    return <p className="text-sm text-muted-foreground">No recurring schedules set up for this company yet.</p>;
  }

  function renderSchedule(s: AppTaskSchedule) {
    const isDisabled = !!s.deletedAt;
    const isCustom = !!s.isManuallyAdded;
    return (
      <div
        key={s.id}
        className={`rounded-lg border px-4 py-3 flex items-start gap-3 transition-opacity ${
          isDisabled
            ? 'bg-muted/40 border-muted-foreground/20 opacity-60'
            : isCustom
            ? 'bg-teal-50/60 border-teal-200'
            : 'bg-blue-50/60 border-blue-200'
        }`}
      >
        <RefreshCw
          size={14}
          className={`shrink-0 mt-1 ${isDisabled ? 'text-muted-foreground' : isCustom ? 'text-teal-500' : 'text-blue-500'}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-medium leading-snug flex items-center gap-2 ${isDisabled ? 'line-through text-muted-foreground' : ''}`}>
              {s.task.orderNumber != null && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-semibold shrink-0">
                  {s.task.orderNumber}
                </span>
              )}
              {s.task.title}
            </p>
            {isCustom && !isDisabled && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-teal-50 text-teal-700 border-teal-300">
                Custom
              </span>
            )}
            {s.isImportant && !isDisabled && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-300">
                Important
              </span>
            )}
          </div>
          {editId === s.id ? (
            <div className="flex flex-col gap-2 mt-1.5">
              {/* Cycle type selector */}
              <Select value={editCycleType} onValueChange={v => setEditCycleType(v as CycleTypeLocal)}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAYS">Every N days</SelectItem>
                  <SelectItem value="MONTHLY_DATE">Day of month</SelectItem>
                  <SelectItem value="WEEKLY_DAY">Day of week</SelectItem>
                  <SelectItem value="MONTHLY_WEEKDAY">Nth weekday of month</SelectItem>
                  <SelectItem value="QUARTERLY">Quarterly — specific date</SelectItem>
                  <SelectItem value="YEARLY">Yearly — specific date</SelectItem>
                </SelectContent>
              </Select>

              {/* Contextual cycle inputs */}
              {editCycleType === 'DAYS' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Every</span>
                  <Input
                    type="number"
                    min={1}
                    value={editCycle}
                    onChange={e => setEditCycle(e.target.value)}
                    className="h-7 w-20 text-xs px-2"
                    autoFocus
                  />
                  <span className="text-xs text-muted-foreground">days</span>
                </div>
              )}
              {editCycleType === 'MONTHLY_DATE' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Day</span>
                  <MonthDaySelect
                    value={editCycleDay}
                    onChange={setEditCycleDay}
                    className="h-7 w-36 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">of each month</span>
                </div>
              )}
              {editCycleType === 'WEEKLY_DAY' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Every</span>
                  <Select value={String(editCycleDay)} onValueChange={v => setEditCycleDay(Number(v))}>
                    <SelectTrigger className="h-7 text-xs w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((day, i) => (
                        <SelectItem key={i} value={String(i)}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editCycleType === 'MONTHLY_WEEKDAY' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Every</span>
                  <Select value={String(editCycleNth)} onValueChange={v => setEditCycleNth(Number(v))}>
                    <SelectTrigger className="h-7 text-xs w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map(n => (
                        <SelectItem key={n} value={String(n)}>{ordinal(n)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={String(editCycleDay)} onValueChange={v => setEditCycleDay(Number(v))}>
                    <SelectTrigger className="h-7 text-xs w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((day, i) => (
                        <SelectItem key={i} value={String(i)}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editCycleType === 'QUARTERLY' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Day</span>
                  <MonthDaySelect
                    value={editCycleDay}
                    onChange={setEditCycleDay}
                    className="h-7 w-36 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">of month (every 3 months)</span>
                </div>
              )}
              {editCycleType === 'YEARLY' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={String(editCycleNth)} onValueChange={v => setEditCycleNth(Number(v))}>
                    <SelectTrigger className="h-7 text-xs w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <MonthDaySelect
                    value={editCycleDay}
                    onChange={setEditCycleDay}
                    className="h-7 w-36 text-xs"
                  />
                </div>
              )}

              <Textarea
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                placeholder="Company-specific note (optional)…"
                className="text-xs min-h-[4.5rem]"
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Start date (optional)</span>
                <div className="flex items-center gap-1.5">
                  <Popover>
                    <PopoverTrigger className="inline-flex h-7 items-center gap-1.5 w-44 justify-start rounded-md border border-input bg-background px-2 text-xs font-normal shadow-xs hover:bg-accent hover:text-accent-foreground">
                      <CalendarIcon size={12} />
                      {editStartDate
                        ? format(new Date(editStartDate + 'T00:00:00'), 'MMM d, yyyy')
                        : 'Pick a date'}
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={editStartDate ? new Date(editStartDate + 'T00:00:00') : undefined}
                        onSelect={date => setEditStartDate(date ? format(date, 'yyyy-MM-dd') : '')}
                        captionLayout="dropdown"
                        startMonth={new Date(2020, 0)}
                        endMonth={new Date(new Date().getFullYear() + 3, 11)}
                        classNames={{ today: 'rounded-md bg-muted text-foreground ring-2 ring-primary/50' }}
                      />
                    </PopoverContent>
                  </Popover>
                  {editStartDate && (
                    <button
                      type="button"
                      onClick={() => setEditStartDate('')}
                      className="text-muted-foreground hover:text-foreground"
                      title="Clear start date"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">Past dates will backfill all todos up to today.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs px-2"
                  disabled={updateMutation.isPending}
                  onClick={() => {
                    const payload: {
                      id: number;
                      cycleType: CycleTypeLocal;
                      cycle?: number;
                      cycleDay?: number | null;
                      cycleNth?: number | null;
                      note: string | null;
                      startDate: string | null;
                    } = { id: s.id, cycleType: editCycleType, note: editNote.trim() || null, startDate: editStartDate || null };

                    if (editCycleType === 'DAYS') {
                      const n = Number(editCycle);
                      if (n < 1) return;
                      payload.cycle = n;
                      payload.cycleDay = null;
                      payload.cycleNth = null;
                    } else if (editCycleType === 'MONTHLY_DATE') {
                      payload.cycleDay = editCycleDay;
                      payload.cycleNth = null;
                    } else if (editCycleType === 'WEEKLY_DAY') {
                      payload.cycleDay = editCycleDay;
                      payload.cycleNth = null;
                    } else if (editCycleType === 'QUARTERLY') {
                      payload.cycleDay = editCycleDay;
                      payload.cycleNth = null;
                    } else if (editCycleType === 'YEARLY') {
                      payload.cycleDay = editCycleDay;
                      payload.cycleNth = editCycleNth;
                    } else {
                      payload.cycleDay = editCycleDay;
                      payload.cycleNth = editCycleNth;
                    }

                    updateMutation.mutate(payload as any, { onSuccess: () => setEditId(null) });
                  }}
                >
                  {updateMutation.isPending ? 'Saving…' : 'Save'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditId(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-0.5">
              <p className="text-xs text-muted-foreground">{formatCycle(s)}</p>
              {s.nextTodoDate && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Next: {formatDate(s.nextTodoDate)}
                </p>
              )}
              {isAdmin && s.startDate && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Start date: {formatDate(s.startDate)}
                </p>
              )}
              {s.note && (
                <p className={`text-xs rounded px-2 py-1 mt-1 whitespace-pre-wrap leading-relaxed border ${
                  isDisabled
                    ? 'text-muted-foreground bg-muted/60 border-muted-foreground/20'
                    : 'text-amber-700 bg-amber-50 border-amber-200'
                }`}>
                  📝 {renderWithLinks(s.note)}
                </p>
              )}
              {/* Shared user note (teal) */}
              {s.userNote && (
                <p className={`text-xs rounded px-2 py-1 mt-1 whitespace-pre-wrap leading-relaxed border ${
                  isDisabled
                    ? 'text-muted-foreground bg-muted/60 border-muted-foreground/20'
                    : 'text-teal-700 bg-teal-50 border-teal-200'
                }`}>
                  🗒️ {renderWithLinks(s.userNote)}
                </p>
              )}
              {/* User note edit/add form */}
              {userNoteEditId === s.id ? (
                <div className="flex flex-col gap-1.5 mt-1.5">
                  <Textarea
                    value={userNoteInput}
                    onChange={e => setUserNoteInput(e.target.value)}
                    placeholder="Add a note…"
                    className="text-xs min-h-[4.5rem]"
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs px-2"
                      disabled={updateUserNoteMutation.isPending}
                      onClick={() => {
                        updateUserNoteMutation.mutate(
                          { id: s.id, note: userNoteInput.trim() || null },
                          { onSuccess: () => setUserNoteEditId(null) },
                        );
                      }}
                    >
                      {updateUserNoteMutation.isPending ? 'Saving…' : 'Save'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-2"
                      onClick={() => setUserNoteEditId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                !isDisabled && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserNoteEditId(s.id);
                      setUserNoteInput(s.userNote ?? '');
                    }}
                    className="text-xs text-muted-foreground hover:text-teal-600 mt-1 inline-flex items-center gap-1"
                  >
                    <Pencil size={11} />
                    {s.userNote ? 'Edit note' : 'Add note'}
                  </button>
                )
              )}
              {isDisabled && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground mt-1">
                  <Ban size={10} /> Disabled
                </span>
              )}
            </div>
          )}
        </div>
        {editId !== s.id && isAdmin && (
          <div className="flex items-center gap-1 shrink-0">
            {!isDisabled && (
              <>
                <button
                  type="button"
                  title={s.isImportant ? 'Remove important' : 'Mark as important'}
                  disabled={toggleImportantMutation.isPending}
                  onClick={() => toggleImportantMutation.mutate(s.id)}
                  className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold transition-colors ${
                    s.isImportant
                      ? 'text-amber-600 bg-amber-100 hover:bg-amber-200'
                      : 'text-muted-foreground hover:text-amber-600 hover:bg-amber-50'
                  }`}
                >
                  !
                </button>
                <button
                  type="button"
                  title="Edit schedule"
                  onClick={() => {
                    setEditId(s.id);
                    setEditCycleType(s.cycleType as CycleTypeLocal);
                    setEditCycle(String(s.cycle));
                    setEditCycleDay(s.cycleDay != null && s.cycleDay > 28 ? 0 : (s.cycleDay ?? 0));
                    setEditCycleNth(s.cycleNth ?? 1);
                    setEditNote(s.note ?? '');
                    setEditStartDate(s.startDate ? s.startDate.slice(0, 10) : '');
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Pencil size={13} />
                </button>
              </>
            )}
            {s.task.canBeDisabled && (
              <button
                type="button"
                title={isDisabled ? 'Enable schedule' : 'Disable schedule'}
                disabled={toggleMutation.isPending}
                onClick={() => toggleMutation.mutate(s.id)}
                className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                  isDisabled
                    ? 'text-muted-foreground hover:text-green-600 hover:bg-green-50'
                    : 'text-muted-foreground hover:text-orange-600 hover:bg-orange-50'
                }`}
              >
                {isDisabled ? <Power size={13} /> : <Ban size={13} />}
              </button>
            )}
            {isCustom && (
              <button
                type="button"
                title="Delete custom schedule"
                onClick={() => setConfirmDeleteScheduleId(s.id)}
                className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search bar */}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search schedules…"
          className="h-8 pl-8 text-xs"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No schedules match your search.</p>
      )}

      {active.length > 0 && (
        <div className="flex flex-col gap-2">
          {active.map(s => renderSchedule(s))}
        </div>
      )}

      {disabled.length > 0 && (
        <div className="flex flex-col gap-2">
          {active.length > 0 && (
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-1">Disabled</p>
          )}
          {disabled.map(s => renderSchedule(s))}
        </div>
      )}

      {/* Delete custom schedule confirmation */}
      <Dialog open={confirmDeleteScheduleId !== null} onOpenChange={open => { if (!open) setConfirmDeleteScheduleId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Custom Schedule</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove this custom schedule and its open todos? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDeleteScheduleId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirmDeleteScheduleId !== null) {
                  onDeleteSchedule(confirmDeleteScheduleId);
                  setConfirmDeleteScheduleId(null);
                }
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const companyId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const uiKey = `cmp-ui-${companyId}`;
  const getStoredUI = () => {
    try { return JSON.parse(localStorage.getItem(uiKey) ?? '{}'); } catch { return {}; }
  };

  type TaskSort = 'priority' | 'az' | 'za' | 'overdue' | 'number_asc' | 'number_desc';
  const [tab, setTab] = useState<Tab>(() => getStoredUI().tab ?? 'tasks');
  const [headerCollapsed, setHeaderCollapsed] = useState<boolean>(() => getGlobalUI().headerCollapsed ?? false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [expandSignal, setExpandSignal] = useState<{ expanded: boolean; seq: number }>(() => ({ expanded: getGlobalUI().expandedAll ?? true, seq: 0 }));
  const [snoozedExpanded, setSnoozedExpanded] = useState<boolean>(() => getGlobalUI().snoozedExpanded ?? false);
  const [taskSort, setTaskSort] = useState<TaskSort>(() => getGlobalUI().taskSort ?? 'priority');
  const [todoSearch, setTodoSearch] = useState('');
  const tasksAllExpanded = expandSignal.seq === 0 || expandSignal.expanded;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: company, isLoading, isError } = useCompany(companyId);
  const { data: users = [] } = useUsers();
  const { data: schedules = [] } = useTaskSchedules(companyId);
  const assignMutation = useAssignCompany();
  const updateCompanyMutation = useUpdateCompany();
  const deleteCompanyMutation = useDeleteCompany();
  const restoreMutation = useRestoreCompany();
  const permDeleteMutation = usePermanentDeleteCompany();
  const [showPermDeleteConfirm, setShowPermDeleteConfirm] = useState(false);
  const resolveMutation = useResolveTodo(companyId);
  const deleteMutation = useDeleteTodo(companyId);
  const setCycleMutation = useSetTodoCycle(companyId);
  const removeCycleMutation = useRemoveTodoCycle(companyId);
  const snoozeMutation = useSnoozeTodo(companyId);
  const unsnoozeMutation = useUnsnoozeTodo(companyId);
  const deleteScheduleMutation = useDeleteSchedule(companyId);

  type EditSection = 'info' | 'contact' | 'legal' | 'accountant' | 'billing' | null;
  const [editSection, setEditSection] = useState<EditSection>(null);

  const [infoForm, setInfoForm] = useState({
    businessName: '', country: '', businessType: '', companyType: '',
    companyActivity: '', qbPlan: '', supportNumber: '',
  });
  const [contactForm, setContactForm] = useState({
    personalName: '', privateEmail: '', privatePhone: '', storeNumber: '',
  });
  const [legalForm, setLegalForm] = useState({
    neq: '', revenueQcId: '', craBn: '', fiscalYear: '',
  });
  const [accountantForm, setAccountantForm] = useState({
    accountantName: '', accountantEmail: '', accountantPhone: '',
  });
  const [billingForm, setBillingForm] = useState({ billingEmail: '', billingPassword: '' });
  const [showBillingPw, setShowBillingPw] = useState(false);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [disconnectGmailConfirmOpen, setDisconnectGmailConfirmOpen] = useState(false);

  const { data: gmailAccount } = useGmailAccount(companyId);
  const { data: uncompletedData } = useGmailUncompletedCount(companyId, gmailAccount);
  const disconnectGmailMutation = useDisconnectGmail(companyId);

  const handleConnectGmail = useCallback(async () => {
    if (!token) return;
    setConnectingGmail(true);
    try {
      const { authUrl } = await fetchAuthUrl(token, companyId);
      const popup = window.open(authUrl, 'gmail-oauth', 'width=500,height=600,noopener');
      const onMessage = (e: MessageEvent<{ type: string }>) => {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type === 'gmail-connected' || e.data?.type === 'gmail-error') {
          void qc.invalidateQueries({ queryKey: ['gmail-account', companyId] });
          setConnectingGmail(false);
          window.removeEventListener('message', onMessage);
        }
      };
      window.addEventListener('message', onMessage);
      const poll = setInterval(() => {
        if (popup?.closed) {
          clearInterval(poll);
          setConnectingGmail(false);
          window.removeEventListener('message', onMessage);
        }
      }, 500);
    } catch {
      setConnectingGmail(false);
    }
  }, [token, companyId, qc]);

  // Persist per-company tab to localStorage
  useEffect(() => {
    try { localStorage.setItem(uiKey, JSON.stringify({ tab })); } catch {}
  }, [tab, uiKey]);

  // Persist global UI prefs (shared across all companies) to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(GLOBAL_UI_KEY, JSON.stringify({ taskSort, headerCollapsed, snoozedExpanded, expandedAll: expandSignal.expanded }));
    } catch {}
  }, [taskSort, headerCollapsed, snoozedExpanded, expandSignal.expanded]);

  // Reload prefs when navigating between companies (component reuses the same instance)
  useEffect(() => {
    const s = getStoredUI();
    const g = getGlobalUI();
    setTab(s.tab ?? 'tasks');
    setTaskSort(g.taskSort ?? 'priority');
    setHeaderCollapsed(g.headerCollapsed ?? false);
    setSnoozedExpanded(g.snoozedExpanded ?? false);
    setExpandSignal({ expanded: g.expandedAll ?? true, seq: 0 });
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit(section: EditSection) {
    if (!company) return;
    if (section === 'info') {
      setInfoForm({
        businessName:    company.businessName ?? '',
        country:         company.country ?? '',
        businessType:    company.businessType ?? '',
        companyType:     company.companyType ?? '',
        companyActivity: company.companyActivity ?? '',
        qbPlan:          company.qbPlan ?? '',
        supportNumber:   company.supportNumber ?? '',
      });
    } else if (section === 'contact') {
      setContactForm({
        personalName: company.contactInfo?.personalName ?? '',
        privateEmail: company.contactInfo?.privateEmail ?? '',
        privatePhone: company.contactInfo?.privatePhone ?? '',
        storeNumber:  company.contactInfo?.storeNumber  ?? '',
      });
    } else if (section === 'legal') {
      const fy = company.legalInfo?.fiscalYear;
      const fyVal = fy ? fy.substring(0, 10) : ''; // keep "2000-MM-DD"
      setLegalForm({
        neq:         company.legalInfo?.neq         ?? '',
        revenueQcId: company.legalInfo?.revenueQcId ?? '',
        craBn:       company.legalInfo?.craBn       ?? '',
        fiscalYear:  fyVal,
      });
    } else if (section === 'accountant') {
      setAccountantForm({
        accountantName:  company.accountant?.name  ?? '',
        accountantEmail: company.accountant?.email ?? '',
        accountantPhone: company.accountant?.phone ?? '',
      });
    } else if (section === 'billing') {
      setBillingForm({
        billingEmail:    company.billing?.billingEmail    ?? '',
        billingPassword: '',
      });
    }
    setEditSection(section);
  }

  function cancelEdit() { setEditSection(null); }

  function saveSection(section: EditSection) {
    if (!section) return;
    const data = section === 'info'       ? infoForm
               : section === 'contact'    ? contactForm
               : section === 'legal'      ? legalForm
               : section === 'accountant' ? accountantForm
               : billingForm;
    updateCompanyMutation.mutate(
      { id: companyId, data },
      { onSuccess: () => setEditSection(null) },
    );
  }

  if (isLoading) return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;
  if (isError || !company) return <div className="p-8 text-destructive text-sm">Company not found.</div>;

  const regularUsers = users.filter(u => u.role === 'USER');
  const now = new Date();
  function isSnoozedNow(todo: TodoItem): boolean {
    return !!todo.snoozedUntil && new Date(todo.snoozedUntil) > now;
  }

  const resolvedTodos = company.todos.filter(t => t.resolved);
  // openTodos sorted after scheduleMap is built — see below

  // Build a map: scheduleId → schedule — active only so disabled schedules don't surface notes
  const scheduleMap = new Map<number, AppTaskSchedule>(
    schedules.filter((s: AppTaskSchedule) => !s.deletedAt)
      .map((s: AppTaskSchedule) => [s.id, s])
  );

  function getSchedule(todo: TodoItem): AppTaskSchedule | null {
    if (!todo.scheduleId) return null;
    return scheduleMap.get(todo.scheduleId) ?? null;
  }

  function getOverdueDays(todo: TodoItem): number {
    if (!todo.dueDate) return 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(todo.dueDate.slice(0, 10) + 'T00:00:00');
    return (today.getTime() - due.getTime()) / 86_400_000;
  }

  function getTodoPriority(todo: TodoItem): number {
    const isImportant = getSchedule(todo)?.isImportant ?? false;
    const isUrgent = getTodoUrgency(todo.dueDate) === 'urgent';
    if (isImportant && isUrgent) return 0;
    if (isUrgent) return 1;
    if (isImportant) return 2;
    return 3;
  }

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const openTodos = company.todos
    .filter(t => {
      if (t.resolved || isSnoozedNow(t)) return false;
      if (!t.dueDate) return true;
      return new Date(t.dueDate.slice(0, 10) + 'T00:00:00') <= startOfToday;
    })
    .sort((a, b) => {
      const pa = getTodoPriority(a), pb = getTodoPriority(b);
      if (pa !== pb) return pa - pb;
      return getOverdueDays(b) - getOverdueDays(a);
    });

  const snoozedTodos = company.todos.filter(t => !t.resolved && isSnoozedNow(t));

  const todoSearchQuery = todoSearch.trim().toLowerCase();
  const visibleTodos = todoSearchQuery
    ? openTodos.filter(t => t.task.title.toLowerCase().includes(todoSearchQuery))
    : openTodos;

  const sortedTodos = taskSort === 'az'          ? [...visibleTodos].sort((a, b) => a.task.title.localeCompare(b.task.title))
                   : taskSort === 'za'          ? [...visibleTodos].sort((a, b) => b.task.title.localeCompare(a.task.title))
                   : taskSort === 'overdue'     ? [...visibleTodos].sort((a, b) => getOverdueDays(b) - getOverdueDays(a))
                   : taskSort === 'number_asc'  ? [...visibleTodos].sort((a, b) => {
                       const an = a.task.orderNumber ?? Infinity;
                       const bn = b.task.orderNumber ?? Infinity;
                       return an !== bn ? an - bn : a.task.title.localeCompare(b.task.title);
                     })
                   : taskSort === 'number_desc' ? [...visibleTodos].sort((a, b) => {
                       const an = a.task.orderNumber ?? -Infinity;
                       const bn = b.task.orderNumber ?? -Infinity;
                       return an !== bn ? bn - an : a.task.title.localeCompare(b.task.title);
                     })
                   : visibleTodos;

  const urgentTodos        = taskSort === 'priority' ? visibleTodos.filter(t => getTodoPriority(t) <= 1) : [];
  const importantOnlyTodos = taskSort === 'priority' ? visibleTodos.filter(t => getTodoPriority(t) === 2) : [];
  const restTodos          = taskSort === 'priority' ? visibleTodos.filter(t => getTodoPriority(t) === 3) : [];
  const importantCount     = openTodos.filter(t => getSchedule(t)?.isImportant ?? false).length;

  function handleAssign(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    assignMutation.mutate({ companyId, userId: val === '' ? null : Number(val) });
  }

  function todoRowProps(todo: TodoItem) {
    const sched = getSchedule(todo);
    return {
      todo,
      schedule: sched,
      adminNote: sched?.note ?? null,
      userNote: sched?.userNote ?? null,
      isAdmin,
      isImportant: sched?.isImportant ?? false,
      onToggle: () => resolveMutation.mutate(todo.id),
      togglePending: resolveMutation.isPending,
      onDelete: () => deleteMutation.mutate(todo.id),
      onSetCycle: (cycle: number) => setCycleMutation.mutate({ id: todo.id, cycle }),
      onRemoveCycle: () => removeCycleMutation.mutate(todo.id),
      onSnooze: (days: number) => snoozeMutation.mutate({ id: todo.id, days }),
      expandSignal,
    };
  }

  const isArchived = !!company.deletedAt;

  return (
    <div className="flex flex-col h-full">
      {/* Archive banner */}
      {isArchived && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center gap-3">
          <Archive size={15} className="text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            This company was archived on{' '}
            <span className="font-medium">
              {new Date(company.deletedAt!).toLocaleDateString(undefined, {
                month: 'long', day: 'numeric', year: 'numeric',
              })}
            </span>
            . It is hidden from the main list.
          </p>
          {isAdmin && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
                disabled={restoreMutation.isPending}
                onClick={() => restoreMutation.mutate(companyId, { onSuccess: () => navigate('/admin/archived') })}
              >
                <RefreshCw size={12} /> Restore
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5 border-red-300 text-destructive hover:bg-red-50"
                onClick={() => setShowPermDeleteConfirm(true)}
              >
                <Trash2 size={12} /> Delete Permanently
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Page header */}
      <div className={headerCollapsed ? 'px-6 pt-3 pb-0' : 'px-6 pt-6 pb-0'}>
        <div className="flex items-center gap-3 mb-1">
          <button
            type="button"
            onClick={() => setHeaderCollapsed(c => !c)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            title={headerCollapsed ? 'Expand header' : 'Collapse header'}
          >
            {headerCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          <h1 className="text-2xl font-bold">{company.businessName}</h1>
          <Badge variant={company.status ? 'default' : 'secondary'}>
            {company.status ? 'Active' : 'Inactive'}
          </Badge>
          {isAdmin && !isArchived && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 size={14} />
              Delete Company
            </Button>
          )}
        </div>
        {!headerCollapsed && (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {company.country ?? '—'} · Registered {formatDate(company.createdAt)} ·{' '}
              {company.assignedUser
                ? <>Assigned to <span className="font-medium text-foreground">{company.assignedUser.name}</span></>
                : <span className="text-orange-600 font-medium">Unassigned</span>
              }
              {isAdmin && (
                <>
                  {' · '}
                  {company.supportNumber
                    ? <span className="font-medium text-foreground">{company.supportNumber}</span>
                    : <span className="text-orange-600 font-medium">No support number</span>
                  }
                </>
              )}
            </p>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg border bg-background px-4 py-3 text-center">
                <p className="text-2xl font-bold">{openTodos.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Open Tasks</p>
              </div>
              <div className="rounded-lg border bg-background px-4 py-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{importantCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Important</p>
              </div>
              <div className="rounded-lg border bg-background px-4 py-3 text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {openTodos.filter(t => getTodoUrgency(t.dueDate) === 'urgent').length}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Overdue 25 days</p>
              </div>
              <div className="rounded-lg border bg-background px-4 py-3 text-center">
                <p className="text-2xl font-bold text-red-600">
                  {gmailAccount ? (uncompletedData?.count ?? 0) : '—'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Uncompleted</p>
              </div>
            </div>

          </>
        )}

        {headerCollapsed && (
          <div className="flex items-center gap-4 py-1 text-xs">
            <span className="font-medium text-foreground">{openTodos.length} open</span>
            <span className="text-amber-600 font-medium">{importantCount} important</span>
            <span className="text-purple-600 font-medium">
              {openTodos.filter(t => getTodoUrgency(t.dueDate) === 'urgent').length} overdue 25d
            </span>
            {gmailAccount && (
              <span className="text-red-600 font-medium">
                {uncompletedData?.count ?? 0} uncompleted
              </span>
            )}
          </div>
        )}

        <CompanyNotesSection companyId={companyId} isAdmin={isAdmin} compact={headerCollapsed} />

        <TabBar
          active={tab}
          onChange={setTab}
          openCount={openTodos.length}
          resolvedCount={resolvedTodos.length}
        />
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">

        {/* ── Details tab ── */}
        {tab === 'details' && (
          <div className="flex flex-col gap-4 max-w-3xl">

            {/* Company Info */}
            <Card>
              {isAdmin ? (
                <EditableCardHeader
                  title="Company Info"
                  editing={editSection === 'info'}
                  saving={updateCompanyMutation.isPending}
                  onEdit={() => startEdit('info')}
                  onSave={() => saveSection('info')}
                  onCancel={cancelEdit}
                  error={editSection === 'info' && updateCompanyMutation.isError
                    ? (updateCompanyMutation.error instanceof Error ? updateCompanyMutation.error.message : 'Error')
                    : null}
                />
              ) : (
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Company Info</CardTitle>
                </CardHeader>
              )}
              <CardContent>
                {editSection === 'info' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Business Name</Label>
                      <Input className="h-8 text-sm" value={infoForm.businessName}
                        onChange={e => setInfoForm(f => ({ ...f, businessName: e.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Country</Label>
                      <Select value={infoForm.country || null}
                        onValueChange={v => setInfoForm(f => ({ ...f, country: v ?? '' }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USA">USA</SelectItem>
                          <SelectItem value="CANADA">Canada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Business Type</Label>
                      <Select value={infoForm.businessType || null}
                        onValueChange={v => setInfoForm(f => ({ ...f, businessType: v ?? '' }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          {BUSINESS_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Company Type</Label>
                      <Select value={infoForm.companyType || null}
                        onValueChange={v => setInfoForm(f => ({ ...f, companyType: v ?? '' }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          {COMPANY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">QB Plan</Label>
                      <Input className="h-8 text-sm" value={infoForm.qbPlan}
                        onChange={e => setInfoForm(f => ({ ...f, qbPlan: e.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Support Number</Label>
                      <Input className="h-8 text-sm" value={infoForm.supportNumber}
                        placeholder="+15141234567"
                        onChange={e => setInfoForm(f => ({ ...f, supportNumber: e.target.value }))} />
                    </div>
                    <div className="col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Business Activity</Label>
                      <textarea
                        value={infoForm.companyActivity}
                        onChange={e => setInfoForm(f => ({ ...f, companyActivity: e.target.value }))}
                        rows={3}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <Field label="Business Name"  value={company.businessName} />
                    <Field label="Country"        value={company.country} />
                    <Field label="Business Type"  value={BUSINESS_TYPES.find(t => t.value === company.businessType)?.label ?? company.businessType} />
                    <Field label="Company Type"   value={COMPANY_TYPES.find(t => t.value === company.companyType)?.label ?? company.companyType} />
                    <Field label="QB Plan"        value={company.qbPlan} />
                    <Field label="Support #"      value={company.supportNumber} />
                    {company.companyActivity && (
                      <div className="col-span-2 sm:col-span-3">
                        <Field label="Activity" value={company.companyActivity} />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Contact */}
            <Card>
              {isAdmin ? (
                <EditableCardHeader
                  title="Contact"
                  editing={editSection === 'contact'}
                  saving={updateCompanyMutation.isPending}
                  onEdit={() => startEdit('contact')}
                  onSave={() => saveSection('contact')}
                  onCancel={cancelEdit}
                  error={editSection === 'contact' && updateCompanyMutation.isError
                    ? (updateCompanyMutation.error instanceof Error ? updateCompanyMutation.error.message : 'Error') : null}
                />
              ) : (
                <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Contact</CardTitle></CardHeader>
              )}
              <CardContent>
                {editSection === 'contact' ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'personalName', label: 'Name' },
                      { key: 'privateEmail', label: 'Email' },
                      { key: 'privatePhone', label: 'Phone' },
                      { key: 'storeNumber',  label: 'Store Phone' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex flex-col gap-1">
                        <Label className="text-xs">{label}</Label>
                        <Input className="h-8 text-sm"
                          value={contactForm[key as keyof typeof contactForm]}
                          onChange={e => setContactForm(f => ({ ...f, [key]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <Field label="Name"             value={company.contactInfo?.personalName} />
                    <Field label="Email"            value={company.contactInfo?.privateEmail} />
                    <Field label="Phone"            value={company.contactInfo?.privatePhone} />
                    <Field label="Store Phone"      value={company.contactInfo?.storeNumber} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Legal (Canada) */}
            {(company.legalInfo || isAdmin) && (
              <Card>
                {isAdmin ? (
                  <EditableCardHeader
                    title="Legal (Canada)"
                    editing={editSection === 'legal'}
                    saving={updateCompanyMutation.isPending}
                    onEdit={() => startEdit('legal')}
                    onSave={() => saveSection('legal')}
                    onCancel={cancelEdit}
                    error={editSection === 'legal' && updateCompanyMutation.isError
                      ? (updateCompanyMutation.error instanceof Error ? updateCompanyMutation.error.message : 'Error') : null}
                  />
                ) : (
                  <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Legal (Canada)</CardTitle></CardHeader>
                )}
                <CardContent>
                  {editSection === 'legal' ? (
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: 'neq',         label: 'NEQ' },
                        { key: 'revenueQcId', label: 'Revenue QC ID' },
                        { key: 'craBn',       label: 'CRA BN' },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex flex-col gap-1">
                          <Label className="text-xs">{label}</Label>
                          <Input className="h-8 text-sm"
                            value={legalForm[key as keyof typeof legalForm]}
                            onChange={e => setLegalForm(f => ({ ...f, [key]: e.target.value }))} />
                        </div>
                      ))}
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">Fiscal Year End</Label>
                        <FiscalYearPicker
                          value={legalForm.fiscalYear}
                          onChange={v => setLegalForm(f => ({ ...f, fiscalYear: v }))}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <Field label="NEQ"           value={company.legalInfo?.neq} />
                      <Field label="Revenue QC ID" value={company.legalInfo?.revenueQcId} />
                      <Field label="CRA BN"        value={company.legalInfo?.craBn} />
                      <Field label="Fiscal Year"   value={formatFiscalYear(company.legalInfo?.fiscalYear)} />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Accountant */}
            <Card>
              {isAdmin ? (
                <EditableCardHeader
                  title="Accountant"
                  editing={editSection === 'accountant'}
                  saving={updateCompanyMutation.isPending}
                  onEdit={() => startEdit('accountant')}
                  onSave={() => saveSection('accountant')}
                  onCancel={cancelEdit}
                  error={editSection === 'accountant' && updateCompanyMutation.isError
                    ? (updateCompanyMutation.error instanceof Error ? updateCompanyMutation.error.message : 'Error') : null}
                />
              ) : (
                <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Accountant</CardTitle></CardHeader>
              )}
              <CardContent>
                {editSection === 'accountant' ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'accountantName',  label: 'Name' },
                      { key: 'accountantEmail', label: 'Email' },
                      { key: 'accountantPhone', label: 'Phone' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex flex-col gap-1">
                        <Label className="text-xs">{label}</Label>
                        <Input className="h-8 text-sm"
                          value={accountantForm[key as keyof typeof accountantForm]}
                          onChange={e => setAccountantForm(f => ({ ...f, [key]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <Field label="Name"  value={company.accountant?.name} />
                    <Field label="Email" value={company.accountant?.email} />
                    <Field label="Phone" value={company.accountant?.phone} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Billing (admin only) */}
            {isAdmin && (
              <Card>
                <EditableCardHeader
                  title="Billing"
                  editing={editSection === 'billing'}
                  saving={updateCompanyMutation.isPending}
                  onEdit={() => startEdit('billing')}
                  onSave={() => saveSection('billing')}
                  onCancel={cancelEdit}
                  error={editSection === 'billing' && updateCompanyMutation.isError
                    ? (updateCompanyMutation.error instanceof Error ? updateCompanyMutation.error.message : 'Error') : null}
                />
                <CardContent>
                  {editSection === 'billing' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">Billing Email</Label>
                        <Input className="h-8 text-sm" type="email"
                          value={billingForm.billingEmail}
                          onChange={e => setBillingForm(f => ({ ...f, billingEmail: e.target.value }))} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">New Password <span className="text-muted-foreground">(leave blank to keep)</span></Label>
                        <Input className="h-8 text-sm" type="password"
                          value={billingForm.billingPassword}
                          placeholder="Enter new password…"
                          onChange={e => setBillingForm(f => ({ ...f, billingPassword: e.target.value }))} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <Field label="Billing Email" value={company.billing?.billingEmail} />
                        {company.billing?.billingPassword && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">Password</p>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium font-mono">
                                {showBillingPw ? company.billing.billingPassword : '••••••••••'}
                              </p>
                              <button
                                type="button"
                                onClick={() => setShowBillingPw(v => !v)}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                title={showBillingPw ? 'Hide password' : 'Show password'}
                              >
                                {showBillingPw ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Gmail connection */}
                      {isAdmin && (
                        <div className="flex items-center gap-3 pt-1 border-t">
                          <p className="text-xs text-muted-foreground">Gmail</p>
                          {gmailAccount ? (
                            <div className="flex items-center gap-2 flex-1">
                              <Badge variant="outline" className="text-teal-700 border-teal-200 bg-teal-50 text-xs">
                                {gmailAccount.gmailAddress}
                              </Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
                                onClick={() => setDisconnectGmailConfirmOpen(true)}
                              >
                                Disconnect
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs text-teal-700 border-teal-200 hover:bg-teal-50"
                              disabled={connectingGmail}
                              onClick={() => void handleConnectGmail()}
                            >
                              {connectingGmail ? 'Opening…' : 'Connect Gmail'}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Assigned User (admin only) */}
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
            {/* Search bar */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={todoSearch}
                onChange={e => setTodoSearch(e.target.value)}
                placeholder="Search tasks…"
                className="h-8 pl-8 text-xs"
              />
              {todoSearch && (
                <button
                  type="button"
                  onClick={() => setTodoSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const next = !tasksAllExpanded;
                  setExpandSignal(s => ({ expanded: next, seq: s.seq + 1 }));
                }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {tasksAllExpanded
                  ? <><ChevronUp size={13} /> Collapse All</>
                  : <><ChevronDown size={13} /> Expand All</>
                }
              </button>
              <Select value={taskSort} onValueChange={v => setTaskSort(v as TaskSort)}>
                <SelectTrigger className="h-7 w-40 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="az">Name A → Z</SelectItem>
                  <SelectItem value="za">Name Z → A</SelectItem>
                  <SelectItem value="overdue">Most Overdue</SelectItem>
                  <SelectItem value="number_asc">Number 1 → 9</SelectItem>
                  <SelectItem value="number_desc">Number 9 → 1</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {visibleTodos.length === 0 && snoozedTodos.length === 0 && !todoSearchQuery ? (
              <p className="text-sm text-muted-foreground">All tasks resolved.</p>
            ) : visibleTodos.length === 0 && todoSearchQuery ? (
              <p className="text-sm text-muted-foreground">No tasks match your search.</p>
            ) : visibleTodos.length === 0 ? null : (
              <div className="flex flex-col gap-2">
                {taskSort !== 'priority' ? (
                  sortedTodos.map(todo => (
                    <TodoRow key={todo.id} {...todoRowProps(todo)} />
                  ))
                ) : (
                  <>
                    {urgentTodos.length > 0 && (
                      <>
                        <p className="text-xs font-semibold uppercase tracking-wide text-purple-700 px-1">
                          Overdue 25 days · {urgentTodos.length}
                        </p>
                        {urgentTodos.map(todo => (
                          <TodoRow key={todo.id} {...todoRowProps(todo)} />
                        ))}
                        {(importantOnlyTodos.length > 0 || restTodos.length > 0) && (
                          <div className="border-t border-border my-1" />
                        )}
                      </>
                    )}
                    {importantOnlyTodos.length > 0 && (
                      <>
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 px-1">
                          Important · {importantOnlyTodos.length}
                        </p>
                        {importantOnlyTodos.map(todo => (
                          <TodoRow key={todo.id} {...todoRowProps(todo)} />
                        ))}
                        {restTodos.length > 0 && (
                          <div className="border-t border-border my-1" />
                        )}
                      </>
                    )}
                    {restTodos.map(todo => (
                      <TodoRow key={todo.id} {...todoRowProps(todo)} />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Snoozed todos */}
            {snoozedTodos.length > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setSnoozedExpanded(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 font-medium px-1 py-0.5"
                >
                  {snoozedExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {snoozedTodos.length} snoozed
                </button>
                {snoozedExpanded && (
                  <div className="flex flex-col gap-2 mt-2">
                    {snoozedTodos.map(todo => {
                      const until = todo.snoozedUntil ? formatDate(todo.snoozedUntil) : null;
                      return (
                        <div key={todo.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-600">{todo.task.title}</p>
                            {until && (
                              <p className="text-xs text-slate-400 mt-0.5">Snoozed until {until}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => unsnoozeMutation.mutate(todo.id)}
                            className="shrink-0 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-200 px-2 py-1 rounded transition-colors"
                          >
                            Unsnooze
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
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

        {/* ── Links tab ── */}
        {tab === 'links' && (
          <LinksSection companyId={companyId} />
        )}

        {/* ── Schedules tab ── */}
        {tab === 'schedules' && (
          <div className="flex flex-col gap-4 max-w-3xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Recurring Schedules</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAdmin ? 'Manage repeating tasks assigned to this company.' : 'Repeating tasks for this company.'}
                </p>
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setAddTaskOpen(true)}
                >
                  <Plus size={14} /> Add Task
                </Button>
              )}
            </div>
            <SchedulesSection
              companyId={companyId}
              schedules={schedules}
              isAdmin={isAdmin}
              onDeleteSchedule={id => deleteScheduleMutation.mutate(id)}
            />
          </div>
        )}

        {/* ── Communications tab ── */}
        {tab === 'communications' && (
          <CommunicationsTab companyId={companyId} isAdmin={isAdmin} />
        )}
      </div>

      <AddTaskDialog open={addTaskOpen} onOpenChange={setAddTaskOpen} companyId={companyId} />

      {/* Disconnect Gmail confirmation */}
      <Dialog open={disconnectGmailConfirmOpen} onOpenChange={setDisconnectGmailConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect Gmail?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove access to <strong>{gmailAccount?.gmailAddress}</strong>. You can reconnect anytime from the Billing section.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDisconnectGmailConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={disconnectGmailMutation.isPending}
              onClick={() =>
                disconnectGmailMutation.mutate(undefined, {
                  onSuccess: () => setDisconnectGmailConfirmOpen(false),
                })
              }
            >
              {disconnectGmailMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete company confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Company</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-semibold text-foreground">{company.businessName}</span>?
            This action cannot be undone.
          </p>
          {deleteCompanyMutation.isError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {(deleteCompanyMutation.error as Error)?.message ?? 'Failed to delete company'}
            </p>
          )}
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteCompanyMutation.isPending}
              onClick={() =>
                deleteCompanyMutation.mutate(companyId, {
                  onSuccess: () => navigate('/dashboard'),
                })
              }
            >
              {deleteCompanyMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Permanent delete confirmation (for archived companies) */}
      <Dialog open={showPermDeleteConfirm} onOpenChange={setShowPermDeleteConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Permanently</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Permanently delete <span className="font-semibold text-foreground">{company.businessName}</span>?
            All associated data (tasks, schedules, notes, links) will be erased and cannot be recovered.
          </p>
          {permDeleteMutation.isError && (
            <p className="text-xs text-destructive">
              {permDeleteMutation.error instanceof Error ? permDeleteMutation.error.message : 'Error'}
            </p>
          )}
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setShowPermDeleteConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={permDeleteMutation.isPending}
              onClick={() =>
                permDeleteMutation.mutate(companyId, {
                  onSuccess: () => navigate('/admin/archived'),
                })
              }
            >
              {permDeleteMutation.isPending ? 'Deleting…' : 'Delete Permanently'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
