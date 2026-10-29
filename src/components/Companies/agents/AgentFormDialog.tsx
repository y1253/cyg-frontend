import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { APPROVAL_MODES, type Agent, type ApprovalMode } from '@/api/agents';
import { useCreateAgent } from '@/hooks/useCreateAgent';
import { useUpdateAgent } from '@/hooks/useUpdateAgent';
import { cn } from '@/lib/utils';

/** The approval mode, as three cards with a sentence each — staff pick one at a glance. */
export function ApprovalModePicker({
  value,
  onChange,
}: {
  value: ApprovalMode;
  onChange: (mode: ApprovalMode) => void;
}) {
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Approval mode">
      {APPROVAL_MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          role="radio"
          aria-checked={value === m.value}
          onClick={() => onChange(m.value)}
          className={cn(
            'rounded-lg border px-3 py-2 text-left transition-colors',
            value === m.value
              ? 'border-[#3BBFB4] bg-[#3BBFB4]/10'
              : 'border-input hover:bg-muted/50',
          )}
        >
          <span className="block text-sm font-medium">{m.label}</span>
          <span className="block text-xs text-muted-foreground">{m.hint}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Create an agent (`agent` null) or edit one. The company's first agent also brings its
 * manager, which the server creates; the manager itself is edited here too.
 */
export function AgentFormDialog({
  companyId,
  agent,
  open,
  onOpenChange,
}: {
  companyId: number;
  agent: Agent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateAgent(companyId);
  const update = useUpdateAgent(companyId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<ApprovalMode>('ASK_SECURITY');

  useEffect(() => {
    if (!open) return;
    setName(agent?.name ?? '');
    setDescription(agent?.description ?? '');
    setMode(agent?.approvalMode ?? 'ASK_SECURITY');
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open only
  }, [open, agent]);

  const mutation = agent ? update : create;
  const isManager = agent?.role === 'MANAGER';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = {
      name: name.trim(),
      description: description.trim(),
      approvalMode: mode,
    };
    if (!input.name) return;
    const done = { onSuccess: () => onOpenChange(false) };
    if (agent) update.mutate({ id: agent.id, input }, done);
    else create.mutate(input, done);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{agent ? `Edit ${agent.name}` : 'Create agent'}</DialogTitle>
            <DialogDescription>
              {agent
                ? isManager
                  ? 'The company manager hands every task and message to the right agent.'
                  : 'Changes apply from its next step.'
                : 'The agent works on this company: its tasks, emails, texts, WhatsApp and calls. The first agent also brings a company manager that hands out the work.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              value={name}
              maxLength={191}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bookkeeping assistant"
            />
          </div>

          {!isManager && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="agent-description">What it handles</Label>
              <Textarea
                id="agent-description"
                value={description}
                maxLength={4000}
                rows={3}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. GST/QST returns and bank reconciliations in QuickBooks; answers the client's bookkeeping emails."
              />
              <p className="text-xs text-muted-foreground">
                The manager hands this agent the work that fits this description.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>When should it ask you first?</Label>
            <ApprovalModePicker value={mode} onChange={setMode} />
          </div>

          {mutation.isError && (
            <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || mutation.isPending}>
              {mutation.isPending ? 'Saving…' : agent ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
