import { useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { LearningKind } from '@/api/agents';
import { useAgentLearnings } from '@/hooks/useAgentLearnings';
import { useAgentLearningActions } from '@/hooks/useAgentLearningActions';

const KIND_LABEL: Record<LearningKind, string> = {
  RULE: 'Rule',
  PROCEDURE: 'How to',
  FACT: 'Fact',
  LESSON: 'Lesson',
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * step11: what the agent wrote down for itself — rules, procedures, facts and lessons it
 * learned on the job. They are read into every run. Staff can correct or delete one; the
 * agent writes them (it is told to whenever it is corrected or finds how a job is done).
 */
export function AgentLearningsPanel({
  companyId,
  agentId,
}: {
  companyId: number;
  agentId: number;
}) {
  const learnings = useAgentLearnings(companyId, agentId);
  const change = useAgentLearningActions(companyId, agentId);
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        What the agent noted for itself while working. It reads these every time it works,
        so it gets better at the job. Correct or delete anything that is wrong — to give it
        an instruction, use Rules instead.
      </p>

      {learnings.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : learnings.isError ? (
        <p className="text-sm text-destructive">{(learnings.error as Error).message}</p>
      ) : !learnings.data?.length ? (
        <p className="text-sm text-muted-foreground">Nothing learned yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {learnings.data.map((l) => (
            <li key={l.id} className="flex items-start gap-2 rounded-md border px-3 py-2">
              <Badge variant="secondary" className="mt-0.5 shrink-0">
                {KIND_LABEL[l.kind] ?? l.kind}
              </Badge>
              {editing?.id === l.id ? (
                <>
                  <Textarea
                    value={editing.text}
                    rows={2}
                    maxLength={500}
                    onChange={(e) => setEditing({ id: l.id, text: e.target.value })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Save note"
                    disabled={!editing.text.trim() || change.isPending}
                    onClick={() =>
                      change.mutate(
                        {
                          action: 'update',
                          learningId: l.id,
                          text: editing.text.trim(),
                        },
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
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap text-sm">{l.text}</p>
                    <p className="text-xs text-muted-foreground">{fmt(l.createdAt)}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Edit note"
                    onClick={() => setEditing({ id: l.id, text: l.text })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete note"
                    disabled={change.isPending}
                    onClick={() => change.mutate({ action: 'delete', learningId: l.id })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {change.isError && (
        <p className="text-sm text-destructive">{(change.error as Error).message}</p>
      )}
    </div>
  );
}
