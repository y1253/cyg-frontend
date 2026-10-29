import { useState } from 'react';
import { Bot, Crown, MessageSquare, MonitorPlay, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { useAgents } from '@/hooks/useAgents';
import { useDeleteAgent } from '@/hooks/useDeleteAgent';
import { approvalModeLabel, type Agent } from '@/api/agents';
import { cn } from '@/lib/utils';
import { AgentFormDialog } from './agents/AgentFormDialog';
import { AgentChatPanel } from './agents/AgentChatPanel';
import { AgentRulesPanel } from './agents/AgentRulesPanel';
import { AgentSchedulesPanel } from './agents/AgentSchedulesPanel';
import { AgentActivityPanel } from './agents/AgentActivityPanel';

type DetailTab = 'chat' | 'rules' | 'schedules' | 'activity';

/**
 * step12: the company's AI agents. The company manager (created with the first agent)
 * hands every due task and every new email, text, WhatsApp and call to the right worker;
 * the workers do the work, through the internal API and their own browser. Staff talk to
 * each one in its chat — the manager's is the company chat — and set when it must ask
 * first (its approval mode), its rules and its schedules. Management only, except the
 * list itself.
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
  const selected =
    list.find((a) => a.id === selectedId) ?? (canEdit ? manager : null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (a: Agent) => {
    setEditing(a);
    setFormOpen(true);
  };

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Agents</h2>
          <p className="text-sm text-muted-foreground">
            AI agents working on this company: its due tasks, emails, texts, WhatsApp and
            calls. The company manager hands each one to the right agent.
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
        <div className="flex flex-col gap-2">
          {manager && (
            <AgentRow
              agent={manager}
              selected={selected?.id === manager.id}
              canEdit={canEdit}
              onSelect={() => setSelectedId(manager.id)}
              onEdit={() => openEdit(manager)}
              onDelete={workers.length === 0 ? () => setToDelete(manager) : undefined}
            />
          )}
          {workers.map((a) => (
            <AgentRow
              key={a.id}
              agent={a}
              selected={selected?.id === a.id}
              canEdit={canEdit}
              onSelect={() => setSelectedId(a.id)}
              onEdit={() => openEdit(a)}
              onDelete={() => setToDelete(a)}
            />
          ))}
          {manager && workers.length === 0 && (
            <p className="text-xs text-amber-700">
              The manager only hands out work — create an agent to do it.
            </p>
          )}
        </div>
      )}

      {canEdit && selected && (
        <AgentDetail key={selected.id} companyId={companyId} agent={selected} />
      )}

      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
          <MonitorPlay className="size-5 shrink-0" />
          Live browser stream — coming soon. You will be able to watch each agent's browser
          here.
        </CardContent>
      </Card>

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
    </div>
  );
}

function AgentRow({
  agent: a,
  selected,
  canEdit,
  onSelect,
  onEdit,
  onDelete,
}: {
  agent: Agent;
  selected: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const isManager = a.role === 'MANAGER';
  return (
    <Card className={cn(selected && 'ring-2 ring-[#3BBFB4]')}>
      <CardContent className="flex items-center gap-3 py-3">
        {isManager ? (
          <Crown className="size-5 shrink-0 text-amber-500" />
        ) : (
          <Bot className="size-5 shrink-0 text-[#3BBFB4]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{a.name}</span>
            {isManager && <Badge variant="secondary">Company manager</Badge>}
            <Badge variant="outline">{approvalModeLabel(a.approvalMode)}</Badge>
            {a.openTodos > 0 && (
              <Badge variant="secondary">
                {a.openTodos} open task{a.openTodos === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
          {a.description && !isManager && (
            <p className="truncate text-xs text-muted-foreground">{a.description}</p>
          )}
        </div>
        {canEdit && (
          <>
            <Button size="sm" variant={selected ? 'default' : 'outline'} onClick={onSelect}>
              <MessageSquare className="mr-1 size-4" />
              {isManager ? 'Company chat' : 'Open'}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Edit ${a.name}`}
              onClick={onEdit}
            >
              <Pencil className="size-4" />
            </Button>
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${a.name}`}
                onClick={onDelete}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AgentDetail({ companyId, agent }: { companyId: number; agent: Agent }) {
  const isManager = agent.role === 'MANAGER';
  const [tab, setTab] = useState<DetailTab>('chat');
  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'chat', label: isManager ? 'Company chat' : 'Chat' },
    { key: 'rules', label: isManager ? 'Company rules' : 'Rules' },
    ...(isManager ? [] : [{ key: 'schedules' as const, label: 'Schedules' }]),
    { key: 'activity', label: 'Work log' },
  ];

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex flex-wrap items-center gap-1 border-b pb-2">
          <span className="mr-2 text-sm font-semibold">{agent.name}</span>
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-md px-3 py-1 text-sm transition-colors',
                tab === t.key
                  ? 'bg-[#3BBFB4]/15 font-medium text-teal-900'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'chat' && (
          <AgentChatPanel companyId={companyId} agentId={agent.id} agentName={agent.name} />
        )}
        {tab === 'rules' &&
          (isManager ? (
            <AgentRulesPanel
              companyId={companyId}
              agentId={null}
              intro="Rules for this company. Every agent of the company follows them, and they override the firm's general instructions."
            />
          ) : (
            <AgentRulesPanel
              companyId={companyId}
              agentId={agent.id}
              intro={`Rules for ${agent.name} only, on top of the company's rules.`}
            />
          ))}
        {tab === 'schedules' && !isManager && (
          <AgentSchedulesPanel companyId={companyId} agentId={agent.id} />
        )}
        {tab === 'activity' && <AgentActivityPanel companyId={companyId} agentId={agent.id} />}
      </CardContent>
    </Card>
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
