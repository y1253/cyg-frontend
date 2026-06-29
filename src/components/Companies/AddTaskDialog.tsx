import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTasks } from "@/hooks/useTasks";
import { useCreateSchedule } from "@/hooks/useTaskSchedules";
import type { CycleType } from "@/api/taskSchedules";
import { MonthDaySelect } from "@/components/ui/MonthDaySelect";
import { WEEKDAYS, ORDINALS, MONTHS, monthDayLabel } from "@/lib/cycle";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: number;
}

export function AddTaskDialog({ open, onOpenChange, companyId }: Props) {
  const [taskId, setTaskId] = useState("");
  const [cycleType, setCycleType] = useState<CycleType>("DAYS");
  const [cycleDays, setCycleDays] = useState("30");
  const [cycleDay, setCycleDay] = useState("1");
  const [cycleNth, setCycleNth] = useState("1");
  const [scheduleNote, setScheduleNote] = useState("");

  const { data: tasks = [] } = useTasks();
  const scheduleMutation = useCreateSchedule(companyId);

  const isPending = scheduleMutation.isPending;
  const error = scheduleMutation.error;

  useEffect(() => {
    if (open) {
      setTaskId("");
      setCycleType("DAYS");
      setCycleDays("30");
      setCycleDay("1");
      setCycleNth("1");
      setScheduleNote("");
      scheduleMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function buildSchedulePayload() {
    const base = { taskId: Number(taskId), companyId, cycleType, note: scheduleNote.trim() || undefined };
    if (cycleType === "DAYS") {
      return { ...base, cycle: Number(cycleDays) || 30 };
    }
    if (cycleType === "MONTHLY_DATE") {
      return { ...base, cycleDay: Number(cycleDay) };
    }
    if (cycleType === "WEEKLY_DAY") {
      return { ...base, cycleDay: Number(cycleDay) };
    }
    if (cycleType === "QUARTERLY") {
      return { ...base, cycleDay: Number(cycleDay) };
    }
    if (cycleType === "YEARLY") {
      return { ...base, cycleDay: Number(cycleDay), cycleNth: Number(cycleNth) };
    }
    // MONTHLY_WEEKDAY
    return { ...base, cycleDay: Number(cycleDay), cycleNth: Number(cycleNth) };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!taskId) return;
    scheduleMutation.mutate(buildSchedulePayload(), {
      onSuccess: () => onOpenChange(false),
    });
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
              onChange={(e) => setTaskId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— Select a task —</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-3">
            {/* Cycle type */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-cycle-type">Repeat</Label>
              <select
                id="add-cycle-type"
                value={cycleType}
                onChange={(e) => setCycleType(e.target.value as CycleType)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="DAYS">Every N days</option>
                <option value="MONTHLY_DATE">Monthly — specific date</option>
                <option value="WEEKLY_DAY">Weekly — specific day</option>
                <option value="MONTHLY_WEEKDAY">Monthly — Nth weekday</option>
                <option value="QUARTERLY">Quarterly — specific date</option>
                <option value="YEARLY">Yearly — specific date</option>
              </select>
            </div>

            {/* Cycle-type-specific inputs */}
            {cycleType === "DAYS" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-cycle-days">Every (days)</Label>
                <Input
                  id="add-cycle-days"
                  type="number"
                  min={1}
                  value={cycleDays}
                  onChange={(e) => setCycleDays(e.target.value)}
                  placeholder="30"
                />
                <p className="text-xs text-muted-foreground">
                  First todo due in {Number(cycleDays) || 30} days.
                </p>
              </div>
            )}

            {cycleType === "MONTHLY_DATE" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-cycle-date">Day of month</Label>
                <MonthDaySelect
                  id="add-cycle-date"
                  value={cycleDay}
                  onChange={(v) => setCycleDay(String(v))}
                />
                <p className="text-xs text-muted-foreground">
                  Repeats on {monthDayLabel(cycleDay)} of each month.
                </p>
              </div>
            )}

            {cycleType === "WEEKLY_DAY" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-cycle-weekday">Day of week</Label>
                <select
                  id="add-cycle-weekday"
                  value={cycleDay}
                  onChange={(e) => setCycleDay(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {WEEKDAYS.map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Repeats every {WEEKDAYS[Number(cycleDay)]}.
                </p>
              </div>
            )}

            {cycleType === "MONTHLY_WEEKDAY" && (
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <Label htmlFor="add-cycle-nth">Which</Label>
                    <select
                      id="add-cycle-nth"
                      value={cycleNth}
                      onChange={(e) => setCycleNth(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {ORDINALS.map((o, i) => (
                        <option key={i + 1} value={i + 1}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <Label htmlFor="add-cycle-mwd">Weekday</Label>
                    <select
                      id="add-cycle-mwd"
                      value={cycleDay}
                      onChange={(e) => setCycleDay(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {WEEKDAYS.map((d, i) => (
                        <option key={i} value={i}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Repeats on the {ORDINALS[Number(cycleNth) - 1]} {WEEKDAYS[Number(cycleDay)]} of each month.
                </p>
              </div>
            )}

            {cycleType === "QUARTERLY" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-cycle-quarterly">Day of month</Label>
                <MonthDaySelect
                  id="add-cycle-quarterly"
                  value={cycleDay}
                  onChange={(v) => setCycleDay(String(v))}
                />
                <p className="text-xs text-muted-foreground">
                  Repeats every 3 months on {monthDayLabel(cycleDay)}.
                </p>
              </div>
            )}

            {cycleType === "YEARLY" && (
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <Label htmlFor="add-cycle-yearly-month">Month</Label>
                    <select
                      id="add-cycle-yearly-month"
                      value={cycleNth}
                      onChange={(e) => setCycleNth(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {MONTHS.map((m, i) => (
                        <option key={i + 1} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <Label htmlFor="add-cycle-yearly-day">Day</Label>
                    <MonthDaySelect
                      id="add-cycle-yearly-day"
                      value={cycleDay}
                      onChange={(v) => setCycleDay(String(v))}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Repeats every year on {MONTHS[Number(cycleNth) - 1]} ({monthDayLabel(cycleDay)}).
                </p>
              </div>
            )}

            {/* Note */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-schedule-note">
                Note{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <textarea
                id="add-schedule-note"
                value={scheduleNote}
                onChange={(e) => setScheduleNote(e.target.value)}
                placeholder="Company-specific reminder for this task…"
                rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {error instanceof Error ? error.message : "Something went wrong"}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!taskId || isPending}>
              {isPending ? "Adding…" : "Add Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
