import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTabMissedCallBadge } from '@/hooks/useTabMissedCallBadge';
import { fetchLatestPreview } from '@/api/communications';
import { messagePreview } from '@/lib/notificationText';
import {
  notificationPermission,
  requestNotificationPermission,
  showDesktopNotification,
  showCallNotification,
  SW_MESSAGE_SOURCE,
  type NotificationRoute,
} from '@/lib/desktopNotification';
import { playMessageChime, unlockAudio } from '@/lib/notificationSound';
import { Toaster, type AppToast } from '@/components/ui/toast';
import {
  useInternalMessageStream,
  type InternalMessageEvent,
} from '@/hooks/useInternalMessageStream';
import {
  useNewMessageNotifier,
  type RisenCompany,
} from '@/hooks/useNewMessageNotifier';
import { writePendingCommSelection } from '@/components/Companies/communications/useCommUiState';
import type { OpenRequest, PendingOpen } from '@/components/Layout/unread-feed';

const PREFS_KEY = 'cyg-notify';

/** Leading-edge: five messages landing together give one chime, immediately. */
const CHIME_THROTTLE_MS = 3000;

/** Visible at once. Beyond this the oldest drops off rather than stacking. */
const MAX_TOASTS = 3;
/** A burst of SSE events should produce one notification, not five. */
const INTERNAL_DEBOUNCE_MS = 600;

// A push event already told us about this message, so the slower count poll must not
// announce it again. Each window has to outlast the poll interval it guards:
// internal counts poll every 30s, the company count map every 60s.
const SUPPRESS_MS: Record<string, number> = {
  internal: 45_000,
  company: 90_000,
};

/**
 * How old the newest message may be and still be treated as "what just arrived".
 *
 * The count map rises for reasons other than delivery — marking something
 * uncompleted does it too — and the poll itself runs only once a minute. Beyond this
 * window the newest inbox item probably isn't the cause, so the popup says the
 * honest generic thing rather than quoting an email from last Tuesday.
 */
const PREVIEW_MAX_AGE_MS = 10 * 60 * 1000;

interface Prefs {
  sound: boolean;
  desktop: boolean;
  /** Alert even while the tab has focus. Off returns to unfocused-only alerts. */
  whileActive: boolean;
}

/**
 * What the user ASKED FOR, verbatim — never reconciled against the live permission.
 *
 * ⚠️ `desktop` used to be stored as `parsed.desktop === true && granted`, and the effect
 * below then wrote that coerced object straight back. So ONE page load without permission
 * rewrote the preference to false permanently, and it never came back when permission
 * did. Chrome revokes notification permission on its own (Safety Check does it for sites
 * you have not visited lately) and a single stray "Continue blocking" is enough — after
 * which the user got toasts forever, no OS notification, and a checkbox that had silently
 * unticked itself.
 *
 * Intent is stored; whether it can be ACTED on is decided at the point of use, against the
 * live permission. That is also what lets desktop notifications resume by themselves the
 * moment permission is granted again.
 */
function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { sound: true, desktop: false, whileActive: true };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      sound: parsed.sound !== false,
      desktop: parsed.desktop === true,
      // Absent in blobs written before this pref existed — those users get the new
      // behavior, which is the point of the change.
      whileActive: parsed.whileActive !== false,
    };
  } catch {
    return { sound: true, desktop: false, whileActive: true };
  }
}

interface NotificationValue {
  prefs: Prefs;
  setSound: (on: boolean) => void;
  /** Requests browser permission when turning on; resolves to the granted state. */
  setDesktop: (on: boolean) => Promise<boolean>;
  setWhileActive: (on: boolean) => void;
  permission: NotificationPermission | 'unsupported';
  /** Plays the chime regardless of focus — for the "Test sound" button. */
  testSound: () => void;
  /**
   * Timestamp of the last internal-message push, for components that want their own
   * in-page reaction (the Messages tab shows a banner). Null until the first event.
   */
  lastInternalEventAt: number | null;
  /**
   * Raise an in-app toast and nothing else.
   *
   * Deliberately separate from `notify`/`notifyPush`: this is for telling somebody that an
   * action they just took FAILED, which must never be filtered by alert preferences, never
   * chime, and never raise a desktop notification the way an arriving message does. Same
   * component underneath, different event.
   */
  pushToast: (input: {
    title: string;
    body: string;
    onClick?: () => void;
  }) => void;
  /** Announce a message a push stream just delivered. See `notify` for the rules. */
  notifyPush: (input: {
    source: string;
    title: string;
    body: string;
    tag: string;
    onClick?: () => void;
    /** Serialisable twin of `onClick`, for the service-worker notification path. */
    route?: NotificationRoute;
  }) => void;
  /**
   * Mute a source for its suppression window without announcing anything.
   *
   * For actions the user just took that raise one of the counts the poll watches —
   * marking a message unread or uncompleted. Those look exactly like a new message
   * arriving, and now that alerts fire while the tab is focused, the user would be
   * chimed at by their own click.
   */
  suppressSource: (source: string) => void;
  /**
   * One thing the user asked to open, from the notification panel.
   *
   * Needed as a LIVE channel rather than only a localStorage write because
   * `CompanyDetailPage` reuses a single component instance across `/companies/:id` and
   * `CommunicationsTab` re-reads its restore point only when its `key={companyId}`
   * changes — so writing storage and navigating does nothing at all when the user is
   * already standing on that company. This covers both cases with one code path.
   */
  pendingOpen: PendingOpen | null;
  /** Ask for a message to be opened: writes the restore point, then navigates. */
  requestOpen: (p: OpenRequest) => void;
  /** Consumed by the tab that applied it — never by the page that only switched tabs. */
  clearPendingOpen: () => void;
}

const NotificationCtx = createContext<NotificationValue | null>(null);

/**
 * `notifyCall` on its OWN context, deliberately.
 *
 * `SoftphoneProvider` is the only consumer, and taking it off `NotificationCtx` would
 * re-render the entire softphone — and with it the call overlay — every time this
 * provider's value changes, which is on every internal message, every toast and every
 * `pendingOpen`. This value is a single `useCallback` with no dependencies, so it is
 * stable for the life of the app and costs nothing.
 *
 * Same State/Actions split `SoftphoneContext` and `ComposerContext` already use.
 */
type CallNotifier = (input: {
  callSid: string;
  companyId: number;
  title: string;
  body: string;
  silent: boolean;
}) => void;

const CallNotifyCtx = createContext<CallNotifier | null>(null);

/**
 * Owns everything about new-message alerting: the audio context, the user's
 * preferences, the single internal-message stream, and the count-diff watcher for
 * email/chat.
 *
 * Mounted from `AppLayout` rather than `App.tsx` on purpose — it needs `useNavigate`
 * for notification clicks (so it must sit inside the router), it should only run for
 * authenticated routes, and unmounting on logout is what tears the stream down.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [permission, setPermission] = useState<
    NotificationPermission | 'unsupported'
  >(notificationPermission);
  const [lastInternalEventAt, setLastInternalEventAt] = useState<number | null>(
    null,
  );

  const lastChimeRef = useRef(0);
  const suppressRef = useRef(new Map<string, number>());

  // Read through a ref for the same reason as prefs: a re-created callback would
  // restart the debounce timers and re-run the count-diff effect.
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Read prefs from a ref inside callbacks so they don't need to be dependencies —
  // a re-created callback would restart the debounce timers.
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Private mode / storage full. Prefs just won't persist.
    }
  }, [prefs]);

  // An AudioContext created outside a user gesture starts suspended and can only be
  // resumed by one, so wait for the first real interaction. Capture phase, so a
  // handler that stops propagation can't hide the gesture from us.
  useEffect(() => {
    const unlock = () => unlockAudio();
    const opts = { once: true, capture: true } as const;
    window.addEventListener('pointerdown', unlock, opts);
    window.addEventListener('keydown', unlock, opts);
    return () => {
      window.removeEventListener('pointerdown', unlock, opts);
      window.removeEventListener('keydown', unlock, opts);
    };
  }, []);

  const isSuppressed = useCallback((source: string) => {
    const at = suppressRef.current.get(source);
    if (at === undefined) return false;
    const span = SUPPRESS_MS[source.split(':')[0]] ?? 0;
    return Date.now() - at < span;
  }, []);

  const [toasts, setToasts] = useState<AppToast[]>([]);
  const toastSeq = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /** Newest wins: keep the stack short enough to read at a glance. */
  const pushToast = useCallback(
    (input: { title: string; body: string; onClick?: () => void }) => {
      const id = ++toastSeq.current;
      setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, ...input }]);
    },
    [],
  );

  /**
   * The single funnel for every alert.
   *
   * Fires whether or not the tab has focus. The in-page banners that used to cover
   * the focused case are tab-local — they only render on the one company tab the
   * message belongs to, so a user working anywhere else in the app got nothing.
   *
   * `whileActive` off restores the old unfocused-only behavior. `hasFocus()` rather
   * than `visibilityState` is what defines "active": it also catches a visible
   * window sitting behind another app.
   */
  const notify = useCallback(
    (input: {
      title: string;
      body: string;
      tag: string;
      onClick?: () => void;
      /**
       * The same destination as `onClick`, expressed as data.
       *
       * Both are needed and they are not redundant: the toast and the constructor
       * fallback run the closure, while the service-worker path — now the primary one
       * for desktop notifications — can only carry something serialisable across to a
       * different JS realm.
       */
      route?: NotificationRoute;
    }) => {
      // The in-app toast fires ABOVE the focus check on purpose. `whileActive` is
      // there to stop a desktop notification interrupting someone who is already
      // working — but a toast in exactly that situation is the whole point of it,
      // and it is the only alert a focused user can actually see. The pref keeps
      // gating the chime and the OS notification below.
      pushToast({ title: input.title, body: input.body, onClick: input.onClick });

      if (document.hasFocus() && !prefsRef.current.whileActive) return;

      const now = Date.now();
      let chimed = false;
      if (prefsRef.current.sound && now - lastChimeRef.current >= CHIME_THROTTLE_MS) {
        chimed = playMessageChime();
        if (chimed) lastChimeRef.current = now;
      }

      // Intent AND permission. The stored flag is what the user asked for and survives a
      // permission blip; this is the live check that decides whether it can be acted on,
      // which is also what makes desktop alerts resume on their own once Chrome hands the
      // permission back. See `readPrefs`.
      if (prefsRef.current.desktop && notificationPermission() === 'granted') {
        // `void` + `.catch`, the same guard `notifyCall` uses: a bare `void` on a
        // rejecting promise is an unhandled rejection.
        void showDesktopNotification({
          title: input.title,
          body: input.body,
          tag: input.tag,
          // ⚠️ NEVER silent, and `chimed` is deliberately ignored here.
          //
          // This used to be `silent: chimed`, muting the OS notification whenever our own
          // Web Audio chime played. The polarity was backwards in practice: `chimed` means
          // "we scheduled Web Audio", NOT "the user heard something" — and a backgrounded
          // tab is exactly where Chrome throttles audio, where "Mute site" applies, and
          // where output may be on another device. So the one case that needs a sound was
          // the case being silenced, and unticking "Notification sound" made it LOUDER.
          //
          // Both sounds is the explicit choice. The cost is a possible double-ding while
          // the app is focused with "alert me while I'm using the app" on; the alternative
          // traded a guaranteed sound for a chime a background tab often never plays.
          silent: false,
          onClick: input.onClick,
          route: input.route,
        }).catch(() => undefined);
      }
    },
    [pushToast],
  );

  const suppressSource = useCallback((source: string) => {
    suppressRef.current.set(source, Date.now());
  }, []);

  const notifyPush = useCallback(
    (input: {
      source: string;
      title: string;
      body: string;
      tag: string;
      onClick?: () => void;
      route?: NotificationRoute;
    }) => {
      suppressRef.current.set(input.source, Date.now());
      notify(input);
    },
    [notify],
  );

  /**
   * A call is ringing — raise the OS notification with Answer and Decline.
   *
   * ── WHY THIS IS NOT `notify()` ────────────────────────────────────────────────
   * Three differences, each deliberate:
   *  - NO in-app toast. The call overlay is already on screen saying the same thing,
   *    with a working Answer button; a toast beside it is noise.
   *  - NO chime. `startRinging()` owns the sound for a call, and it has a whole ring
   *    cadence rather than a one-shot.
   *  - `silent` is decided by the CALLER, from `audioReady()`. A tab the agent has
   *    never clicked in has no AudioContext, so `startRinging()` returns false and the
   *    call is completely silent — in that case the OS sound is the only sound there
   *    is, and suppressing it would leave the ring unannounced.
   *
   * What it keeps is the two rules that matter: the `desktop` pref, and not interrupting
   * someone who is already looking at the app.
   */
  const notifyCall = useCallback(
    (input: {
      callSid: string;
      companyId: number;
      title: string;
      body: string;
      silent: boolean;
    }) => {
      if (!prefsRef.current.desktop) return;
      if (document.hasFocus() && !prefsRef.current.whileActive) return;
      void showCallNotification(input).catch(() => undefined);
    },
    [],
  );

  const [pendingOpen, setPendingOpen] = useState<PendingOpen | null>(null);
  const openSeq = useRef(0);

  const clearPendingOpen = useCallback(() => setPendingOpen(null), []);

  /** Focus this window and land on a company page, on the tab that has the message. */
  const openCompany = useCallback(
    (companyId: number, tab: 'messages' | 'communications') => {
      // CompanyDetailPage seeds its active tab from this key on mount and re-reads it
      // when companyId changes, so writing it first is what makes the deep link land
      // on the right tab. Merge, don't overwrite — the same object holds other UI state.
      try {
        const key = `cmp-ui-${companyId}`;
        const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<
          string,
          unknown
        >;
        localStorage.setItem(key, JSON.stringify({ ...stored, tab }));
      } catch {
        // Non-fatal: we just land on whichever tab was last used.
      }
      navigate(`/companies/${companyId}`);
    },
    [navigate],
  );

  /**
   * Open one specific message, wherever the user currently is.
   *
   * `seq` is what makes clicking the SAME row twice work: an effect keyed on the payload
   * alone would see an identical object and do nothing the second time.
   *
   * The storage write is for the cold case — the tab is not mounted yet, and for a
   * reload afterwards. The live `pendingOpen` above is what the already-mounted tab
   * hears, which storage alone cannot reach.
   */
  const requestOpen = useCallback(
    (input: OpenRequest) => {
      if (input.scope === 'company') {
        writePendingCommSelection(input.companyId, input.selection);
      }
      setPendingOpen({ ...input, seq: ++openSeq.current });
      openCompany(
        input.companyId,
        input.scope === 'internal' ? 'messages' : 'communications',
      );
    },
    [openCompany],
  );

  /**
   * A MESSAGE notification was clicked while this tab was open.
   *
   * The worker cannot run the `onClick` closure — it is a different JS realm — so the
   * destination travelled as data and comes back here to be navigated. This is what
   * keeps a desktop notification clickable now that the worker is the primary path;
   * before it, the worker fallback could only focus the window and leave the user to
   * find the message themselves.
   *
   * The `source` guard is load-bearing for the same reason it is in `SoftphoneContext`:
   * workbox and the PWA plugin post their own messages on this very channel. A CALL
   * message carries no `route` and falls straight through.
   */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const message = event.data as
        | { source?: string; kind?: string; route?: NotificationRoute }
        | undefined;
      if (message?.source !== SW_MESSAGE_SOURCE) return;
      if (message.kind !== 'message') return;

      const route = message.route;
      if (!route) return;
      if (route.kind === 'dashboard') {
        navigate('/dashboard');
        return;
      }
      openCompany(route.companyId, route.tab);
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate, openCompany]);

  // ── Internal messages: instant, via the per-user stream ────────────────────
  const internalDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const internalWorkspaceId = useRef<number | null>(null);

  const onInternalEvent = useCallback(
    (meta: InternalMessageEvent) => {
      // The banner and the query invalidations are immediate; only the alert is
      // debounced, so a burst of messages makes one sound and one notification.
      setLastInternalEventAt(Date.now());
      suppressRef.current.set('internal', Date.now());

      clearTimeout(internalDebounce.current);
      internalDebounce.current = setTimeout(() => {
        const workspaceId = internalWorkspaceId.current;
        notify({
          title: meta.from ?? 'New internal message',
          // The sender is already the title here, so only subject + snippet go in
          // the body — messagePreview skips the parts it isn't given.
          body: meta.from
            ? messagePreview({ subject: meta.subject, snippet: meta.snippet })
            : 'You have a new message in Cyg Finance',
          tag: 'cyg-internal',
          onClick: workspaceId
            ? () => openCompany(workspaceId, 'messages')
            : undefined,
          route: workspaceId
            ? { kind: 'company', companyId: workspaceId, tab: 'messages' }
            : undefined,
        });
      }, INTERNAL_DEBOUNCE_MS);
    },
    [notify, openCompany],
  );

  useInternalMessageStream(onInternalEvent);

  useEffect(() => () => clearTimeout(internalDebounce.current), []);

  // ── Email / chat / Outlook: the unified count poll ─────────────────────────
  const onCompaniesRose = useCallback(
    (risen: RisenCompany[]) => {
      if (risen.length === 1) {
        const only = risen[0];
        // The count map is integers only, so the message itself has to be fetched.
        // Deliberately not awaited by anything: the popup fires a beat later, which
        // is nothing next to the up-to-60s poll that detected the arrival, and a
        // failed or stale preview still produces a popup with a generic body.
        void (async () => {
          const preview = tokenRef.current
            ? await fetchLatestPreview(tokenRef.current, only.id)
            : null;
          const fresh =
            preview &&
            Date.now() - Date.parse(preview.receivedAt) < PREVIEW_MAX_AGE_MS;
          notify({
            title: only.name ?? 'A client company',
            body: fresh ? messagePreview(preview) : 'New message',
            tag: `cyg-company-${only.id}`,
            onClick: () => openCompany(only.id, 'communications'),
            route: {
              kind: 'company',
              companyId: only.id,
              tab: 'communications',
            },
          });
        })();
        return;
      }

      // Name the first two and count the rest. Unnamed companies (not in the cached
      // list yet) still contribute to the count, so the total always adds up.
      const named = risen.map((c) => c.name).filter((n): n is string => !!n);
      const shown = named.slice(0, 2);
      const extra = risen.length - shown.length;
      notify({
        title: 'New messages',
        body: shown.length
          ? `${shown.join(', ')}${extra > 0 ? ` +${extra} more` : ''}`
          : `${risen.length} companies`,
        tag: 'cyg-companies',
        onClick: () => navigate('/dashboard'),
        route: { kind: 'dashboard' },
      });
    },
    [notify, openCompany, navigate],
  );

  const onInternalUnreadRose = useCallback(() => {
    const workspaceId = internalWorkspaceId.current;
    notify({
      title: 'New internal message',
      body: 'You have a new message in Cyg Finance',
      tag: 'cyg-internal',
      onClick: workspaceId
        ? () => openCompany(workspaceId, 'messages')
        : undefined,
      route: workspaceId
        ? { kind: 'company', companyId: workspaceId, tab: 'messages' }
        : undefined,
    });
  }, [notify, openCompany]);

  const onInternalWorkspaceId = useCallback((id: number | null) => {
    internalWorkspaceId.current = id;
  }, []);

  useNewMessageNotifier({
    onCompaniesRose,
    onInternalUnreadRose,
    isSuppressed,
    onInternalWorkspaceId,
  });

  // The red missed-call number on the browser tab icon while the tab is in the
  // background. Mounted here for the same reason as the notifier above: this is the one
  // app-wide, signed-in place, and it shares the same summary query.
  useTabMissedCallBadge();

  const setSound = useCallback((on: boolean) => {
    setPrefs((p) => ({ ...p, sound: on }));
  }, []);

  const setWhileActive = useCallback((on: boolean) => {
    setPrefs((p) => ({ ...p, whileActive: on }));
  }, []);

  const setDesktop = useCallback(async (on: boolean) => {
    if (!on) {
      setPrefs((p) => ({ ...p, desktop: false }));
      return false;
    }
    // Called straight from the checkbox's click handler, which is the transient
    // activation Safari requires for a permission prompt.
    const result = await requestNotificationPermission();
    setPermission(result);
    const granted = result === 'granted';
    setPrefs((p) => ({ ...p, desktop: granted }));
    return granted;
  }, []);

  const testSound = useCallback(() => {
    unlockAudio();
    playMessageChime();
  }, []);

  const value = useMemo(
    () => ({
      prefs,
      setSound,
      setDesktop,
      setWhileActive,
      permission,
      testSound,
      lastInternalEventAt,
      notifyPush,
      suppressSource,
      // The in-app toast on its own, deliberately separate from `notify`: this is for
      // telling somebody an action they just took failed, which must never be filtered by
      // alert preferences, chime or raise a desktop notification the way an incoming
      // MESSAGE does. Same component, different event.
      pushToast,
      pendingOpen,
      requestOpen,
      clearPendingOpen,
    }),
    [
      prefs,
      setSound,
      setDesktop,
      setWhileActive,
      permission,
      testSound,
      lastInternalEventAt,
      notifyPush,
      suppressSource,
      pushToast,
      pendingOpen,
      requestOpen,
      clearPendingOpen,
    ],
  );

  return (
    <NotificationCtx.Provider value={value}>
      <CallNotifyCtx.Provider value={notifyCall}>{children}</CallNotifyCtx.Provider>
      {/* Rendered by the provider itself rather than mounted separately in
          AppLayout: the toast list is private state and nothing else needs it. */}
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </NotificationCtx.Provider>
  );
}

/**
 * Raise the OS notification for a ringing call.
 *
 * Returns a no-op outside the provider rather than throwing: a missing call alert must
 * never be the thing that unmounts the softphone.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useCallNotifier(): CallNotifier {
  return useContext(CallNotifyCtx) ?? noopCallNotifier;
}

const noopCallNotifier: CallNotifier = () => undefined;

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications(): NotificationValue {
  const ctx = useContext(NotificationCtx);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
}
