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
import { useCreateTask, useUpdateTask } from '@/hooks/useTasks';
import type { AppTask } from '@/api/tasks';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: AppTask | null; // null/undefined = create mode
}

export function TaskDialog({ open, onOpenChange, task }: Props) {
  const isEdit = !!task;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [isGeneral, setIsGeneral] = useState(false);

  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const isPending = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error ?? updateMutation.error;

  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? '');
      setDescription(task?.description ?? '');
      setNote(task?.note ?? '');
      setIsGeneral(task?.isGeneral ?? false);
      createMutation.reset();
      updateMutation.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const data = {
      title: title.trim(),
      description: description.trim() || undefined,
      note: note.trim() || undefined,
      isGeneral,
    };

    if (isEdit && task) {
      updateMutation.mutate(
        { id: task.id, data },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      createMutation.mutate(data, { onSuccess: () => onOpenChange(false) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Task' : 'New Task'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-title">Title *</Label>
            <Input
              id="task-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. File GST Return"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-desc">Description</Label>
            <textarea
              id="task-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional notes or instructions…"
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-note">Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <textarea
              id="task-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Extra reminder shown on every occurrence of this task…"
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              role="checkbox"
              aria-checked={isGeneral}
              tabIndex={0}
              onClick={() => setIsGeneral(v => !v)}
              onKeyDown={e => e.key === ' ' && setIsGeneral(v => !v)}
              className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-ring ${
                isGeneral ? 'bg-primary' : 'bg-input'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  isGeneral ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
            <div>
              <p className="text-sm font-medium">General task</p>
              <p className="text-xs text-muted-foreground">
                Automatically assigned to all companies (current and future)
              </p>
            </div>
          </label>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {error instanceof Error ? error.message : 'Something went wrong'}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
