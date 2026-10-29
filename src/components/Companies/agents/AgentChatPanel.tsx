import { useEffect, useRef, useState } from 'react';
import { Bot, Check, CircleHelp, ListChecks, Send, ShieldQuestion, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { AgentMessage } from '@/api/agents';
import { useAgentMessages } from '@/hooks/useAgentMessages';
import { useSendAgentMessage } from '@/hooks/useSendAgentMessage';
import { cn } from '@/lib/utils';

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * step12: the conversation with one agent (`AgentMessage`). Staff write here; the agent
 * answers, asks questions, reports what it did (TASK_UPDATE) and — depending on its
 * approval mode — asks before acting (APPROVAL_REQUEST, answered with Approve / Deny).
 * The company manager's chat is the "company chat".
 */
export function AgentChatPanel({
  companyId,
  agentId,
  agentName,
}: {
  companyId: number;
  agentId: number;
  agentName: string;
}) {
  const messages = useAgentMessages(companyId, agentId);
  const send = useSendAgentMessage(companyId, agentId);
  const [draft, setDraft] = useState('');
  const [answering, setAnswering] = useState<AgentMessage | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const count = messages.data?.length ?? 0;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [count]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    send.mutate(
      { body, kind: 'MESSAGE', replyToId: answering?.id },
      {
        onSuccess: () => {
          setDraft('');
          setAnswering(null);
        },
      },
    );
  };

  const decide = (m: AgentMessage, approved: boolean) =>
    send.mutate({
      body: approved ? 'Approved' : 'Denied',
      kind: 'APPROVAL_ANSWER',
      replyToId: m.id,
      approved,
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-h-[28rem] min-h-40 flex-col gap-2 overflow-y-auto rounded-lg border bg-muted/30 p-3">
        {messages.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : messages.isError ? (
          <p className="text-sm text-destructive">{(messages.error as Error).message}</p>
        ) : count === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No messages yet. Write to {agentName} below — it answers here, and asks here
            before it does anything that needs your approval.
          </p>
        ) : (
          messages.data!.map((m) => (
            <ChatBubble
              key={m.id}
              message={m}
              busy={send.isPending}
              onDecide={decide}
              onAnswer={() => setAnswering(m)}
            />
          ))
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2">
        {answering && (
          <div className="flex items-center justify-between gap-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
            <span className="truncate">Answering: {answering.body}</span>
            <button
              type="button"
              aria-label="Stop answering"
              onClick={() => setAnswering(null)}
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            rows={2}
            maxLength={20000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={`Write to ${agentName}…`}
          />
          <Button type="submit" size="icon" disabled={!draft.trim() || send.isPending}>
            <Send className="size-4" />
          </Button>
        </div>
        {send.isError && (
          <p className="text-sm text-destructive">{(send.error as Error).message}</p>
        )}
      </form>
    </div>
  );
}

function ChatBubble({
  message: m,
  busy,
  onDecide,
  onAnswer,
}: {
  message: AgentMessage;
  busy: boolean;
  onDecide: (m: AgentMessage, approved: boolean) => void;
  onAnswer: () => void;
}) {
  const fromStaff = m.direction === 'TO_AGENT';

  if (m.kind === 'TASK_UPDATE') {
    return (
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <ListChecks className="mt-0.5 size-3.5 shrink-0 text-[#3BBFB4]" />
        <span className="whitespace-pre-wrap">{m.body}</span>
        <span className="ml-auto shrink-0">{fmtTime(m.createdAt)}</span>
      </div>
    );
  }

  const isApproval = m.kind === 'APPROVAL_REQUEST';
  const isQuestion = m.kind === 'QUESTION';
  const open = (isApproval || isQuestion) && !m.answeredAt;

  return (
    <div className={cn('flex', fromStaff ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm',
          fromStaff
            ? 'bg-[#3BBFB4] text-white'
            : isApproval
              ? 'border border-amber-300 bg-amber-50'
              : isQuestion
                ? 'border border-sky-300 bg-sky-50'
                : 'bg-background',
        )}
      >
        {!fromStaff && (isApproval || isQuestion) && (
          <div
            className={cn(
              'mb-1 flex items-center gap-1 text-xs font-semibold',
              isApproval ? 'text-amber-800' : 'text-sky-800',
            )}
          >
            {isApproval ? (
              <ShieldQuestion className="size-3.5" />
            ) : (
              <CircleHelp className="size-3.5" />
            )}
            {isApproval ? 'Asks for approval' : 'Question'}
          </div>
        )}
        {!fromStaff && !isApproval && !isQuestion && (
          <Bot className="mb-1 size-3.5 text-[#3BBFB4]" />
        )}
        <p className="whitespace-pre-wrap break-words">{m.body}</p>

        {isApproval && open && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => onDecide(m, true)}>
              <Check className="mr-1 size-3.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onDecide(m, false)}
            >
              <X className="mr-1 size-3.5" />
              Deny
            </Button>
          </div>
        )}
        {isApproval && !open && m.approved !== null && (
          <p
            className={cn(
              'mt-1 text-xs font-medium',
              m.approved ? 'text-emerald-700' : 'text-destructive',
            )}
          >
            {m.approved ? 'Approved' : 'Denied'}
          </p>
        )}
        {isQuestion && open && (
          <Button size="sm" variant="outline" className="mt-2" onClick={onAnswer}>
            Answer
          </Button>
        )}

        <p
          className={cn(
            'mt-1 text-[10px]',
            fromStaff ? 'text-white/80' : 'text-muted-foreground',
          )}
        >
          {fromStaff && m.userName ? `${m.userName} · ` : ''}
          {fmtTime(m.createdAt)}
        </p>
      </div>
    </div>
  );
}
