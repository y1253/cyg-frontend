import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchBrowserTicket, type BrowserAction } from '@/api/agents';

/** Steps kept on screen per tab; older ones are in the session history. */
const MAX_ACTIONS = 300;
/** Wait before redialling a dropped stream. */
const RETRY_MS = 3_000;

export type StreamState = 'connecting' | 'live' | 'error';

/** step13: one of the agent's open browser tabs (one set per run). */
export interface LiveTab {
  pageId: number;
  /** The name the agent gave it ("main", "cra", "popup-1"). */
  name: string;
  /** The run it belongs to ("#12 Task: reconcile the bank"). */
  run: string;
  url: string | null;
  /** The staff member driving it from the live view, or null. */
  controlledBy: string | null;
}

/** A step, with the tab it was taken on. */
export interface LiveAction extends BrowserAction {
  pageId: number;
}

interface StreamMessage {
  type?: string;
  onBrowser?: boolean;
  pageId?: number;
  url?: string | null;
  data?: string;
  tabs?: LiveTab[];
  mine?: number | null;
  actions?: BrowserAction[];
  action?: BrowserAction['action'];
  detail?: string;
  at?: string;
  cursor?: string;
  text?: string;
}

export type MouseButton = 'left' | 'middle' | 'right';

/**
 * step11 part 2: watch an agent's browser live. A 60-second ticket from our API opens the
 * agents server's `/api/browser/ws`; it pushes each page as JPEG frames and every step the
 * agent takes. Redials on a drop, with a fresh ticket, while the panel is open.
 *
 * step13 (2026-11-02): the agent works several things at once, each in its own TABS — the
 * stream names every frame and step by `pageId`. Frames are drawn straight into the tab's
 * `<img>` (registered with `frameRef(pageId)`), so a frame never re-renders the panel. The
 * viewer can take control of ONE tab and drive it like a real browser: the mouse as it
 * moves (hover menus open), drags, the wheel, every key going down and up, paste and copy.
 */
export function useAgentBrowserStream(companyId: number, agentId: number) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<StreamState>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [onBrowser, setOnBrowser] = useState(false);
  const [tabs, setTabs] = useState<LiveTab[]>([]);
  /** The tab THIS viewer controls, or null. */
  const [mine, setMine] = useState<number | null>(null);
  const [actions, setActions] = useState<LiveAction[]>([]);
  const [framed, setFramed] = useState<ReadonlySet<number>>(new Set());
  const [cursors, setCursors] = useState<Record<number, string>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const imgs = useRef(new Map<number, HTMLImageElement>());
  /** The newest picture of each tab — a tile that mounts later starts with it. */
  const lastFrames = useRef(new Map<number, string>());
  const refCallbacks = useRef(new Map<number, (el: HTMLImageElement | null) => void>());
  const framedRef = useRef(new Set<number>());
  const focusRef = useRef<number | null>(null);

  useEffect(() => {
    if (!token) return;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = async () => {
      setState('connecting');
      try {
        const { wsUrl, ticket } = await fetchBrowserTicket(token, companyId, agentId);
        if (stopped) return;
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onopen = () => ws?.send(JSON.stringify({ type: 'auth', ticket }));
        ws.onmessage = (ev: MessageEvent<string>) => {
          let msg: StreamMessage;
          try {
            msg = JSON.parse(ev.data) as StreamMessage;
          } catch {
            return;
          }
          if (msg.type === 'status') {
            setState('live');
            setError(null);
            setOnBrowser(msg.onBrowser === true);
            // The server knows this viewer from now on: say which tab it looks at.
            ws?.send(JSON.stringify({ type: 'view', focus: focusRef.current }));
            void queryClient.invalidateQueries({
              queryKey: ['agent-browser-sessions', companyId, agentId],
            });
          } else if (msg.type === 'tabs') {
            const list = msg.tabs ?? [];
            setTabs(list);
            setMine(msg.mine ?? null);
            const open = new Set(list.map((t) => t.pageId));
            for (const id of [...lastFrames.current.keys()]) {
              if (!open.has(id)) {
                lastFrames.current.delete(id);
                framedRef.current.delete(id);
              }
            }
            setFramed(new Set(framedRef.current));
          } else if (msg.type === 'actions' && typeof msg.pageId === 'number') {
            const pageId = msg.pageId;
            const list = (msg.actions ?? []).map((a) => ({ ...a, pageId }));
            setActions((prev) =>
              [...prev.filter((a) => a.pageId !== pageId), ...list]
                .sort((a, b) => a.at.localeCompare(b.at))
                .slice(-MAX_ACTIONS),
            );
          } else if (msg.type === 'action' && msg.action && typeof msg.pageId === 'number') {
            const step: LiveAction = {
              pageId: msg.pageId,
              action: msg.action,
              detail: msg.detail ?? '',
              url: msg.url ?? null,
              at: msg.at ?? new Date().toISOString(),
            };
            setActions((prev) => [...prev, step].slice(-MAX_ACTIONS));
          } else if (msg.type === 'frame' && msg.data && typeof msg.pageId === 'number') {
            const src = `data:image/jpeg;base64,${msg.data}`;
            lastFrames.current.set(msg.pageId, src);
            const img = imgs.current.get(msg.pageId);
            if (img) img.src = src;
            if (!framedRef.current.has(msg.pageId)) {
              framedRef.current.add(msg.pageId);
              setFramed(new Set(framedRef.current));
            }
            if (msg.url) {
              const { pageId, url } = msg;
              setTabs((prev) =>
                prev.some((t) => t.pageId === pageId && t.url !== url)
                  ? prev.map((t) => (t.pageId === pageId ? { ...t, url } : t))
                  : prev,
              );
            }
          } else if (msg.type === 'cursor' && typeof msg.pageId === 'number') {
            const { pageId, cursor } = msg;
            setCursors((prev) => ({ ...prev, [pageId]: cursor || 'default' }));
          } else if (msg.type === 'clipboard' && msg.text) {
            void navigator.clipboard?.writeText(msg.text).catch(() => undefined);
          }
        };
        ws.onclose = (ev) => {
          wsRef.current = null;
          // The server hands control back when the socket goes.
          setMine(null);
          if (stopped) return;
          if (ev.code === 4401 || ev.code === 4404) {
            setState('error');
            setError('Not allowed to watch this agent.');
            return;
          }
          setState('connecting');
          retry = setTimeout(() => void connect(), RETRY_MS);
        };
      } catch {
        if (stopped) return;
        // A failed ticket (the API restarting, a blip) is not the viewer's problem to
        // read: keep "connecting" and dial again. 'error' is only "not allowed".
        setState('connecting');
        setError('Could not open the live browser — retrying…');
        retry = setTimeout(() => void connect(), RETRY_MS * 3);
      }
    };

    void connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      wsRef.current = null;
      ws?.close();
    };
  }, [token, companyId, agentId, queryClient]);

  /** Send one message to the agents server (input only counts while in control). */
  const send = useCallback((message: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }, []);

  /** The `<img>` of a tab — the stream draws its frames straight into it. */
  const frameRef = useCallback((pageId: number) => {
    let cb = refCallbacks.current.get(pageId);
    if (!cb) {
      cb = (el: HTMLImageElement | null) => {
        if (el) {
          imgs.current.set(pageId, el);
          const last = lastFrames.current.get(pageId);
          if (last) el.src = last;
        } else {
          imgs.current.delete(pageId);
        }
      };
      refCallbacks.current.set(pageId, cb);
    }
    return cb;
  }, []);

  /** The tab shown big (null = the split view): that one is cast sharper. */
  const setFocus = useCallback(
    (pageId: number | null) => {
      focusRef.current = pageId;
      send({ type: 'view', focus: pageId });
    },
    [send],
  );

  const input = {
    setControl: (pageId: number, on: boolean) => send({ type: 'control', pageId, on }),
    pointer: (
      pageId: number,
      kind: 'move' | 'down' | 'up',
      x: number,
      y: number,
      button: MouseButton = 'left',
      clickCount = 1,
    ) => send({ type: 'pointer', pageId, kind, x, y, button, clickCount }),
    wheel: (pageId: number, x: number, y: number, dx: number, dy: number) =>
      send({ type: 'wheel', pageId, x, y, dx, dy }),
    key: (pageId: number, kind: 'down' | 'up', key: string) =>
      send({ type: 'key', pageId, kind, key }),
    paste: (pageId: number, text: string) => send({ type: 'text', pageId, text }),
    copy: (pageId: number) => send({ type: 'copy', pageId }),
  };

  return {
    state,
    error,
    onBrowser,
    tabs,
    mine,
    actions,
    framed,
    cursors,
    frameRef,
    setFocus,
    input,
  };
}

export type AgentBrowserStream = ReturnType<typeof useAgentBrowserStream>;
