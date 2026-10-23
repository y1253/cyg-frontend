import { AlertTriangle, Bot, Lightbulb, Mail, MessageCircle, MessageSquareText, Phone, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';
import type { AiAction, AiChannel, CustomerAi } from '@/api/aiRules';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCustomerAi, useDeleteCustomerAiRule } from '@/hooks/useAiRules';
import { cn } from '@/lib/utils';
import { fmtDateTime } from '../customer-format';

const CHANNEL: Record<AiChannel, { label: string; icon: React.ReactNode; className: string }> = {
  BOT: { label: 'Bot', icon: <Bot size={11} />, className: 'border-indigo-200 text-indigo-700' },
  SMS: { label: 'Text', icon: <MessageSquareText size={11} />, className: 'border-sky-200 text-sky-700' },
  WHATSAPP: { label: 'WhatsApp', icon: <MessageCircle size={11} />, className: 'border-emerald-200 text-emerald-700' },
  EMAIL: { label: 'Email', icon: <Mail size={11} />, className: 'border-amber-200 text-amber-700' },
  VOICE: { label: 'Phone', icon: <Phone size={11} />, className: 'border-violet-200 text-violet-700' },
};

const ESCALATION_LABEL: Record<string, string> = {
  RUNNING: 'checking…',
  FIXED: 'fixed',
  NOT_AN_ISSUE: 'no mistake found',
  UNSURE: 'unsure',
  FAILED: 'check failed',
};

/**
 * Customer detail page: what the customer site's AI assistant learned about this customer
 * (their private rules, active at once — staff can remove one) and every message between
 * them and the assistant on every channel, with what the assistant changed (step11).
 */
export function CustomerAiCard({ customerId }: { customerId: number }) {
  const { data, isLoading, isError } = useCustomerAi(customerId);
  const remove = useDeleteCustomerAiRule(customerId);
  const rules = data?.rules ?? [];
  const messages = data?.messages ?? [];

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles size={14} className="text-muted-foreground" />
          AI assistant
          <span className="font-normal text-muted-foreground">· {messages.length} messages</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          What the assistant learned about this customer, and their conversations on the site, by text and by WhatsApp.
        </p>
      </CardHeader>
      {isLoading ? (
        <div className="p-4">
          <div className="h-12 animate-pulse rounded-md bg-muted" />
        </div>
      ) : isError ? (
        <p className="p-6 text-center text-sm text-destructive">Could not load the AI assistant history.</p>
      ) : (
        <CardContent className="flex flex-col gap-5 py-4">
          <section>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Private rules · {rules.length}
            </h4>
            {!rules.length ? (
              <p className="text-sm text-muted-foreground">The assistant has not learned anything private yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {rules.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p>{r.text}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.companyName ?? 'Personal book'} · {r.topic.toLowerCase()} · {fmtDateTime(r.createdAt)}
                      </p>
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Delete rule"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(r.id)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {remove.error && <p className="mt-2 text-xs text-destructive">{remove.error.message}</p>}
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Messages</h4>
            {!messages.length ? (
              <p className="text-sm text-muted-foreground">No messages with the assistant yet.</p>
            ) : (
              <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto pr-1">
                {messages.map((m) => (
                  <MessageRow key={m.id} m={m} />
                ))}
              </ul>
            )}
          </section>
        </CardContent>
      )}
    </Card>
  );
}

function MessageRow({ m }: { m: CustomerAi['messages'][number] }) {
  const channel = CHANNEL[m.channel] ?? CHANNEL.BOT;
  const assistant = m.role === 'ASSISTANT';
  const actions = Array.isArray(m.actions) ? (m.actions as AiAction[]) : [];
  return (
    <li className={cn('rounded-lg border px-3 py-2', assistant ? 'bg-indigo-50/50' : 'bg-white')}>
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{assistant ? 'Assistant' : 'Customer'}</span>
        <Badge variant="outline" className={cn('gap-1 px-1.5 py-0 text-[10px]', channel.className)}>
          {channel.icon}
          {channel.label}
        </Badge>
        <span>{m.companyName ?? 'Personal book'}</span>
        <span className="ml-auto">{fmtDateTime(m.createdAt)}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{m.text}</p>
      {m.escalation && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-indigo-50 px-2 py-1 text-xs text-indigo-800">
          <ShieldAlert size={12} className="mt-px shrink-0" />
          <span>
            Reported a mistake — strong AI: {ESCALATION_LABEL[m.escalation.verdict] ?? m.escalation.verdict.toLowerCase()}
            {m.escalation.summary && `. ${m.escalation.summary}`}
          </span>
        </p>
      )}
      {m.featureRequest && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-indigo-50 px-2 py-1 text-xs text-indigo-800">
          <Lightbulb size={12} className="mt-px shrink-0" />
          <span>
            Asked for a new feature: {m.featureRequest.summary} ({m.featureRequest.status.toLowerCase()})
          </span>
        </p>
      )}
      {m.warning && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
          <AlertTriangle size={12} className="mt-px shrink-0" />
          {m.warning}
        </p>
      )}
      {actions.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-muted-foreground">
          {actions.map((a, i) => (
            <li key={i} className={cn(a.ok === false && 'text-destructive')}>
              • {a.summary ?? a.tool ?? 'action'}
              {a.ok === false && ' (failed)'}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
