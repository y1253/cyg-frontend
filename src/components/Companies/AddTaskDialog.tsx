import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTasks } from '@/hooks/useTasks';
import { useCreateSchedule } from '@/hooks/useTaskSchedules';
import { useAssignTask } from '@/hooks/useTasks';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: number;
}

export function AddTaskDialog({ open, onOpenChange, companyId }: Props) {
  const [taskId, setTaskId] = useState('');
  const [mode, setMode] = useState<'recurring' | 'onetime'>('recurring');
  const [cycle, setCycle] = useState('30');
  const [dueDate, setDueDate] = useState('');

  const { data: tasks = [] } = useTasks();
  const scheduleMutation = useCreateSchedule(companyId);
  const assignMutation = useAssignTask();

  const isPending = scheduleMutation.isPending || assignMutation.isPending;
  const error = scheduleMutation.error ?? assignMutation.error;

  useEffect(() => {
    if (open) {
      setTaskId('');
      setMode('recurring');
      setCycle('30');
      setDueDate('');
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
        { taskId: Number(taskId), companyId, cycle: Number(cycle) || 30 },
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
              onChange={e => setTaskId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— Select a task —</option>
              {tasks.map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
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
  );
}
