import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, Building2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTasks, useDeleteTask, useUpdateTask } from '@/hooks/useTasks';
import { TaskDialog } from './TaskDialog';
import { AssignTaskDialog } from './AssignTaskDialog';
import type { AppTask } from '@/api/tasks';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = ['', '1st', '2nd', '3rd', '4th'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatTaskCycle(task: AppTask): string {
  switch (task.defaultCycleType) {
    case 'MONTHLY_DATE':
      return `Every ${ORDINALS[task.defaultCycleDay ?? 1] ?? `${task.defaultCycleDay}th`} of the month`;
    case 'WEEKLY_DAY':
      return `Every ${WEEKDAYS[task.defaultCycleDay ?? 0]}`;
    case 'MONTHLY_WEEKDAY':
      return `Every ${ORDINALS[task.defaultCycleNth ?? 1] ?? `${task.defaultCycleNth}th`} ${WEEKDAYS[task.defaultCycleDay ?? 0]}`;
    case 'QUARTERLY':
      return `Every quarter (${ORDINALS[task.defaultCycleDay ?? 1] ?? `${task.defaultCycleDay}th`} of month)`;
    case 'YEARLY':
      return `Yearly on ${MONTHS[(task.defaultCycleNth ?? 1) - 1]} ${ORDINALS[task.defaultCycleDay ?? 1] ?? `${task.defaultCycleDay}th`}`;
    default:
      return `Every ${task.defaultCycle}d`;
  }
}

export function TasksPage() {
  const { data: tasks = [], isLoading } = useTasks();
  const deleteMutation = useDeleteTask();
  const updateMutation = useUpdateTask();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTask, setEditTask] = useState<AppTask | null>(null);
  const [assignTask, setAssignTask] = useState<AppTask | null>(null);
  const [deleteTask, setDeleteTask] = useState<AppTask | null>(null);

  const [search, setSearch] = useState('');

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(t => {
      const matchesTitle = t.title.toLowerCase().includes(q);
      const matchesDesc = t.description?.toLowerCase().includes(q) ?? false;
      return matchesTitle || matchesDesc;
    });
  }, [tasks, search]);

  const isFiltered = search.trim() !== '';

  function handleDeleteConfirm() {
    if (!deleteTask) return;
    deleteMutation.mutate(deleteTask.id, {
      onSuccess: () => setDeleteTask(null),
    });
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Tasks</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage task templates and assign them to companies.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus size={16} />
          New Task
        </Button>
      </div>

      {/* Search */}
      {!isLoading && tasks.length > 0 && (
        <div className="relative mb-4">
          <Search size={15} className="absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search tasks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filteredTasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isFiltered ? 'No tasks match your search.' : 'No tasks yet. Create one to get started.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredTasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              onEdit={() => setEditTask(task)}
              onDelete={() => setDeleteTask(task)}
              onAssign={() => setAssignTask(task)}
              onToggleImportant={() =>
                updateMutation.mutate({ id: task.id, data: { isImportant: !task.isImportant } })
              }
              onToggleCanBeDisabled={() =>
                updateMutation.mutate({ id: task.id, data: { canBeDisabled: !task.canBeDisabled } })
              }
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <TaskDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Edit dialog */}
      <TaskDialog
        open={!!editTask}
        onOpenChange={open => { if (!open) setEditTask(null); }}
        task={editTask}
      />

      {/* Assign dialog */}
      <AssignTaskDialog
        open={!!assignTask}
        onOpenChange={open => { if (!open) setAssignTask(null); }}
        task={assignTask}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTask} onOpenChange={open => { if (!open) setDeleteTask(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <span className="font-medium text-foreground">{deleteTask?.title}</span>?
            All todos and schedules for this task will be permanently removed.
          </p>
          {deleteMutation.isError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {deleteMutation.error instanceof Error
                ? deleteMutation.error.message
                : 'Something went wrong'}
            </p>
          )}
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteTask(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={handleDeleteConfirm}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Task row ─────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  onEdit,
  onDelete,
  onAssign,
  onToggleImportant,
  onToggleCanBeDisabled,
}: {
  task: AppTask;
  onEdit: () => void;
  onDelete: () => void;
  onAssign: () => void;
  onToggleImportant: () => void;
  onToggleCanBeDisabled: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-background px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm">{task.title}</p>
          <span className="text-xs text-muted-foreground">{formatTaskCycle(task)}</span>
          <span className="text-xs text-muted-foreground">
            {task.openTodos} open {task.openTodos === 1 ? 'todo' : 'todos'}
          </span>
        </div>
        {task.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onToggleImportant}
          className={`h-7 px-2 rounded text-[11px] font-semibold transition-colors ${
            task.isImportant
              ? 'text-amber-700 bg-amber-100 hover:bg-amber-200 border border-amber-300'
              : 'text-muted-foreground hover:text-amber-700 hover:bg-amber-50 border border-transparent'
          }`}
        >
          Important
        </button>
        <button
          type="button"
          onClick={onToggleCanBeDisabled}
          className={`h-7 px-2 rounded text-[11px] font-semibold transition-colors ${
            task.canBeDisabled
              ? 'text-blue-700 bg-blue-100 hover:bg-blue-200 border border-blue-300'
              : 'text-muted-foreground hover:text-blue-700 hover:bg-blue-50 border border-transparent'
          }`}
        >
          Can disable
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          title="Assign to company"
          onClick={onAssign}
        >
          <Building2 size={15} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          title="Edit"
          onClick={onEdit}
        >
          <Pencil size={15} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          title="Delete"
          onClick={onDelete}
        >
          <Trash2 size={15} />
        </Button>
      </div>
    </div>
  );
}
