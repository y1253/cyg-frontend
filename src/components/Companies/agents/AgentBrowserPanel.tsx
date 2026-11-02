import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Globe,
  LayoutGrid,
  Maximize2,
  Minimize2,
  MonitorPlay,
  MousePointerClick,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { BrowserAction } from '@/api/agents';
import {
  useAgentBrowserStream,
  type AgentBrowserStream,
  type LiveTab,
} from '@/hooks/useAgentBrowserStream';
import { useBrowserSession, useBrowserSessions } from '@/hooks/useBrowserSessions';
import { cn } from '@/lib/utils';
import {
  clampSplit,
  layoutKey,
  parseLayout,
  splitAt,
  type LiveLayout,
} from '@/lib/live-layout';
import { RemoteScreen } from './RemoteScreen';

const ACTION_LABEL: Record<BrowserAction['action'], string> = {
  open: 'Opened',
  click: 'Clicked',
  type: 'Typed',
  press: 'Pressed',
  snapshot: 'Read the page',
};

function time(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { timeStyle: 'medium' });
}

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function duration(from: string, to: string | null) {
  const ms = (to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime();
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return min ? `${min}m ${sec}s` : `${sec}s`;
}

/** The split view's columns for this many tabs. */
function gridCols(n: number) {
  if (n <= 1) return 'grid-cols-1';
  if (n <= 4) return 'grid-cols-1 sm:grid-cols-2';
  return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3';
}

/**
 * step11 part 2: watch the agent's browser live, inside the company's Agents tab — the page
 * as it is now and every step it takes — plus its past sessions on the browser.
 *
 * step13 (2026-11-02): the agent works several things at once, each in its own tabs, so
 * the view is SPLIT — one live picture per tab (2 side by side, 4 in a grid…). Click a tab
 * to see it big (the others become a strip), or go full screen. "Control" on a tab lets
 * the viewer drive THAT tab like a real browser (see `RemoteScreen`) while the agent goes
 * on in its other tabs. One controller per tab.
 */
export function AgentBrowserPanel({
  companyId,
  agentId,
  stacked = false,
  onTabCount,
}: {
  companyId: number;
  agentId: number;
  /** step11: in a half-width column the steps go under the page, not beside it. */
  stacked?: boolean;
  /** step13: how many tabs are open — the agent view widens the card for a split view. */
  onTabCount?: (n: number) => void;
}) {
  const live = useAgentBrowserStream(companyId, agentId);
  const { tabs, mine, setFocus } = live;
  /**
   * step11.md (2026-11-02): the viewer's layout — all tabs the same size, or one big with
   * the others beside it, the split dragged by the viewer. Kept per viewer in the browser.
   */
  const [layout, setLayout] = useState<LiveLayout>(() => {
    try {
      return parseLayout(localStorage.getItem(layoutKey(agentId)));
    } catch {
      return parseLayout(null);
    }
  });
  const [full, setFull] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(layoutKey(agentId), JSON.stringify(layout));
    } catch {
      // A private window: the layout lasts for this visit only.
    }
  }, [agentId, layout]);

  // The tab shown big: the one this viewer controls, else the one picked while it is open.
  const picked = layout.mode === 'big' ? layout.bigId : null;
  const focusId = mine ?? (tabs.some((t) => t.pageId === picked) ? picked : null);
  const focused = tabs.find((t) => t.pageId === focusId) ?? null;

  // The agents server casts the big tab sharper.
  useEffect(() => setFocus(focusId), [focusId, setFocus]);

  useEffect(() => onTabCount?.(tabs.length), [tabs.length, onTabCount]);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === shellRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const show = (pageId: number | null) =>
    setLayout((l) =>
      pageId === null ? { ...l, mode: 'equal' } : { ...l, mode: 'big', bigId: pageId },
    );

  /** Dragging the line between the big tab and the others. */
  const onSplitDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onSplitMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const box = rowRef.current?.getBoundingClientRect();
    if (!box) return;
    const split = splitAt(e.clientX, box.left, box.width);
    setLayout((l) => (l.split === split ? l : { ...l, split }));
  };
  const onSplitKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0;
    if (!step) return;
    e.preventDefault();
    setLayout((l) => ({ ...l, split: clampSplit(l.split + step) }));
  };

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shellRef.current?.requestFullscreen().catch(() => undefined);
  };

  const steps = focused ? live.actions.filter((a) => a.pageId === focused.pageId) : live.actions;
  const nameOf = new Map(tabs.map((t) => [t.pageId, t.name]));
  const someoneElse = (t: LiveTab) => !!t.controlledBy && mine !== t.pageId;

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn('grid gap-3', !stacked && 'lg:grid-cols-[minmax(0,1fr)_16rem]')}
      >
        <div
          ref={shellRef}
          className={cn(
            'flex min-w-0 flex-col gap-2',
            full && 'overflow-auto bg-background p-4',
          )}
        >
          <div className="flex items-center gap-2 text-sm">
            {live.onBrowser ? (
              <span className="flex items-center gap-1.5 font-medium text-emerald-700">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
                </span>
                Live
                {tabs.length > 1 && (
                  <span className="font-normal text-muted-foreground">
                    · {tabs.length} tabs
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {live.state === 'connecting'
                  ? (live.error ?? 'Connecting…')
                  : live.state === 'error'
                    ? live.error
                    : 'Not on the browser right now'}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
              {focused && tabs.length > 1 && mine === null && (
                <Button variant="outline" size="sm" onClick={() => show(null)}>
                  <LayoutGrid className="mr-1 size-3.5" />
                  Equal size
                </Button>
              )}
              {tabs.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleFull}
                  title={full ? 'Exit full screen' : 'Full screen'}
                >
                  {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </Button>
              )}
            </div>
          </div>

          {mine !== null && (
            <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
              <MousePointerClick className="size-3.5 shrink-0" />
              You are controlling "{nameOf.get(mine) ?? 'this tab'}" — move, click, drag,
              scroll and type on it like a normal browser (paste works too). The agent waits
              on this tab only. Turn Control off when you are done.
            </p>
          )}

          {tabs.length === 0 ? (
            <div className="relative flex aspect-[1280/900] w-full flex-col items-center justify-center gap-2 rounded-md border bg-muted/40 text-sm text-muted-foreground">
              <MonitorPlay className="size-8" />
              {live.state === 'error'
                ? live.error
                : 'The page shows here as soon as the agent opens its browser.'}
            </div>
          ) : focused && tabs.length > 1 ? (
            // step11.md: one tab big, the others beside it (under it on a narrow screen);
            // the line between them is dragged to make the big one bigger or smaller.
            <div
              ref={rowRef}
              style={{ '--split': `${layout.split}%` } as React.CSSProperties}
              className="flex flex-col gap-3 lg:flex-row lg:gap-0"
            >
              <div className="min-w-0 lg:shrink-0 lg:basis-[var(--split)] lg:pr-1.5">
                <TabTile
                  tab={focused}
                  stream={live}
                  big
                  fit={full}
                  someoneElse={someoneElse(focused)}
                  onEqual={mine === null ? () => show(null) : undefined}
                />
              </div>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Drag to make the big tab bigger or smaller"
                aria-valuemin={45}
                aria-valuemax={85}
                aria-valuenow={layout.split}
                tabIndex={0}
                onPointerDown={onSplitDown}
                onPointerMove={onSplitMove}
                onKeyDown={onSplitKey}
                className="group hidden w-3 shrink-0 cursor-col-resize touch-none items-center justify-center outline-none lg:flex"
              >
                <span className="h-16 w-1 rounded-full bg-border transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary" />
              </div>
              <div className="relative min-w-0 lg:flex-1">
                <div className="grid grid-cols-2 gap-3 lg:absolute lg:inset-0 lg:flex lg:flex-col lg:overflow-y-auto lg:pl-1.5">
                  {tabs
                    .filter((t) => t.pageId !== focused.pageId)
                    .map((t) => (
                      <TabTile
                        key={t.pageId}
                        tab={t}
                        stream={live}
                        big={false}
                        someoneElse={someoneElse(t)}
                        onOpen={mine === null ? () => show(t.pageId) : undefined}
                      />
                    ))}
                </div>
              </div>
            </div>
          ) : (
            <div className={cn('grid gap-3', gridCols(tabs.length))}>
              {tabs.map((t) => (
                <TabTile
                  key={t.pageId}
                  tab={t}
                  stream={live}
                  big={tabs.length === 1}
                  fit={full && tabs.length === 1}
                  someoneElse={someoneElse(t)}
                  onOpen={tabs.length > 1 ? () => show(t.pageId) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <p className="text-sm font-medium">
            What it is doing{focused && tabs.length > 1 ? ` — ${focused.name}` : ''}
          </p>
          <ol
            className={cn(
              'flex flex-col gap-1.5 overflow-y-auto rounded-md border p-2 text-xs',
              stacked ? 'max-h-60' : 'max-h-[28rem]',
            )}
          >
            {steps.length === 0 && <li className="text-muted-foreground">No steps yet.</li>}
            {[...steps].reverse().map((a, i) => (
              <ActionLine
                key={`${a.pageId}-${a.at}-${i}`}
                action={a.action}
                detail={a.detail}
                at={a.at}
                tab={!focused && tabs.length > 1 ? nameOf.get(a.pageId) : undefined}
              />
            ))}
          </ol>
        </div>
      </div>

      <SessionHistory companyId={companyId} agentId={agentId} />
    </div>
  );
}

/** One tab: its name, run, address, the Control button — and the live picture. */
function TabTile({
  tab,
  stream,
  big,
  fit = false,
  someoneElse,
  onOpen,
  onEqual,
}: {
  tab: LiveTab;
  stream: AgentBrowserStream;
  big: boolean;
  /** step11.md: full screen — the picture is kept within the screen's height. */
  fit?: boolean;
  someoneElse: boolean;
  /** Make this tab the big one. */
  onOpen?: () => void;
  /** step11.md: the big tab — back to all tabs the same size. */
  onEqual?: () => void;
}) {
  const driving = stream.mine === tab.pageId && stream.onBrowser;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-1.5 text-xs">
        <Badge variant="secondary" className="shrink-0 px-1.5 py-0">
          {tab.name}
        </Badge>
        <span className="min-w-0 truncate text-muted-foreground" title={tab.run}>
          {tab.run}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {someoneElse ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
              {tab.controlledBy} is in control
            </span>
          ) : (
            <Button
              variant={driving ? 'default' : 'outline'}
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => stream.input.setControl(tab.pageId, !driving)}
            >
              <MousePointerClick className="mr-1 size-3" />
              {driving ? 'Stop control' : 'Control'}
            </Button>
          )}
          {onOpen && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5"
              onClick={onOpen}
              title="Make this tab bigger"
            >
              <Maximize2 className="size-3" />
            </Button>
          )}
          {onEqual && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5"
              onClick={onEqual}
              title="All tabs the same size"
            >
              <LayoutGrid className="size-3" />
            </Button>
          )}
        </div>
      </div>
      {tab.url && (
        <span className="flex min-w-0 items-center gap-1 truncate rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          <Globe className="size-3 shrink-0" />
          <span className="truncate">{tab.url}</span>
        </span>
      )}
      <div className={cn(fit && 'mx-auto w-full max-w-[calc((100dvh-9rem)*1.4222)]')}>
        <RemoteScreen
          pageId={tab.pageId}
          stream={stream}
          driving={driving}
          hasFrame={stream.framed.has(tab.pageId)}
          onBrowser={stream.onBrowser}
          label={`The agent's browser — ${tab.name}`}
          onPick={onOpen}
          className={cn(!big && onOpen && !driving && 'cursor-zoom-in')}
        />
      </div>
    </div>
  );
}

function ActionLine({
  action,
  detail,
  at,
  tab,
}: {
  action: BrowserAction['action'];
  detail: string;
  at: string;
  /** step13: the tab it was taken on, in the all-tabs list. */
  tab?: string;
}) {
  return (
    <li className="flex flex-col gap-0.5 border-b pb-1.5 last:border-b-0">
      <span className="flex items-center gap-1.5">
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          {ACTION_LABEL[action] ?? action}
        </Badge>
        {tab && (
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {tab}
          </Badge>
        )}
        <span className="text-muted-foreground">{time(at)}</span>
      </span>
      <span className="break-all">{detail}</span>
    </li>
  );
}

function SessionHistory({ companyId, agentId }: { companyId: number; agentId: number }) {
  const sessions = useBrowserSessions(companyId, agentId);
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Past sessions on the browser</p>
      {sessions.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sessions.isError ? (
        <p className="text-sm text-destructive">{(sessions.error as Error).message}</p>
      ) : !sessions.data?.length ? (
        <p className="text-sm text-muted-foreground">It has not used its browser yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sessions.data.map((s) => (
            <li key={s.id} className="rounded-md border">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                onClick={() => setOpen(open === s.id ? null : s.id)}
              >
                {open === s.id ? (
                  <ChevronDown className="size-4 shrink-0" />
                ) : (
                  <ChevronRight className="size-4 shrink-0" />
                )}
                <span className="flex-1">{when(s.startedAt)}</span>
                {s.tab && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {s.tab}
                  </Badge>
                )}
                {s.finishedAt ? (
                  <span className="text-xs text-muted-foreground">
                    {duration(s.startedAt, s.finishedAt)}
                  </span>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-800">On now</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {s.actionCount} step{s.actionCount === 1 ? '' : 's'}
                </span>
              </button>
              {open === s.id && (
                <SessionActions companyId={companyId} agentId={agentId} sessionId={s.id} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionActions({
  companyId,
  agentId,
  sessionId,
}: {
  companyId: number;
  agentId: number;
  sessionId: number;
}) {
  const session = useBrowserSession(companyId, agentId, sessionId);
  if (session.isLoading) {
    return <p className="px-3 pb-2 text-xs text-muted-foreground">Loading…</p>;
  }
  if (session.isError || !session.data) {
    return <p className="px-3 pb-2 text-xs text-destructive">Could not load the steps.</p>;
  }
  if (!session.data.actions.length) {
    return <p className="px-3 pb-2 text-xs text-muted-foreground">No steps.</p>;
  }
  return (
    <ol className="flex max-h-80 flex-col gap-1.5 overflow-y-auto border-t bg-muted/30 px-3 py-2 text-xs">
      {session.data.actions.map((a) => (
        <ActionLine key={a.id} action={a.action} detail={a.detail} at={a.createdAt} />
      ))}
    </ol>
  );
}
