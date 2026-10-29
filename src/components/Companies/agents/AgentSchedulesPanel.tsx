import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MonthDaySelect } from '@/components/ui/MonthDaySelect';
import { monthDayLabel, WEEKDAYS } from '@/lib/cycle';
import type { AgentSchedule, AgentScheduleInput, ScheduleCycle } from '@/api/agents';
import { useAgentSchedules } from '@/hooks/useAgentSchedules';
import { useAgentScheduleActions } from '@/hooks/useAgentScheduleActions';

const CYCLES: { value: ScheduleCycle; label: string }[] = [
  { value: 'DAILY', label: 'Every day' },
  { value: 'WEEKLY', label: 'Every week' },
  { value: 'MONTHLY', label: 'Every month' },
  { value: 'ONCE', label: 'Once' },
];

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring';

function describe(s: AgentSchedule): string {
  switch (s.cycle) {
    case 'DAILY':
      return `Every day at ${s.timeOfDay}`;
    case 'WEEKLY':
      return `Every ${WEEKDAYS[s.weekday ?? 1]} at ${s.timeOfDay}`;
    case 'MONTHLY':
      return `Every month on ${monthDayLabel(s.monthDay ?? 1)} at ${s.timeOfDay}`;
    case 'ONCE':
      return `Once, ${s.runDate} at ${s.timeOfDay}`;
  }
}

function fmt(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '—';
}

/**
 * step12: what an agent does on its own clock ("every Monday at 9:00, check the bank
 * feeds"). Times are Toronto time. Kept and run by the agents server.
 */
export function AgentSchedulesPanel({
  companyId,
  agentId,
}: {
  companyId: number;
  agentId: number;
}) {
  const schedules = useAgentSchedules(companyId, agentId);
  const change = useAgentScheduleActions(companyId, agentId);
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Work the agent starts on its own, at a time you set (Toronto time).
      </p>

      {schedules.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : schedules.isError ? (
        <p className="text-sm text-destructive">{(schedules.error as Error).message}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {schedules.data?.length === 0 && !adding && (
            <li className="text-sm text-muted-foreground">No schedules yet.</li>
          )}
          {schedules.data?.map((s) => (
            <li key={s.id} className="flex items-start gap-3 rounded-md border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{s.title}</p>
                <p className="text-xs text-muted-foreground">
                  {describe(s)} · next {s.enabled ? fmt(s.nextRunAt) : 'off'}
                  {s.lastRunAt ? ` · last ${fmt(s.lastRunAt)}` : ''}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs">{s.instruction}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={change.isPending}
                onClick={() =>
                  change.mutate({
                    action: 'update',
                    scheduleId: s.id,
                    input: { enabled: !s.enabled },
                  })
                }
              >
                {s.enabled ? 'Pause' : 'Resume'}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Delete ${s.title}`}
                disabled={change.isPending}
                onClick={() => change.mutate({ action: 'delete', scheduleId: s.id })}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <ScheduleForm
          busy={change.isPending}
          onCancel={() => setAdding(false)}
          onSave={(input) =>
            change.mutate({ action: 'add', input }, { onSuccess: () => setAdding(false) })
          }
        />
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setAdding(true)}>
          <Plus className="mr-1 size-4" />
          Add schedule
        </Button>
      )}
      {change.isError && (
        <p className="text-sm text-destructive">{(change.error as Error).message}</p>
      )}
    </div>
  );
}

function ScheduleForm({
  busy,
  onSave,
  onCancel,
}: {
  busy: boolean;
  onSave: (input: AgentScheduleInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [instruction, setInstruction] = useState('');
  const [cycle, setCycle] = useState<ScheduleCycle>('WEEKLY');
  const [timeOfDay, setTimeOfDay] = useState('09:00');
  const [weekday, setWeekday] = useState(1);
  const [monthDay, setMonthDay] = useState(1);
  const [runDate, setRunDate] = useState('');

  const valid =
    title.trim() &&
    instruction.trim() &&
    /^\d{2}:\d{2}$/.test(timeOfDay) &&
    (cycle !== 'ONCE' || /^\d{4}-\d{2}-\d{2}$/.test(runDate));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      title: title.trim(),
      instruction: instruction.trim(),
      cycle,
      timeOfDay,
      ...(cycle === 'WEEKLY' ? { weekday } : {}),
      ...(cycle === 'MONTHLY' ? { monthDay } : {}),
      ...(cycle === 'ONCE' ? { runDate } : {}),
    });
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="schedule-title">Title</Label>
        <Input
          id="schedule-title"
          value={title}
          maxLength={191}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Weekly bank feed check"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="schedule-instruction">What to do</Label>
        <Textarea
          id="schedule-instruction"
          value={instruction}
          rows={3}
          maxLength={8000}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="e.g. Log in to QuickBooks, categorise last week's bank transactions, and tell me anything you could not match."
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="schedule-cycle">Repeats</Label>
          <select
            id="schedule-cycle"
            className={SELECT_CLASS}
            value={cycle}
            onChange={(e) => setCycle(e.target.value as ScheduleCycle)}
          >
            {CYCLES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        {cycle === 'WEEKLY' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="schedule-weekday">On</Label>
            <select
              id="schedule-weekday"
              className={SELECT_CLASS}
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
            >
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}
        {cycle === 'MONTHLY' && (
          <div className="flex flex-col gap-1.5">
            <Label>On</Label>
            <MonthDaySelect value={monthDay} onChange={setMonthDay} />
          </div>
        )}
        {cycle === 'ONCE' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="schedule-date">On</Label>
            <Input
              id="schedule-date"
              type="date"
              value={runDate}
              onChange={(e) => setRunDate(e.target.value)}
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="schedule-time">At</Label>
          <Input
            id="schedule-time"
            type="time"
            value={timeOfDay}
            onChange={(e) => setTimeOfDay(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!valid || busy}>
          {busy ? 'Saving…' : 'Add'}
        </Button>
      </div>
    </form>
  );
}
