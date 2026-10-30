import { useEffect, useRef, useState } from 'react';
import { Bot, Plus } from 'lucide-react';
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
import { useAgents } from '@/hooks/useAgents';
import { useDeleteAgent } from '@/hooks/useDeleteAgent';
import type { Agent } from '@/api/agents';
import { AgentFormDialog } from './agents/AgentFormDialog';
import { AgentCard } from './agents/AgentCard';
import { AgentView } from './agents/AgentView';
import { useNotifications } from '@/context/NotificationContext';

/**
 * step12: the company's AI agents. The company manager (created with the first agent)
 * hands every due task and every new email, text, WhatsApp and call to the right worker;
 * the workers do the work, through the internal API and their own browser.
 *
 * step11 redesign (2026-10-30): two screens. The LIST shows one card per agent; clicking
 * one opens that agent ALONE — its chat on one side and, with the Live view switch on
 * (the default), its browser streaming on the other — with Back to return to the list.
 */
export function AgentsTab({
  companyId,
  canEdit,
}: {
  companyId: number;
  canEdit: boolean;
}) {
  const agents = useAgents(companyId);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [toDelete, setToDelete] = useState<Agent | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const list = agents.data ?? [];
  const manager = list.find((a) => a.role === 'MANAGER') ?? null;
  const workers = list.filter((a) => a.role === 'WORKER');
  // A deleted agent simply drops back to the list.
  const selected = list.find((a) => a.id === selectedId) ?? null;

  // step11: an agent's popup was clicked — open that agent, once per click.
  const { pendingOpen, clearPendingOpen } = useNotifications();
  const appliedSeq = useRef(0);
  useEffect(() => {
    if (!pendingOpen || pendingOpen.scope !== 'agent') return;
    if (pendingOpen.companyId !== companyId) return;
    if (appliedSeq.current === pendingOpen.seq) return;
    appliedSeq.current = pendingOpen.seq;
    // An external request channel (the popup), the case set-state-in-effect exempts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedId(pendingOpen.agentId);
    clearPendingOpen();
  }, [pendingOpen, companyId, clearPendingOpen]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (a: Agent) => {
    setEditing(a);
    setFormOpen(true);
  };

  const dialogs = (
    <>
      <AgentFormDialog
        companyId={companyId}
        agent={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
      <DeleteAgentDialog
        companyId={companyId}
        agent={toDelete}
        onClose={() => setToDelete(null)}
      />
    </>
  );

  if (selected) {
    return (
      <>
        <AgentView
          key={selected.id}
          companyId={companyId}
          agent={selected}
          canManage={canEdit}
          onBack={() => setSelectedId(null)}
          onEdit={() => openEdit(selected)}
        />
        {dialogs}
      </>
    );
  }

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Agents</h2>
          <p className="text-sm text-muted-foreground">
            AI agents working on this company. Click one to talk to it and watch what it
            does.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 size-4" />
            Create agent
          </Button>
        )}
      </div>

      {agents.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : agents.isError ? (
        <p className="text-sm text-destructive">{(agents.error as Error).message}</p>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Bot className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No agents yet.
              {canEdit ? ' Create one to start — a company manager comes with it.' : ''}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {manager && (
              <AgentCard
                agent={manager}
                canEdit={canEdit}
                onOpen={() => setSelectedId(manager.id)}
                onEdit={() => openEdit(manager)}
                onDelete={workers.length === 0 ? () => setToDelete(manager) : undefined}
              />
            )}
            {workers.map((a) => (
              <AgentCard
                key={a.id}
                agent={a}
                canEdit={canEdit}
                onOpen={() => setSelectedId(a.id)}
                onEdit={() => openEdit(a)}
                onDelete={() => setToDelete(a)}
              />
            ))}
          </div>
          {manager && workers.length === 0 && (
            <p className="text-xs text-amber-700">
              The manager only hands out work — create an agent to do it.
            </p>
          )}
        </>
      )}

      {dialogs}
    </div>
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
            Its access to this company stops at once and its open tasks go back to nobody.
            This cannot be undone.
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
