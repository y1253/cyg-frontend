import { Bot, ChevronRight, Crown, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { approvalModeLabel, type Agent } from '@/api/agents';
import { cn } from '@/lib/utils';

/** A pulsing green dot: the agent's browser is open right now. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative flex size-2', className)}>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
    </span>
  );
}

/** The agent's round avatar: a crown for the company manager, a bot for a worker. */
export function AgentAvatar({ agent, size = 'md' }: { agent: Agent; size?: 'md' | 'lg' }) {
  const isManager = agent.role === 'MANAGER';
  const Icon = isManager ? Crown : Bot;
  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full',
        size === 'lg' ? 'size-11' : 'size-10',
        isManager ? 'bg-amber-50 text-amber-600' : 'bg-[#3BBFB4]/15 text-teal-700',
      )}
    >
      <Icon className={size === 'lg' ? 'size-6' : 'size-5'} />
      {agent.onBrowser && (
        <LiveDot className="absolute -right-0.5 -top-0.5 ring-2 ring-background rounded-full" />
      )}
    </span>
  );
}

/**
 * step11: one agent in the list. The whole card opens it; edit and delete are small icon
 * buttons that never open it.
 */
export function AgentCard({
  agent: a,
  canEdit,
  onOpen,
  onEdit,
  onDelete,
}: {
  agent: Agent;
  canEdit: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const isManager = a.role === 'MANAGER';
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`Open ${a.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group cursor-pointer transition-shadow hover:shadow-md hover:ring-2 hover:ring-[#3BBFB4]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BBFB4]"
    >
      <CardContent className="flex items-start gap-3 py-4">
        <AgentAvatar agent={a} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{a.name}</span>
            {canEdit && (
              <span className="ml-auto flex shrink-0 gap-0.5 opacity-60 group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${a.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  <Pencil className="size-3.5" />
                </Button>
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${a.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {isManager
              ? 'Company manager — hands every task and message to the right agent.'
              : a.description || 'Works on this company.'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{approvalModeLabel(a.approvalMode)}</Badge>
            {a.onBrowser && (
              <Badge className="gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-800">
                <LiveDot />
                On browser
              </Badge>
            )}
            {a.openTodos > 0 && (
              <Badge variant="secondary">
                {a.openTodos} open task{a.openTodos === 1 ? '' : 's'}
              </Badge>
            )}
            <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
