import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { AgentMessageType, AgentRun } from '@/api/agents';
import { useAgentActivity } from '@/hooks/useAgentActivity';
import { useAgentRun } from '@/hooks/useAgentRun';
import { cn } from '@/lib/utils';

const STATUS: Record<AgentRun['status'], { label: string; className: string }> = {
  RUNNING: {
    label: 'Working',
    className: 'bg-sky-100 text-sky-800 border-sky-200',
  },
  WAITING: {
    label: 'Waiting for you',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  DONE: {
    label: 'Done',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  FAILED: {
    label: 'Failed',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  SKIPPED: {
    label: 'Skipped',
    className: 'bg-muted text-muted-foreground border-border',
  },
};

/** step11 part 2: where a line came from — staff's chat, the internal app, its schedule. */
const TYPE: Record<AgentMessageType, { label: string; className: string }> = {
  CHAT: {
    label: 'Chat',
    className: 'bg-violet-100 text-violet-800 border-violet-200',
  },
  API: {
    label: 'API',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  SCHEDULE: {
    label: 'Schedule',
    className: 'bg-teal-100 text-teal-800 border-teal-200',
  },
};

function TypeTag({ type }: { type: AgentMessageType }) {
  const t = TYPE[type] ?? TYPE.API;
  return (
    <span
      className={cn(
        'shrink-0 rounded border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide',
        t.className,
      )}
    >
      {t.label}
    </span>
  );
}

const KIND: Record<AgentRun['kind'], string> = {
  CHAT: 'Chat',
  TASK: 'Task',
  CHANNEL: 'Message',
  SCHEDULE: 'Schedule',
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * step12: the agent's work log — every run on the agents server (what woke it, its
 * status) and, opened, every step it took: what it read, what it called, what came back.
 */
export function AgentActivityPanel({ companyId, agentId }: { companyId: number; agentId: number }) {
  const runs = useAgentActivity(companyId, agentId);
  const [open, setOpen] = useState<number | null>(null);

  if (runs.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (runs.isError) {
    return <p className="text-sm text-destructive">{(runs.error as Error).message}</p>;
  }
  if (!runs.data?.length) {
    return <p className="text-sm text-muted-foreground">Nothing done yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {runs.data.map((r) => (
        <li key={r.id} className={cn('rounded-md border', r.status === 'SKIPPED' && 'opacity-60')}>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left"
            onClick={() => setOpen(open === r.id ? null : r.id)}
          >
            {open === r.id ? (
              <ChevronDown className="size-4 shrink-0" />
            ) : (
              <ChevronRight className="size-4 shrink-0" />
            )}
            <Badge variant="secondary">{KIND[r.kind]}</Badge>
            <TypeTag type={r.type} />
            <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
            <span
              className={cn(
                'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium',
                STATUS[r.status].className,
              )}
            >
              {STATUS[r.status].label}
            </span>
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              {fmt(r.createdAt)}
            </span>
          </button>
          {r.error && <p className="px-3 pb-2 text-xs text-destructive">{r.error}</p>}
          {open === r.id && <RunTranscript companyId={companyId} agentId={agentId} runId={r.id} />}
        </li>
      ))}
    </ul>
  );
}

function RunTranscript({
  companyId,
  agentId,
  runId,
}: {
  companyId: number;
  agentId: number;
  runId: number;
}) {
  const run = useAgentRun(companyId, agentId, runId);
  if (run.isLoading) {
    return <p className="px-3 pb-3 text-xs text-muted-foreground">Loading…</p>;
  }
  if (run.isError || !run.data) {
    return <p className="px-3 pb-3 text-xs text-destructive">Could not load the steps.</p>;
  }
  return (
    <ol className="flex max-h-96 flex-col gap-2 overflow-y-auto border-t bg-muted/30 px-3 py-2 text-xs">
      {run.data.messages.map((m, i) => (
        <li key={i} className="flex items-start gap-2">
          <TypeTag type={m.type} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {m.role === 'assistant' && m.toolCalls?.length ? (
              m.toolCalls.map((c, j) => (
                <code
                  key={j}
                  className="block whitespace-pre-wrap break-all rounded bg-background px-2 py-1"
                >
                  → {c.name} {c.arguments}
                </code>
              ))
            ) : (
              <p className="whitespace-pre-wrap break-words">
                <span className="font-semibold">
                  {m.role === 'user'
                    ? m.type === 'CHAT'
                      ? 'Staff'
                      : 'Woken by'
                    : m.role === 'tool'
                      ? 'Result'
                      : 'Agent'}
                  :
                </span>{' '}
                {(m.content ?? '').slice(0, 2000)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
