import { useState } from 'react';
import { Check, Pencil, Sparkles, Trash2, X } from 'lucide-react';
import type { AiRule, AiRuleStatus } from '@/api/aiRules';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useAiRules, useDeleteAiRule, useUpdateAiRule } from '@/hooks/useAiRules';
import { cn } from '@/lib/utils';
import { fmtDateTime } from '../customer-format';

const SECTIONS: { status: AiRuleStatus; title: string; empty: string }[] = [
  { status: 'PENDING', title: 'Waiting for review', empty: 'Nothing to review.' },
  { status: 'ACTIVE', title: 'Active', empty: 'No active rules yet.' },
  { status: 'REJECTED', title: 'Rejected', empty: 'None rejected.' },
];

/**
 * Firm-wide rules the customer site's AI assistant proposed from a customer's chat (step11).
 * Nothing here reaches any AI step until it is approved: one customer's chat must never
 * change how every customer's books are read. Rules private to one customer apply at once
 * and are shown on that customer's page instead.
 */
export function AiRulesPanel() {
  return (
    <div className="flex flex-col gap-5">
      <Card className="border-indigo-100">
        <CardContent className="flex items-start gap-4 py-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <Sparkles size={20} />
          </span>
          <div className="text-sm">
            <p className="font-medium">How it works</p>
            <p className="text-muted-foreground">
              When a customer explains to the AI why a receipt was not matched, it saves a short rule. Rules that would
              help every customer wait here; once approved, every AI step reads them before it works. Keep them short.
            </p>
          </div>
        </CardContent>
      </Card>
      {SECTIONS.map((s) => (
        <RuleSection key={s.status} {...s} />
      ))}
    </div>
  );
}

function RuleSection({ status, title, empty }: { status: AiRuleStatus; title: string; empty: string }) {
  const { data: rules = [], isLoading, isError } = useAiRules(status);
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
        <span className="rounded-full bg-indigo-100 px-1.5 text-[11px] text-indigo-800">{rules.length}</span>
      </h3>
      {isError && <p className="text-sm text-destructive">Could not load the rules.</p>}
      {isLoading ? (
        <div className="h-14 animate-pulse rounded-xl bg-muted" />
      ) : !rules.length ? (
        <p className="rounded-xl border border-dashed border-indigo-200 bg-white/60 px-4 py-5 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((r) => (
            <RuleRow key={r.id} rule={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RuleRow({ rule }: { rule: AiRule }) {
  const update = useUpdateAiRule();
  const remove = useDeleteAiRule();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(rule.text);
  const busy = update.isPending || remove.isPending;
  const error = update.error ?? remove.error;

  return (
    <li
      className={cn(
        'rounded-xl border bg-white px-4 py-3',
        rule.status === 'PENDING' ? 'border-indigo-200' : 'border-border',
      )}
    >
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea value={text} maxLength={200} rows={2} onChange={(e) => setText(e.target.value)} />
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-xs text-muted-foreground">{text.trim().length} / 200</span>
            <Button size="sm" variant="outline" onClick={() => (setEditing(false), setText(rule.text))}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy || text.trim().length < 3}
              onClick={() =>
                update.mutate({ id: rule.id, text: text.trim() }, { onSuccess: () => setEditing(false) })
              }
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{rule.text}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <Badge variant="outline" className="mr-1.5 border-indigo-200 px-1.5 py-0 text-[10px] text-indigo-700">
                {rule.topic.toLowerCase()}
              </Badge>
              {rule.sourceCustomer ? `From ${rule.sourceCustomer.name || 'a customer'}${rule.sourceCustomer.email ? ` (${rule.sourceCustomer.email})` : ''}` : 'From a customer chat'}
              {' · '}
              {fmtDateTime(rule.createdAt)}
              {rule.reviewedBy && ` · reviewed by ${rule.reviewedBy.name}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {rule.status !== 'ACTIVE' && (
              <Button
                size="sm"
                className="h-7 gap-1 bg-indigo-600 text-white hover:bg-indigo-700"
                disabled={busy}
                onClick={() => update.mutate({ id: rule.id, status: 'ACTIVE' })}
              >
                <Check size={13} /> Approve
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 gap-1" disabled={busy} onClick={() => setEditing(true)}>
              <Pencil size={13} /> Edit
            </Button>
            {rule.status === 'PENDING' ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={() => update.mutate({ id: rule.id, status: 'REJECTED' })}
              >
                <X size={13} /> Reject
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={() => remove.mutate(rule.id)}
              >
                <Trash2 size={13} /> Delete
              </Button>
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error.message}</p>}
    </li>
  );
}
