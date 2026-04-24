import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, ChevronUp, ExternalLink, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useDeleteSchedule, useUpdateSchedule } from '@/hooks/useTaskSchedules';
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
  scheduleNote,
  isAdmin,
  onToggle,
  togglePending,
  onDelete,
  onSetCycle,
  onRemoveCycle,
}: {
  todo: TodoItem;
  cycleDays: number | null;
  scheduleNote: string | null;
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
  const hasNote = !!scheduleNote;

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
            {hasNote && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 whitespace-pre-wrap leading-relaxed">
                📝 {scheduleNote}
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

type Tab = 'details' | 'tasks' | 'resolved' | 'links' | 'notes' | 'schedules';

function TabBar({
  active,
  onChange,
  openCount,
  resolvedCount,
  isAdmin,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  openCount: number;
  resolvedCount: number;
  isAdmin: boolean;
}) {
  const tabs: { key: Tab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'tasks',   label: `Tasks (${openCount})` },
    { key: 'resolved', label: `Resolved (${resolvedCount})` },
    { key: 'links', label: 'Links' },
    { key: 'notes', label: 'Notes' },
    ...(isAdmin ? [{ key: 'schedules' as Tab, label: 'Schedules' }] : []),
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

function SchedulesSection({ companyId, schedules }: { companyId: number; schedules: AppTaskSchedule[] }) {
  const updateMutation = useUpdateSchedule(companyId);
  const deleteMutation = useDeleteSchedule(companyId);

  const [editId, setEditId] = useState<number | null>(null);
  const [editCycle, setEditCycle] = useState('');
  const [editNote, setEditNote] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const activeSchedules = schedules.filter(s => !s.deletedAt);

  if (activeSchedules.length === 0) {
    return <p className="text-sm text-muted-foreground">No recurring schedules set up for this company yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {activeSchedules.map(s => (
        <div key={s.id} className="rounded-lg border bg-blue-50/60 border-blue-200 px-4 py-3 flex items-start gap-3">
          <RefreshCw size={14} className="text-blue-500 shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug">{s.task.title}</p>
            {editId === s.id ? (
              <div className="flex flex-col gap-2 mt-1.5">
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
                <textarea
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  placeholder="Company-specific note (optional)…"
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs px-2"
                    disabled={updateMutation.isPending}
                    onClick={() => {
                      const n = Number(editCycle);
                      if (n >= 1) {
                        updateMutation.mutate(
                          { id: s.id, cycle: n, note: editNote.trim() || null },
                          { onSuccess: () => setEditId(null) },
                        );
                      }
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
                <p className="text-xs text-muted-foreground">Every {s.cycle} days</p>
                {s.note && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1 whitespace-pre-wrap leading-relaxed">
                    📝 {s.note}
                  </p>
                )}
              </div>
            )}
          </div>
          {editId !== s.id && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                title="Edit schedule"
                onClick={() => { setEditId(s.id); setEditCycle(String(s.cycle)); setEditNote(s.note ?? ''); }}
                className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                title="Delete schedule"
                onClick={() => setDeleteId(s.id)}
                className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Delete confirm dialog */}
      <Dialog open={deleteId !== null} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Schedule</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Stop recurring schedule for{' '}
            <span className="font-medium text-foreground">
              {activeSchedules.find(s => s.id === deleteId)?.task.title}
            </span>?
            Existing todos won't be deleted.
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

  const [editSupportNumber, setEditSupportNumber] = useState(false);
  const [supportNumberInput, setSupportNumberInput] = useState('');

  if (isLoading) return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;
  if (isError || !company) return <div className="p-8 text-destructive text-sm">Company not found.</div>;

  const regularUsers = users.filter(u => u.role === 'USER');
  const openTodos = company.todos.filter(t => !t.resolved);
  const resolvedTodos = company.todos.filter(t => t.resolved);

  // Build a map: scheduleId → { cycle, note }
  const scheduleMap = new Map<number, { cycle: number; note: string | null }>(
    schedules.map((s: AppTaskSchedule) => [s.id, { cycle: s.cycle, note: s.note }])
  );

  function getCycleDays(todo: TodoItem): number | null {
    if (!todo.scheduleId) return null;
    return scheduleMap.get(todo.scheduleId)?.cycle ?? null;
  }

  function getScheduleNote(todo: TodoItem): string | null {
    if (!todo.scheduleId) return null;
    return scheduleMap.get(todo.scheduleId)?.note ?? null;
  }

  function handleAssign(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    assignMutation.mutate({ companyId, userId: val === '' ? null : Number(val) });
  }

  function todoRowProps(todo: TodoItem) {
    return {
      todo,
      cycleDays: getCycleDays(todo),
      scheduleNote: getScheduleNote(todo),
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
          isAdmin={isAdmin}
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
                {/* Support Number — read-only for users, inline-editable for admin */}
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Support Number</p>
                  {isAdmin && editSupportNumber ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Input
                        value={supportNumberInput}
                        onChange={e => setSupportNumberInput(e.target.value)}
                        className="h-7 text-sm px-2 w-36"
                        placeholder="e.g. +15141234567"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        className="h-7 text-xs px-2"
                        disabled={updateCompanyMutation.isPending}
                        onClick={() => {
                          updateCompanyMutation.mutate(
                            { id: companyId, data: { supportNumber: supportNumberInput.trim() || undefined } },
                            { onSuccess: () => setEditSupportNumber(false) },
                          );
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs px-2"
                        onClick={() => setEditSupportNumber(false)}
                      >
                        Cancel
                      </Button>
                      {updateCompanyMutation.isError && (
                        <span className="text-xs text-destructive">
                          {updateCompanyMutation.error instanceof Error ? updateCompanyMutation.error.message : 'Error'}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {company.supportNumber ? (
                        <p className="text-sm font-medium">{company.supportNumber}</p>
                      ) : (
                        <p className={`text-sm font-medium ${isAdmin ? 'text-orange-600' : 'text-muted-foreground'}`}>
                          {isAdmin ? 'Not set' : '—'}
                        </p>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          title="Edit support number"
                          onClick={() => {
                            setSupportNumberInput(company.supportNumber ?? '');
                            setEditSupportNumber(true);
                          }}
                          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
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

        {/* ── Links tab ── */}
        {tab === 'links' && (
          <LinksSection companyId={companyId} isAdmin={isAdmin} />
        )}

        {/* ── Notes tab ── */}
        {tab === 'notes' && (
          <NotesSection companyId={companyId} />
        )}

        {/* ── Schedules tab (admin only) ── */}
        {tab === 'schedules' && isAdmin && (
          <div className="flex flex-col gap-4 max-w-3xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Recurring Schedules</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Manage repeating tasks assigned to this company.</p>
              </div>
            </div>
            <SchedulesSection companyId={companyId} schedules={schedules} />
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
