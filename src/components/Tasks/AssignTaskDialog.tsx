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
import { useAssignTask } from '@/hooks/useTasks';
import { useCompanies } from '@/hooks/useCompanies';
import type { AppTask } from '@/api/tasks';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: AppTask | null;
}

export function AssignTaskDialog({ open, onOpenChange, task }: Props) {
  const [companyId, setCompanyId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [cycle, setCycle] = useState('');

  const { data: companies = [] } = useCompanies();
  const mutation = useAssignTask();

  useEffect(() => {
    if (open) {
      setCompanyId('');
      setDueDate('');
      setCycle('');
      mutation.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !companyId) return;

    mutation.mutate(
      {
        taskId: task.id,
        data: {
          companyId: Number(companyId),
          dueDate: dueDate || undefined,
          cycle: cycle ? Number(cycle) : undefined,
        },
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Task to Company</DialogTitle>
        </DialogHeader>

        {task && (
          <p className="text-sm text-muted-foreground -mt-2 mb-1">
            Task: <span className="font-medium text-foreground">{task.title}</span>
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assign-company">Company *</Label>
            <select
              id="assign-company"
              value={companyId}
              onChange={e => setCompanyId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— Select a company —</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.businessName}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assign-due">Due Date</Label>
            <Input
              id="assign-due"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Leave blank for no due date.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assign-cycle">Repeat Every (days)</Label>
            <Input
              id="assign-cycle"
              type="number"
              min={1}
              value={cycle}
              onChange={e => setCycle(e.target.value)}
              placeholder="e.g. 30"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank for a one-time task.
            </p>
          </div>

          {mutation.isError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {mutation.error instanceof Error ? mutation.error.message : 'Something went wrong'}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!companyId || mutation.isPending}>
              {mutation.isPending ? 'Assigning…' : 'Assign'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
