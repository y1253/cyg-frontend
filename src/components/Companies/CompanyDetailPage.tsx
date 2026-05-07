import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Ban, CalendarIcon, ChevronDown, ChevronUp, Eye, EyeOff, ExternalLink, Pencil, Plus, Power, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { useDeleteTodo, useSetTodoCycle, useRemoveTodoCycle } from '@/hooks/useTodoActions';
import { useLinks, useCreateLink, useUpdateLink, useDeleteLink } from '@/hooks/useLinks';
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote } from '@/hooks/useNotes';
import { useToggleSchedule, useUpdateSchedule, useToggleScheduleImportant } from '@/hooks/useTaskSchedules';
import { useUpsertScheduleNote, useDeleteScheduleNote } from '@/hooks/useScheduleNotes';
import { useUpdateCompany } from '@/hooks/useUpdateCompany';
import { useDeleteCompany } from '@/hooks/useDeleteCompany';
import { AddTaskDialog } from './AddTaskDialog';
import type { TodoItem } from '@/api/companies';
import type { AppTaskSchedule } from '@/api/taskSchedules';
import type { CompanyLink } from '@/api/links';
import type { CompanyNote } from '@/api/notes';

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
function rowBg(tier: UrgencyTier, isRecurring: boolean, isImportant: boolean): string {
  if (isRecurring) {
    if (tier === 'overdue') return 'border-red-300 bg-blue-50/80';
    if (tier === 'soon')    return 'border-orange-300 bg-blue-50/80';
    if (tier === 'warning') return 'border-yellow-300 bg-blue-50/80';
    if (isImportant)        return 'border-amber-300 bg-blue-50/60';
    return 'border-blue-200 bg-blue-50/60';
  }
  if (tier === 'overdue') return 'border-red-200 bg-red-50';
  if (tier === 'soon')    return 'border-orange-200 bg-orange-50';
  if (tier === 'warning') return 'border-yellow-200 bg-yellow-50';
  if (isImportant)        return 'border-amber-300 bg-amber-50/50';
  return 'border-border bg-background';
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Cycle format helpers ─────────────────────────────────────────────────────

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = ['', '1st', '2nd', '3rd', '4th'];

function ordinal(n: number): string {
  return ORDINALS[n] ?? `${n}th`;
}

function formatCycle(s: AppTaskSchedule): string {
  switch (s.cycleType) {
    case 'MONTHLY_DATE':
      return `Every ${ordinal(s.cycleDay ?? 1)} of the month`;
    case 'WEEKLY_DAY':
      return `Every ${WEEKDAYS[s.cycleDay ?? 0]}`;
    case 'MONTHLY_WEEKDAY':
      return `Every ${ordinal(s.cycleNth ?? 1)} ${WEEKDAYS[s.cycleDay ?? 0]}`;
    case 'QUARTERLY':
      return `Every quarter (${ordinal(s.cycleDay ?? 1)} of month)`;
    case 'YEARLY':
      return `Every year on ${MONTHS[(s.cycleNth ?? 1) - 1]?.label ?? 'Jan'} ${ordinal(s.cycleDay ?? 1)}`;
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
  userNotes,
  isAdmin,
  isImportant,
  onToggle,
  togglePending,
  onDelete,
  onSetCycle,
  onRemoveCycle,
}: {
  todo: TodoItem;
  schedule: AppTaskSchedule | null;
  adminNote: string | null;
  userNotes: { note: string; userId: number; userName: string }[];
  isAdmin: boolean;
  isImportant: boolean;
  onToggle: () => void;
  togglePending: boolean;
  onDelete: () => void;
  onSetCycle: (cycle: number) => void;
  onRemoveCycle: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [addCycleOpen, setAddCycleOpen] = useState(false);
  const [cycleInput, setCycleInput] = useState('30');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemoveCycle, setConfirmRemoveCycle] = useState(false);

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
  const hasNote = !!adminNote || userNotes.length > 0;

  function handleToggle() {
    if (!todo.resolved) {
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 1200);
    }
    onToggle();
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
            {(hasDescription || hasNote) && (
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
                📝 {adminNote}
              </p>
            )}
            {userNotes.map((un, i) => (
              <p key={i} className="text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded px-2 py-1 whitespace-pre-wrap leading-relaxed">
                🗒️ <span className="font-medium">{un.userName}:</span> {un.note}
              </p>
            ))}
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

type Tab = 'details' | 'tasks' | 'resolved' | 'links' | 'notes' | 'schedules';

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
    { key: 'notes', label: 'Notes' },
    { key: 'schedules' as Tab, label: 'Schedules' },
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

function LinksSection({ companyId, isAdmin }: { companyId: number; isAdmin: boolean }) {
  const { data: links = [], isLoading } = useLinks(companyId);
  const createMutation = useCreateLink(companyId);
  const updateMutation = useUpdateLink(companyId);
  const deleteMutation = useDeleteLink(companyId);

  const [addOpen, setAddOpen] = useState(false);
  const [addLabel, setAddLabel] = useState('');
  const [addUrl, setAddUrl] = useState('');

  const [editId, setEditId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editUrl, setEditUrl] = useState('');

  const [deleteId, setDeleteId] = useState<number | null>(null);

  function faviconUrl(url: string) {
    try {
      const domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch {
      return null;
    }
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addLabel || !addUrl) return;
    createMutation.mutate(
      { companyId, label: addLabel, url: addUrl },
      {
        onSuccess: () => {
          setAddOpen(false);
          setAddLabel('');
          setAddUrl('');
        },
      },
    );
  }

  function openEdit(link: CompanyLink) {
    setEditId(link.id);
    setEditLabel(link.label);
    setEditUrl(link.url);
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    updateMutation.mutate(
      { id: editId, data: { label: editLabel, url: editUrl } },
      { onSuccess: () => setEditId(null) },
    );
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading links…</p>;

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      {isAdmin && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddOpen(v => !v)}>
            <Plus size={14} /> Add Link
          </Button>
        </div>
      )}

      {/* Inline add form */}
      {isAdmin && addOpen && (
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
            />
          </div>
          {createMutation.isError && (
            <p className="text-xs text-destructive">
              {createMutation.error instanceof Error ? createMutation.error.message : 'Error'}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
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
                <Input value={editUrl} onChange={e => setEditUrl(e.target.value)} />
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
            <div className="rounded-lg border bg-background px-4 py-3 flex items-center gap-3">
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
              {isAdmin && (
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

// ─── Notes section ───────────────────────────────────────────────────────────

function NotesSection({ companyId }: { companyId: number }) {
  const { data: notes = [], isLoading } = useNotes(companyId);
  const createMutation = useCreateNote(companyId);
  const updateMutation = useUpdateNote(companyId);
  const deleteMutation = useDeleteNote(companyId);

  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addNote, setAddNote] = useState('');

  const [editId, setEditId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNote, setEditNote] = useState('');

  const [deleteId, setDeleteId] = useState<number | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addTitle || !addNote) return;
    createMutation.mutate(
      { companyId, title: addTitle, note: addNote },
      {
        onSuccess: () => {
          setAddOpen(false);
          setAddTitle('');
          setAddNote('');
        },
      },
    );
  }

  function openEdit(n: CompanyNote) {
    setEditId(n.id);
    setEditTitle(n.title);
    setEditNote(n.note);
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    updateMutation.mutate(
      { id: editId, data: { title: editTitle, note: editNote } },
      { onSuccess: () => setEditId(null) },
    );
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading notes…</p>;

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Only you can see your notes.</p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddOpen(v => !v)}>
          <Plus size={14} /> Add Note
        </Button>
      </div>

      {/* Inline add form */}
      {addOpen && (
        <form onSubmit={handleAdd} className="rounded-lg border bg-muted/30 p-4 flex flex-col gap-3">
          <p className="text-sm font-medium">New Note</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-note-title">Title</Label>
            <Input
              id="add-note-title"
              value={addTitle}
              onChange={e => setAddTitle(e.target.value)}
              placeholder="Note title"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-note-body">Note</Label>
            <textarea
              id="add-note-body"
              value={addNote}
              onChange={e => setAddNote(e.target.value)}
              placeholder="Write your note here…"
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>
          {createMutation.isError && (
            <p className="text-xs text-destructive">
              {createMutation.error instanceof Error ? createMutation.error.message : 'Error'}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={!addTitle || !addNote || createMutation.isPending}>
              {createMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      )}

      {/* Empty state */}
      {notes.length === 0 && !addOpen && (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      )}

      {/* Notes list */}
      {notes.map(n => (
        <div key={n.id}>
          {editId === n.id ? (
            <form onSubmit={handleUpdate} className="rounded-lg border bg-muted/30 p-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Title</Label>
                <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Note</Label>
                <textarea
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
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
            <div className="rounded-lg border bg-background px-4 py-3 flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-snug">{n.title}</p>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    title="Edit note"
                    onClick={() => openEdit(n)}
                    className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    title="Delete note"
                    onClick={() => setDeleteId(n.id)}
                    className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{n.note}</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                {new Date(n.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          )}
        </div>
      ))}

      {/* Delete confirm dialog */}
      <Dialog open={deleteId !== null} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Note</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <span className="font-medium text-foreground">
              {notes.find(n => n.id === deleteId)?.title}
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
  currentUserId,
}: {
  companyId: number;
  schedules: AppTaskSchedule[];
  isAdmin: boolean;
  currentUserId: number;
}) {
  const updateMutation = useUpdateSchedule(companyId);
  const toggleMutation = useToggleSchedule(companyId);
  const toggleImportantMutation = useToggleScheduleImportant(companyId);
  const upsertNoteMutation = useUpsertScheduleNote(companyId);
  const deleteNoteMutation = useDeleteScheduleNote(companyId);

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

  const active = filtered.filter(s => !s.deletedAt);
  const disabled = filtered.filter(s => !!s.deletedAt);

  if (schedules.length === 0) {
    return <p className="text-sm text-muted-foreground">No recurring schedules set up for this company yet.</p>;
  }

  function renderSchedule(s: AppTaskSchedule) {
    const isDisabled = !!s.deletedAt;
    return (
      <div
        key={s.id}
        className={`rounded-lg border px-4 py-3 flex items-start gap-3 transition-opacity ${
          isDisabled
            ? 'bg-muted/40 border-muted-foreground/20 opacity-60'
            : 'bg-blue-50/60 border-blue-200'
        }`}
      >
        <RefreshCw
          size={14}
          className={`shrink-0 mt-1 ${isDisabled ? 'text-muted-foreground' : 'text-blue-500'}`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-medium leading-snug ${isDisabled ? 'line-through text-muted-foreground' : ''}`}>
              {s.task.title}
            </p>
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
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={editCycleDay}
                    onChange={e => setEditCycleDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                    className="h-7 w-20 text-xs px-2"
                    autoFocus
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
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={editCycleDay}
                    onChange={e => setEditCycleDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                    className="h-7 w-20 text-xs px-2"
                    autoFocus
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
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={editCycleDay}
                    onChange={e => setEditCycleDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                    className="h-7 w-20 text-xs px-2"
                  />
                </div>
              )}

              <textarea
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                placeholder="Company-specific note (optional)…"
                rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Start date (optional)</span>
                <div className="flex items-center gap-1.5">
                  <Popover>
                    <PopoverTrigger>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2 gap-1.5 w-44 justify-start font-normal"
                      >
                        <CalendarIcon size={12} />
                        {editStartDate
                          ? format(new Date(editStartDate + 'T00:00:00'), 'MMM d, yyyy')
                          : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={editStartDate ? new Date(editStartDate + 'T00:00:00') : undefined}
                        onSelect={date => setEditStartDate(date ? format(date, 'yyyy-MM-dd') : '')}
                        initialFocus
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
                <p className="text-[10px] text-muted-foreground">Removes unresolved todos due before this date.</p>
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
                  📝 {s.note}
                </p>
              )}
              {/* All user notes (teal) */}
              {s.userNotes.map((un, i) => (
                <p key={i} className={`text-xs rounded px-2 py-1 mt-1 whitespace-pre-wrap leading-relaxed border ${
                  isDisabled
                    ? 'text-muted-foreground bg-muted/60 border-muted-foreground/20'
                    : 'text-teal-700 bg-teal-50 border-teal-200'
                }`}>
                  🗒️ <span className="font-medium">{un.userName}:</span> {un.note}
                </p>
              ))}
              {/* User note edit/add form */}
              {userNoteEditId === s.id ? (
                <div className="flex flex-col gap-1.5 mt-1.5">
                  <textarea
                    value={userNoteInput}
                    onChange={e => setUserNoteInput(e.target.value)}
                    placeholder="Your note…"
                    rows={2}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs px-2"
                      disabled={upsertNoteMutation.isPending || deleteNoteMutation.isPending}
                      onClick={() => {
                        const trimmed = userNoteInput.trim();
                        if (trimmed) {
                          upsertNoteMutation.mutate(
                            { scheduleId: s.id, note: trimmed },
                            { onSuccess: () => setUserNoteEditId(null) },
                          );
                        } else {
                          deleteNoteMutation.mutate(s.id, { onSuccess: () => setUserNoteEditId(null) });
                        }
                      }}
                    >
                      {upsertNoteMutation.isPending ? 'Saving…' : 'Save'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-2"
                      onClick={() => setUserNoteEditId(null)}
                    >
                      Cancel
                    </Button>
                    {s.userNotes.some(n => n.userId === currentUserId) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs px-2 text-destructive hover:text-destructive"
                        disabled={deleteNoteMutation.isPending}
                        onClick={() => deleteNoteMutation.mutate(s.id, { onSuccess: () => setUserNoteEditId(null) })}
                      >
                        Delete Note
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                !isDisabled && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserNoteEditId(s.id);
                      setUserNoteInput(s.userNotes.find(n => n.userId === currentUserId)?.note ?? '');
                    }}
                    className="text-xs text-muted-foreground hover:text-teal-600 mt-1 inline-flex items-center gap-1"
                  >
                    <Pencil size={11} />
                    {s.userNotes.some(n => n.userId === currentUserId) ? 'Edit your note' : 'Add your note'}
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
                    setEditCycleDay(s.cycleDay ?? 0);
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
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const companyId = Number(id);
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('tasks');
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: company, isLoading, isError } = useCompany(companyId);
  const { data: users = [] } = useUsers();
  const { data: schedules = [] } = useTaskSchedules(companyId);
  const assignMutation = useAssignCompany();
  const updateCompanyMutation = useUpdateCompany();
  const deleteCompanyMutation = useDeleteCompany();
  const resolveMutation = useResolveTodo(companyId);
  const deleteMutation = useDeleteTodo(companyId);
  const setCycleMutation = useSetTodoCycle(companyId);
  const removeCycleMutation = useRemoveTodoCycle(companyId);

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

  const openTodos = company.todos
    .filter(t => !t.resolved)
    .sort((a, b) => Number(getSchedule(b)?.isImportant ?? false) - Number(getSchedule(a)?.isImportant ?? false));

  const importantTodos = openTodos.filter(t => getSchedule(t)?.isImportant ?? false);
  const otherTodos = openTodos.filter(t => !(getSchedule(t)?.isImportant ?? false));

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
      userNotes: sched?.userNotes ?? [],
      isAdmin,
      isImportant: sched?.isImportant ?? false,
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
          {isAdmin && (
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
            <p className="text-2xl font-bold text-amber-600">{importantTodos.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Important</p>
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
                {importantTodos.length > 0 && (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 px-1">
                      Important · {importantTodos.length}
                    </p>
                    {importantTodos.map(todo => (
                      <TodoRow key={todo.id} {...todoRowProps(todo)} />
                    ))}
                    {otherTodos.length > 0 && (
                      <div className="border-t border-border my-1" />
                    )}
                  </>
                )}
                {otherTodos.map(todo => (
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

        {/* ── Links tab ── */}
        {tab === 'links' && (
          <LinksSection companyId={companyId} isAdmin={isAdmin} />
        )}

        {/* ── Notes tab ── */}
        {tab === 'notes' && (
          <NotesSection companyId={companyId} />
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
            </div>
            <SchedulesSection
              companyId={companyId}
              schedules={schedules}
              isAdmin={isAdmin}
              currentUserId={user!.id}
            />
          </div>
        )}
      </div>

      <AddTaskDialog open={addTaskOpen} onOpenChange={setAddTaskOpen} companyId={companyId} />

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
    </div>
  );
}
