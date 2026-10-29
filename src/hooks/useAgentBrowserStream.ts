import { useEffect, useRef, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchBrowserTicket, type BrowserAction } from '@/api/agents';

/** Steps kept on screen; older ones are in the session history. */
const MAX_ACTIONS = 300;
/** Wait before redialling a dropped stream. */
const RETRY_MS = 3_000;

export type StreamState = 'connecting' | 'live' | 'error';

interface StreamMessage {
  type?: string;
  onBrowser?: boolean;
  url?: string | null;
  data?: string;
  actions?: BrowserAction[];
  action?: BrowserAction['action'];
  detail?: string;
  at?: string;
}

/**
 * step11 part 2: watch an agent's browser live. A 60-second ticket from our API opens the
 * agents server's `/api/browser/ws`; it pushes the page as JPEG frames (drawn straight into
 * `imgRef`, so a frame never re-renders the panel) and every step the agent takes. View
 * only. Redials on a drop, with a fresh ticket, while the panel is open.
 */
export function useAgentBrowserStream(
  companyId: number,
  agentId: number,
  imgRef: RefObject<HTMLImageElement | null>,
) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<StreamState>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [onBrowser, setOnBrowser] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const [actions, setActions] = useState<BrowserAction[]>([]);
  const hasFrameRef = useRef(false);

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
            setUrl(msg.url ?? null);
            if (!msg.onBrowser) {
              hasFrameRef.current = false;
              setHasFrame(false);
            }
            void queryClient.invalidateQueries({
              queryKey: ['agent-browser-sessions', companyId, agentId],
            });
          } else if (msg.type === 'actions') {
            setActions((msg.actions ?? []).slice(-MAX_ACTIONS));
          } else if (msg.type === 'action' && msg.action) {
            const step: BrowserAction = {
              action: msg.action,
              detail: msg.detail ?? '',
              url: msg.url ?? null,
              at: msg.at ?? new Date().toISOString(),
            };
            setActions((prev) => [...prev, step].slice(-MAX_ACTIONS));
          } else if (msg.type === 'frame' && msg.data) {
            if (imgRef.current) {
              imgRef.current.src = `data:image/jpeg;base64,${msg.data}`;
            }
            if (msg.url) setUrl(msg.url);
            if (!hasFrameRef.current) {
              hasFrameRef.current = true;
              setHasFrame(true);
            }
          }
        };
        ws.onclose = (ev) => {
          if (stopped) return;
          if (ev.code === 4401 || ev.code === 4404) {
            setState('error');
            setError('Not allowed to watch this agent.');
            return;
          }
          setState('connecting');
          retry = setTimeout(() => void connect(), RETRY_MS);
        };
      } catch (err) {
        if (stopped) return;
        setState('error');
        setError((err as Error).message);
        retry = setTimeout(() => void connect(), RETRY_MS * 3);
      }
    };

    void connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [token, companyId, agentId, imgRef, queryClient]);

  return { state, error, onBrowser, url, hasFrame, actions };
}
