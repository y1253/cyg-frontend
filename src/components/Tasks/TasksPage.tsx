import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, Building2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { useTasks, useDeleteTask } from '@/hooks/useTasks';
import { TaskDialog } from './TaskDialog';
import { AssignTaskDialog } from './AssignTaskDialog';
import type { AppTask } from '@/api/tasks';

type TypeFilter = 'all' | 'general' | 'specific';

export function TasksPage() {
  const { data: tasks = [], isLoading } = useTasks();
  const deleteMutation = useDeleteTask();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTask, setEditTask] = useState<AppTask | null>(null);
  const [assignTask, setAssignTask] = useState<AppTask | null>(null);
  const [deleteTask, setDeleteTask] = useState<AppTask | null>(null);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter(t => {
      if (q) {
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDesc = t.description?.toLowerCase().includes(q) ?? false;
        if (!matchesTitle && !matchesDesc) return false;
      }
      if (typeFilter === 'general' && !t.isGeneral) return false;
      if (typeFilter === 'specific' && t.isGeneral) return false;
      return true;
    });
  }, [tasks, search, typeFilter]);

  const isFiltered = search.trim() !== '' || typeFilter !== 'all';

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

      {/* Search + type filter */}
      {!isLoading && tasks.length > 0 && (
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search tasks…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={typeFilter}
            onValueChange={v => setTypeFilter((v ?? 'all') as TypeFilter)}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="specific">Specific</SelectItem>
            </SelectContent>
          </Select>
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
            Existing company todos for this task will remain.
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
}: {
  task: AppTask;
  onEdit: () => void;
  onDelete: () => void;
  onAssign: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-background px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm">{task.title}</p>
          {task.isGeneral && (
            <Badge variant="secondary" className="text-xs">General</Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {task.openTodos} open {task.openTodos === 1 ? 'todo' : 'todos'}
          </span>
        </div>
        {task.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
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
