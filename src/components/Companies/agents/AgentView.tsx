import { useState } from 'react';
import { ArrowLeft, MonitorPlay, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { approvalModeLabel, type Agent } from '@/api/agents';
import { cn } from '@/lib/utils';
import { AgentAvatar, LiveDot } from './AgentCard';
import { AgentChatPanel } from './AgentChatPanel';
import { AgentRulesPanel } from './AgentRulesPanel';
import { AgentSchedulesPanel } from './AgentSchedulesPanel';
import { AgentActivityPanel } from './AgentActivityPanel';
import { AgentLearningsPanel } from './AgentLearningsPanel';
import { AgentBrowserPanel } from './AgentBrowserPanel';

type Section = 'chat' | 'activity' | 'rules' | 'schedules' | 'learnings';

const liveKey = (agentId: number) => `agent-live-view-${agentId}`;

/** The viewer's own choice, per agent. ON unless they turned it off. */
function readLiveView(agentId: number): boolean {
  try {
    return localStorage.getItem(liveKey(agentId)) !== '0';
  } catch {
    return true;
  }
}

function writeLiveView(agentId: number, on: boolean): void {
  try {
    localStorage.setItem(liveKey(agentId), on ? '1' : '0');
  } catch {
    // only the choice is lost; the switch still works for this visit
  }
}

/**
 * step11: one agent, alone. Left: its chat (and work log, rules, schedules, what it
 * learned). Right, while Live view is on: its browser, streaming as it works — no "Watch"
 * button to find. The switch only changes what THIS viewer sees, never what the agent
 * does. The manager has no browser, so its chat takes the whole width.
 */
export function AgentView({
  companyId,
  agent,
  canManage,
  onBack,
  onEdit,
}: {
  companyId: number;
  agent: Agent;
  canManage: boolean;
  onBack: () => void;
  onEdit: () => void;
}) {
  const isManager = agent.role === 'MANAGER';
  const [section, setSection] = useState<Section>('chat');
  const [liveView, setLiveView] = useState(() => readLiveView(agent.id));
  const showLive = !isManager && liveView;

  const sections: { key: Section; label: string }[] = [
    { key: 'chat', label: isManager ? 'Company chat' : 'Chat' },
    { key: 'activity', label: 'Work log' },
    ...(canManage
      ? [
          { key: 'rules' as const, label: isManager ? 'Company rules' : 'Rules' },
          ...(isManager ? [] : [{ key: 'schedules' as const, label: 'Schedules' }]),
          { key: 'learnings' as const, label: 'What it learned' },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="mr-1 size-4" />
          All agents
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <AgentAvatar agent={agent} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold">{agent.name}</h2>
              {isManager && <Badge variant="secondary">Company manager</Badge>}
              <Badge variant="outline">{approvalModeLabel(agent.approvalMode)}</Badge>
              {agent.openTodos > 0 && (
                <Badge variant="secondary">
                  {agent.openTodos} open task{agent.openTodos === 1 ? '' : 's'}
                </Badge>
              )}
            </div>
            {agent.description && !isManager && (
              <p className="truncate text-xs text-muted-foreground">{agent.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isManager && (
            <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
              <Switch
                id={`live-view-${agent.id}`}
                checked={liveView}
                onCheckedChange={(on) => {
                  setLiveView(on);
                  writeLiveView(agent.id, on);
                }}
              />
              <Label htmlFor={`live-view-${agent.id}`} className="cursor-pointer text-sm">
                Live view
              </Label>
            </div>
          )}
          {canManage && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-1 size-3.5" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <div className={cn('grid items-start gap-4', showLive && 'lg:grid-cols-2')}>
        <Card className="min-w-0">
          <CardContent className="py-4">
            <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
              <TabsList className="max-w-full flex-wrap h-auto">
                {sections.map((s) => (
                  <TabsTrigger key={s.key} value={s.key}>
                    {s.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="chat" className="pt-2">
                <AgentChatPanel
                  companyId={companyId}
                  agentId={agent.id}
                  agentName={agent.name}
                />
              </TabsContent>
              <TabsContent value="activity" className="pt-2">
                <AgentActivityPanel companyId={companyId} agentId={agent.id} />
              </TabsContent>
              {canManage && (
                <TabsContent value="rules" className="pt-2">
                  {isManager ? (
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
                  )}
                </TabsContent>
              )}
              {canManage && !isManager && (
                <TabsContent value="schedules" className="pt-2">
                  <AgentSchedulesPanel companyId={companyId} agentId={agent.id} />
                </TabsContent>
              )}
              {canManage && (
                <TabsContent value="learnings" className="pt-2">
                  <AgentLearningsPanel companyId={companyId} agentId={agent.id} />
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>

        {showLive && (
          <Card className="min-w-0 lg:sticky lg:top-4">
            <CardContent className="flex flex-col gap-3 py-4">
              <div className="flex items-center gap-2">
                <MonitorPlay className="size-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Live browser</span>
                {agent.onBrowser && (
                  <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <LiveDot />
                    Working now
                  </span>
                )}
              </div>
              <AgentBrowserPanel companyId={companyId} agentId={agent.id} stacked />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
