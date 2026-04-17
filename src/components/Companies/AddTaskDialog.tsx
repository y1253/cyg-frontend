import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTasks, useCreateTask } from '@/hooks/useTasks';
import { useCreateSchedule } from '@/hooks/useTaskSchedules';
import { useAssignTask } from '@/hooks/useTasks';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: number;
}

// ─── Mini "create task" dialog ────────────────────────────────────────────────

function CreateTaskMiniDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: number, title: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const createMutation = useCreateTask();

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      createMutation.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    createMutation.mutate(
      { title: title.trim(), description: description.trim() || undefined },
      {
        onSuccess: (task) => {
          onCreated(task.id, task.title);
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mini-task-title">Title *</Label>
            <Input
              id="mini-task-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. File quarterly taxes"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mini-task-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="mini-task-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description…"
            />
          </div>
          {createMutation.isError && (
            <p className="text-xs text-destructive">
              {createMutation.error instanceof Error ? createMutation.error.message : 'Something went wrong'}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!title.trim() || createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main add-task dialog ─────────────────────────────────────────────────────

export function AddTaskDialog({ open, onOpenChange, companyId }: Props) {
  const [taskId, setTaskId] = useState('');
  const [taskLabel, setTaskLabel] = useState('');
  const [mode, setMode] = useState<'recurring' | 'onetime'>('recurring');
  const [cycle, setCycle] = useState('30');
  const [dueDate, setDueDate] = useState('');
  const [scheduleNote, setScheduleNote] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const { data: tasks = [] } = useTasks();
  const scheduleMutation = useCreateSchedule(companyId);
  const assignMutation = useAssignTask();

  const isPending = scheduleMutation.isPending || assignMutation.isPending;
  const error = scheduleMutation.error ?? assignMutation.error;

  useEffect(() => {
    if (open) {
      setTaskId('');
      setTaskLabel('');
      setMode('recurring');
      setCycle('30');
      setDueDate('');
      setScheduleNote('');
      scheduleMutation.reset();
      assignMutation.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!taskId) return;

    if (mode === 'recurring') {
      scheduleMutation.mutate(
        { taskId: Number(taskId), companyId, cycle: Number(cycle) || 30, note: scheduleNote.trim() || undefined },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      assignMutation.mutate(
        {
          taskId: Number(taskId),
          data: { companyId, dueDate: dueDate || undefined },
        },
        { onSuccess: () => onOpenChange(false) },
      );
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Task select */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-task-select">Task *</Label>
              <select
                id="add-task-select"
                value={taskId}
                onChange={e => {
                  setTaskId(e.target.value);
                  const found = tasks.find(t => String(t.id) === e.target.value);
                  setTaskLabel(found?.title ?? '');
                }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— Select a task —</option>
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
              {/* "Create new" shortcut */}
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="self-start flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
              >
                <Plus size={11} strokeWidth={2.5} />
                Create new task
              </button>
            </div>

            {/* Mode toggle */}
            <div className="flex rounded-md border overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setMode('recurring')}
                className={`flex-1 py-2 font-medium transition-colors ${
                  mode === 'recurring' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                Recurring
              </button>
              <button
                type="button"
                onClick={() => setMode('onetime')}
                className={`flex-1 py-2 font-medium transition-colors ${
                  mode === 'onetime' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                One-time
              </button>
            </div>

            {mode === 'recurring' ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="add-cycle">Repeat Every (days)</Label>
                  <Input
                    id="add-cycle"
                    type="number"
                    min={1}
                    value={cycle}
                    onChange={e => setCycle(e.target.value)}
                    placeholder="30"
                  />
                  <p className="text-xs text-muted-foreground">
                    First todo will be due in {Number(cycle) || 30} days.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="add-schedule-note">Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <textarea
                    id="add-schedule-note"
                    value={scheduleNote}
                    onChange={e => setScheduleNote(e.target.value)}
                    placeholder="Company-specific reminder for this task…"
                    rows={2}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-due">Due Date</Label>
                <Input
                  id="add-due"
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Leave blank for no due date.</p>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                {error instanceof Error ? error.message : 'Something went wrong'}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!taskId || isPending}>
                {isPending ? 'Adding…' : 'Add Task'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Nested mini dialog to create a new task on the fly */}
      <CreateTaskMiniDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id, title) => {
          setTaskId(String(id));
          setTaskLabel(title);
        }}
      />
    </>
  );
}
