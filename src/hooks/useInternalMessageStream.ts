import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { internalEventsUrl } from '@/api/internalMessages';

/** Display-only metadata the server attaches to a `new-message` event. All fields
 *  are optional so an older server (which sent only `{type}`) still works. */
export interface InternalMessageEvent {
  from?: string;
  subject?: string;
  snippet?: string;
  threadId?: number;
}

const MAX_BACKOFF_MS = 30_000;

/**
 * The app's single connection to the per-user internal-message stream.
 *
 * This lived inside `InternalMessagesTab` and was gated on that tab being visible,
 * so it died the moment the user navigated anywhere else — which is exactly when a
 * notification matters most. Mounted once from `NotificationProvider` (i.e. from
 * `AppLayout`) it survives every route change and there is still only one
 * EventSource per tab.
 *
 * `onNewMessage` must be identity-stable or the effect will tear down and rebuild
 * the connection on every render.
 */
export function useInternalMessageStream(
  onNewMessage: (meta: InternalMessageEvent) => void,
) {
  const { token } = useAuth();
  const qc = useQueryClient();
  // Read through a ref so a changing callback can never churn the connection.
  const handlerRef = useRef(onNewMessage);
  useEffect(() => {
    handlerRef.current = onNewMessage;
  }, [onNewMessage]);

  useEffect(() => {
    if (!token) return;

    let es: EventSource | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      es = new EventSource(internalEventsUrl(token));

      es.onopen = () => {
        retry = 0;
      };

      es.onmessage = (e) => {
        let payload: { type?: string } & InternalMessageEvent;
        try {
          payload = JSON.parse(e.data as string) as typeof payload;
        } catch {
          return;
        }
        if (payload.type !== 'new-message') return; // ignores the 25s `ping`

        void qc.invalidateQueries({ queryKey: ['internal-messages'] });
        void qc.invalidateQueries({ queryKey: ['internal-uncompleted-count'] });
        void qc.invalidateQueries({ queryKey: ['internal-unread-count'] });
        void qc.invalidateQueries({ queryKey: ['gmail-uncompleted-counts'] });
        // The broad key, not ['internal-message-thread', id] — up here we don't
        // know which thread is open, and invalidating an unmounted query only
        // marks it stale.
        void qc.invalidateQueries({ queryKey: ['internal-message-thread'] });

        handlerRef.current({
          from: payload.from,
          subject: payload.subject,
          snippet: payload.snippet,
          threadId: payload.threadId,
        });
      };

      es.onerror = () => {
        // A non-CLOSED readyState means the browser is already retrying on its own
        // — closing it here (as this code used to) throws away the native retry and
        // the stream never comes back.
        if (es?.readyState !== EventSource.CLOSED) return;
        es.close();
        es = null;
        const delay =
          Math.min(MAX_BACKOFF_MS, 1000 * 2 ** retry++) + Math.random() * 500;
        timer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      stopped = true;
      clearTimeout(timer);
      es?.close();
    };
  }, [token, qc]);
}
