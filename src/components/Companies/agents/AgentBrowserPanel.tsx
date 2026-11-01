import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type WheelEvent,
} from 'react';
import {
  ChevronDown,
  ChevronRight,
  Globe,
  MonitorPlay,
  MousePointerClick,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { picturePoint } from '@/lib/picture-point';
import type { BrowserAction } from '@/api/agents';
import { useAgentBrowserStream } from '@/hooks/useAgentBrowserStream';
import { useBrowserSession, useBrowserSessions } from '@/hooks/useBrowserSessions';
import { cn } from '@/lib/utils';

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

/** Keys sent by name; any other single character is typed as text. */
const NAMED_KEYS = new Set([
  'Enter', 'Tab', 'Backspace', 'Delete', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown',
]);
/** Typed characters are sent in small batches, not one message per key. */
const TEXT_BATCH_MS = 150;

/**
 * step11 part 2: watch the agent's browser live, inside the company's Agents tab — the page
 * as it is now and every step it takes — plus its past sessions on the browser.
 *
 * step11 (2026-11-01): the "Control" switch lets the viewer click, scroll and type on the
 * agent's real page (an "I'm not a robot" CAPTCHA it cannot solve). One person at a time;
 * the agent's own browser steps wait while someone is in control.
 */
export function AgentBrowserPanel({
  companyId,
  agentId,
  stacked = false,
}: {
  companyId: number;
  agentId: number;
  /** step11: in a half-width column the steps go under the page, not beside it. */
  stacked?: boolean;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const live = useAgentBrowserStream(companyId, agentId, imgRef);
  const { control, input } = live;
  const driving = control.on && control.mine && live.onBrowser;
  const pending = useRef('');
  const flush = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Typing goes to the page the moment control is taken.
  useEffect(() => {
    if (driving) boxRef.current?.focus();
  }, [driving]);

  // Leaving the panel hands control back on its own: the stream's socket closes, and
  // the agents server releases control with it.

  const point = (e: MouseEvent | WheelEvent) => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    return picturePoint(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      { width: rect.width, height: rect.height },
      { width: img.naturalWidth, height: img.naturalHeight },
    );
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!driving) return;
    const p = point(e);
    if (p) input.click(p.x, p.y);
    boxRef.current?.focus();
  };

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!driving) return;
    const p = point(e);
    input.wheel(p?.x ?? 0.5, p?.y ?? 0.5, e.deltaY);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!driving || e.ctrlKey || e.metaKey || e.altKey) return;
    if (NAMED_KEYS.has(e.key)) {
      e.preventDefault();
      if (pending.current) {
        input.text(pending.current);
        pending.current = '';
      }
      input.key(e.key);
    } else if (e.key.length === 1) {
      e.preventDefault();
      pending.current += e.key;
      if (flush.current) clearTimeout(flush.current);
      flush.current = setTimeout(() => {
        if (pending.current) input.text(pending.current);
        pending.current = '';
      }, TEXT_BATCH_MS);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          'grid gap-3',
          !stacked && 'lg:grid-cols-[minmax(0,1fr)_16rem]',
        )}
      >
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            {live.onBrowser ? (
              <span className="flex items-center gap-1.5 font-medium text-emerald-700">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
                </span>
                Live
              </span>
            ) : (
              <span className="text-muted-foreground">
                {live.state === 'connecting' ? 'Connecting…' : 'Not on the browser right now'}
              </span>
            )}
            {live.url && (
              <span className="flex min-w-0 items-center gap-1 truncate rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                <Globe className="size-3 shrink-0" />
                <span className="truncate">{live.url}</span>
              </span>
            )}
            {live.onBrowser && (
              <div className="ml-auto flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1">
                <Switch
                  id={`browser-control-${agentId}`}
                  checked={driving}
                  disabled={control.on && !control.mine}
                  onCheckedChange={(on) => input.setControl(on)}
                />
                <Label
                  htmlFor={`browser-control-${agentId}`}
                  className="cursor-pointer text-xs"
                >
                  {control.on && !control.mine ? `${control.by ?? 'Someone'} is in control` : 'Control'}
                </Label>
              </div>
            )}
          </div>
          {driving && (
            <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
              <MousePointerClick className="size-3.5 shrink-0" />
              You are controlling the browser — click, scroll and type on the picture. The agent
              waits. Turn Control off when you are done.
            </p>
          )}
          <div
            ref={boxRef}
            tabIndex={driving ? 0 : -1}
            onClick={onClick}
            onWheel={onWheel}
            onKeyDown={onKeyDown}
            className={cn(
              'relative aspect-[1280/900] w-full overflow-hidden rounded-md border bg-muted/40 outline-none',
              driving && 'cursor-crosshair ring-2 ring-amber-400',
            )}
          >
            <img
              ref={imgRef}
              alt="The agent's browser"
              draggable={false}
              className={cn(
                'absolute inset-0 size-full select-none object-contain',
                !(live.onBrowser && live.hasFrame) && 'invisible',
              )}
            />
            {!(live.onBrowser && live.hasFrame) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <MonitorPlay className="size-8" />
                {live.state === 'error'
                  ? live.error
                  : live.onBrowser
                    ? 'Waiting for the first picture…'
                    : 'The page shows here as soon as the agent opens its browser.'}
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <p className="text-sm font-medium">What it is doing</p>
          <ol
            className={cn(
              'flex flex-col gap-1.5 overflow-y-auto rounded-md border p-2 text-xs',
              stacked ? 'max-h-60' : 'max-h-[28rem]',
            )}
          >
            {live.actions.length === 0 && <li className="text-muted-foreground">No steps yet.</li>}
            {[...live.actions].reverse().map((a, i) => (
              <ActionLine key={`${a.at}-${i}`} action={a.action} detail={a.detail} at={a.at} />
            ))}
          </ol>
        </div>
      </div>

      <SessionHistory companyId={companyId} agentId={agentId} />
    </div>
  );
}

function ActionLine({
  action,
  detail,
  at,
}: {
  action: BrowserAction['action'];
  detail: string;
  at: string;
}) {
  return (
    <li className="flex flex-col gap-0.5 border-b pb-1.5 last:border-b-0">
      <span className="flex items-center gap-1.5">
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          {ACTION_LABEL[action] ?? action}
        </Badge>
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
