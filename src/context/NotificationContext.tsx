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
import { fetchLatestPreview } from '@/api/communications';
import { messagePreview } from '@/lib/notificationText';
import {
  notificationPermission,
  requestNotificationPermission,
  showDesktopNotification,
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

function readPrefs(): Prefs {
  // `desktop` is reconciled against the live permission right here: the stored flag
  // can outlive the permission that made it meaningful (revoked in site settings, or
  // the same account on a different machine), and a true flag with no permission
  // would silently drop every notification.
  const granted = notificationPermission() === 'granted';
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { sound: true, desktop: false, whileActive: true };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      sound: parsed.sound !== false,
      desktop: parsed.desktop === true && granted,
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
  /** Announce a message a push stream just delivered. See `notify` for the rules. */
  notifyPush: (input: {
    source: string;
    title: string;
    body: string;
    tag: string;
    onClick?: () => void;
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

      if (prefsRef.current.desktop) {
        showDesktopNotification({
          title: input.title,
          body: input.body,
          tag: input.tag,
          // Only silence the OS sound if we actually made one — if Web Audio was
          // unavailable, let the system tone stand in for the chime.
          silent: chimed,
          onClick: input.onClick,
        });
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
    }) => {
      suppressRef.current.set(input.source, Date.now());
      notify(input);
    },
    [notify],
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
      pendingOpen,
      requestOpen,
      clearPendingOpen,
    ],
  );

  return (
    <NotificationCtx.Provider value={value}>
      {children}
      {/* Rendered by the provider itself rather than mounted separately in
          AppLayout: the toast list is private state and nothing else needs it. */}
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </NotificationCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications(): NotificationValue {
  const ctx = useContext(NotificationCtx);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
}
