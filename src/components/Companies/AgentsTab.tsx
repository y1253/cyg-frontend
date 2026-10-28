import { useState } from 'react';
import { Bot, MonitorPlay, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { useAgents } from '@/hooks/useAgents';
import { useCreateAgent } from '@/hooks/useCreateAgent';
import { useDeleteAgent } from '@/hooks/useDeleteAgent';
import type { Agent } from '@/api/agents';

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * step12: the company's AI agents. Each one is registered on the agents server and reads
 * this company with its own token. Management creates and deletes them; deleting revokes
 * the token at once. The live browser stream comes in a later step.
 */
export function AgentsTab({
  companyId,
  canEdit,
}: {
  companyId: number;
  canEdit: boolean;
}) {
  const agents = useAgents(companyId);
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Agent | null>(null);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Agents</h2>
          <p className="text-sm text-muted-foreground">
            AI agents working on this company. They can read its details, tasks and
            communications.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 size-4" />
            Create agent
          </Button>
        )}
      </div>

      {agents.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : agents.isError ? (
        <p className="text-sm text-destructive">{(agents.error as Error).message}</p>
      ) : !agents.data?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Bot className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No agents yet.
              {canEdit ? ' Create one to start.' : ''}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {agents.data.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex items-center gap-3 py-3">
                <Bot className="size-5 shrink-0 text-[#3BBFB4]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{a.name}</span>
                    {a.remoteAgentId != null && (
                      <Badge variant="secondary">Agent #{a.remoteAgentId}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Created {fmtDateTime(a.createdAt)}
                    {a.createdBy ? ` by ${a.createdBy.name}` : ''}
                  </p>
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${a.name}`}
                    onClick={() => setToDelete(a)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
          <MonitorPlay className="size-5 shrink-0" />
          Live browser stream — coming soon. You will be able to watch each agent's browser
          here.
        </CardContent>
      </Card>

      <CreateAgentDialog
        companyId={companyId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <DeleteAgentDialog
        companyId={companyId}
        agent={toDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

function CreateAgentDialog({
  companyId,
  open,
  onOpenChange,
}: {
  companyId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateAgent(companyId);
  const [name, setName] = useState('');

  const close = (next: boolean) => {
    if (!next) {
      setName('');
      create.reset();
    }
    onOpenChange(next);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(trimmed, { onSuccess: () => close(false) });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Create agent</DialogTitle>
            <DialogDescription>
              The agent is set up on the agents server with access to this company's data.
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
          {create.isError && (
            <p className="text-sm text-destructive">{(create.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAgentDialog({
  companyId,
  agent,
  onClose,
}: {
  companyId: number;
  agent: Agent | null;
  onClose: () => void;
}) {
  const del = useDeleteAgent(companyId);

  return (
    <Dialog
      open={agent !== null}
      onOpenChange={(next) => {
        if (!next) {
          del.reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {agent?.name}?</DialogTitle>
          <DialogDescription>
            Its access to this company stops at once. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {del.isError && (
          <p className="text-sm text-destructive">{(del.error as Error).message}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={() => agent && del.mutate(agent.id, { onSuccess: onClose })}
          >
            {del.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
