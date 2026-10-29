import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAgentRules } from '@/hooks/useAgentRules';
import { useAgentRuleActions } from '@/hooks/useAgentRuleActions';

/**
 * step12: rules staff give the agents — the company's (`agentId: null`; every agent of
 * the company follows them) or one agent's own. They are read into the agent's
 * instructions on every run and override the project scope. Kept on the agents server.
 */
export function AgentRulesPanel({
  companyId,
  agentId,
  intro,
}: {
  companyId: number;
  agentId: number | null;
  intro: string;
}) {
  const rules = useAgentRules(companyId, agentId);
  const change = useAgentRuleActions(companyId, agentId);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    change.mutate({ action: 'add', text }, { onSuccess: () => setDraft('') });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{intro}</p>

      {rules.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rules.isError ? (
        <p className="text-sm text-destructive">{(rules.error as Error).message}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.data?.length === 0 && (
            <li className="text-sm text-muted-foreground">No rules yet.</li>
          )}
          {rules.data?.map((r) => (
            <li key={r.id} className="flex items-start gap-2 rounded-md border px-3 py-2">
              {editing?.id === r.id ? (
                <>
                  <Textarea
                    value={editing.text}
                    rows={2}
                    maxLength={4000}
                    onChange={(e) => setEditing({ id: r.id, text: e.target.value })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Save rule"
                    disabled={!editing.text.trim() || change.isPending}
                    onClick={() =>
                      change.mutate(
                        { action: 'update', ruleId: r.id, text: editing.text.trim() },
                        { onSuccess: () => setEditing(null) },
                      )
                    }
                  >
                    <Check className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Cancel"
                    onClick={() => setEditing(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </>
              ) : (
                <>
                  <p className="flex-1 whitespace-pre-wrap text-sm">{r.text}</p>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Edit rule"
                    onClick={() => setEditing({ id: r.id, text: r.text })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete rule"
                    disabled={change.isPending}
                    onClick={() => change.mutate({ action: 'delete', ruleId: r.id })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          rows={2}
          maxLength={4000}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Never pay a bill over $1,000 without asking. Always write to this client in French."
        />
        <Button onClick={add} disabled={!draft.trim() || change.isPending}>
          <Plus className="mr-1 size-4" />
          Add
        </Button>
      </div>
      {change.isError && (
        <p className="text-sm text-destructive">{(change.error as Error).message}</p>
      )}
    </div>
  );
}
