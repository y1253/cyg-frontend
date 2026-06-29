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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateTask, useUpdateTask } from '@/hooks/useTasks';
import type { AppTask, TaskCycleType } from '@/api/tasks';
import { MonthDaySelect } from '@/components/ui/MonthDaySelect';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = ['', '1st', '2nd', '3rd', '4th'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function ordinal(n: number) { return ORDINALS[n] ?? `${n}th`; }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: AppTask | null;
}

export function TaskDialog({ open, onOpenChange, task }: Props) {
  const isEdit = !!task;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [defaultCycleType, setDefaultCycleType] = useState<TaskCycleType>('DAYS');
  const [defaultCycle, setDefaultCycle] = useState(30);
  const [defaultCycleDay, setDefaultCycleDay] = useState(0);
  const [defaultCycleNth, setDefaultCycleNth] = useState(1);
  const [isImportant, setIsImportant] = useState(false);
  const [canBeDisabled, setCanBeDisabled] = useState(false);
  const [isSnoozable, setIsSnoozable] = useState(false);

  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const isPending = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error ?? updateMutation.error;

  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? '');
      setDescription(task?.description ?? '');
      setDefaultCycleType(task?.defaultCycleType ?? 'DAYS');
      setDefaultCycle(task?.defaultCycle ?? 30);
      setDefaultCycleDay(task?.defaultCycleDay ?? 0);
      setDefaultCycleNth(task?.defaultCycleNth ?? 1);
      setIsImportant(task?.isImportant ?? false);
      setCanBeDisabled(task?.canBeDisabled ?? false);
      setIsSnoozable(task?.isSnoozable ?? false);
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
      isGeneral: true,
      defaultCycleType,
      defaultCycle: defaultCycleType === 'DAYS' ? defaultCycle : undefined,
      defaultCycleDay: defaultCycleType !== 'DAYS' ? defaultCycleDay : undefined,
      defaultCycleNth: (defaultCycleType === 'MONTHLY_WEEKDAY' || defaultCycleType === 'YEARLY') ? defaultCycleNth : undefined,
      isImportant,
      canBeDisabled,
      isSnoozable,
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

          {/* Default recurrence */}
          <div className="flex flex-col gap-2">
            <Label>Default recurrence</Label>
            <Select value={defaultCycleType} onValueChange={v => setDefaultCycleType(v as TaskCycleType)}>
              <SelectTrigger>
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

            {defaultCycleType === 'DAYS' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Every</span>
                <Input
                  type="number"
                  min={1}
                  value={defaultCycle}
                  onChange={e => setDefaultCycle(Math.max(1, Number(e.target.value) || 1))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            )}

            {defaultCycleType === 'MONTHLY_DATE' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Day</span>
                <MonthDaySelect
                  value={defaultCycleDay}
                  onChange={setDefaultCycleDay}
                  className="w-40"
                />
                <span className="text-sm text-muted-foreground">of each month</span>
              </div>
            )}

            {defaultCycleType === 'WEEKLY_DAY' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Every</span>
                <Select value={String(defaultCycleDay)} onValueChange={v => setDefaultCycleDay(Number(v))}>
                  <SelectTrigger className="w-36">
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

            {defaultCycleType === 'MONTHLY_WEEKDAY' && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Every</span>
                <Select value={String(defaultCycleNth)} onValueChange={v => setDefaultCycleNth(Number(v))}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map(n => (
                      <SelectItem key={n} value={String(n)}>{ordinal(n)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(defaultCycleDay)} onValueChange={v => setDefaultCycleDay(Number(v))}>
                  <SelectTrigger className="w-36">
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

            {defaultCycleType === 'QUARTERLY' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Day</span>
                <MonthDaySelect
                  value={defaultCycleDay}
                  onChange={setDefaultCycleDay}
                  className="w-40"
                />
                <span className="text-sm text-muted-foreground">of month (every 3 months)</span>
              </div>
            )}

            {defaultCycleType === 'YEARLY' && (
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={String(defaultCycleNth)} onValueChange={v => setDefaultCycleNth(Number(v))}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <MonthDaySelect
                  value={defaultCycleDay}
                  onChange={setDefaultCycleDay}
                  className="w-40"
                />
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              How often this task repeats for each company.
            </p>
          </div>

          {/* Important toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              role="checkbox"
              aria-checked={isImportant}
              tabIndex={0}
              onClick={() => setIsImportant(v => !v)}
              onKeyDown={e => e.key === ' ' && setIsImportant(v => !v)}
              className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-ring ${
                isImportant ? 'bg-amber-500' : 'bg-input'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  isImportant ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
            <div>
              <p className="text-sm font-medium">Mark as important</p>
              <p className="text-xs text-muted-foreground">
                Important tasks are highlighted and sorted to the top in each company.
              </p>
            </div>
          </label>

          {/* Can be disabled toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              role="checkbox"
              aria-checked={canBeDisabled}
              tabIndex={0}
              onClick={() => setCanBeDisabled(v => !v)}
              onKeyDown={e => e.key === ' ' && setCanBeDisabled(v => !v)}
              className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-ring ${
                canBeDisabled ? 'bg-blue-500' : 'bg-input'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  canBeDisabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
            <div>
              <p className="text-sm font-medium">Allow disabling schedule</p>
              <p className="text-xs text-muted-foreground">
                When enabled, admins can disable this task's schedule per company.
              </p>
            </div>
          </label>

          {/* Snoozable toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              role="checkbox"
              aria-checked={isSnoozable}
              tabIndex={0}
              onClick={() => setIsSnoozable(v => !v)}
              onKeyDown={e => e.key === ' ' && setIsSnoozable(v => !v)}
              className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-ring ${
                isSnoozable ? 'bg-slate-500' : 'bg-input'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  isSnoozable ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
            <div>
              <p className="text-sm font-medium">Allow snooze</p>
              <p className="text-xs text-muted-foreground">
                Users can snooze todos for this task to hide them temporarily.
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
