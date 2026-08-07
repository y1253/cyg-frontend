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
import { createPortal } from 'react-dom';
import { useAuth } from './AuthContext';
import { ComposerStack } from '@/components/Companies/ComposerStack';
import {
  clampPos,
  maxExpanded,
  type ComposerPos,
} from '@/components/Companies/composer-layout';

/** Gmail's own limit, and a real one: three concurrent 250 MB uploads already
 *  saturate the browser's per-origin connection pool. */
const MAX_PER_PAGE = 3;
const CAP_NOTICE = 'You can have up to 3 compose windows open on a page.';

let nextDraftId = 0;

/** A new outbound email, sent from one company's connected mailbox. */
export interface EmailDraftSeed {
  companyId: number;
  /** The mailbox it will be sent from — shown in the header, since the user can
   *  navigate to a different company while this stays open. */
  fromAddress: string;
  /** "Drive" or "OneDrive", for the oversized-attachment badge. */
  cloudLabel: string;
  signatureHtml?: string;
}

interface DraftCommon {
  id: string;
  /**
   * The route the composer was opened from, and the only thing that decides where it
   * shows. A path rather than a company id because an internal draft carries no
   * company id at all — yet still lives on a `/companies/:id` page (the workspace).
   * One rule then covers both kinds.
   */
  ownerPath: string;
  minimized: boolean;
  /** `null` = parked in its default bottom-right slot; set once the user drags it,
   *  so the window comes back where they left it. */
  pos: ComposerPos | null;
  /** Reported up by the mounted body. The provider renders from it (a sending window
   *  stays on screen off its own page), so it is state and not a ref. */
  sending: boolean;
  /** Bumped to flash the window when a further compose is refused. */
  attention: number;
}

export type Draft =
  | ({ kind: 'email' } & DraftCommon & EmailDraftSeed)
  | ({ kind: 'internal' } & DraftCommon);

export interface ComposerActions {
  openEmail: (seed: EmailDraftSeed) => void;
  openInternal: () => void;
  close: (id: string) => void;
  setMinimized: (id: string, on: boolean) => void;
  setPos: (id: string, pos: ComposerPos | null) => void;
  setSending: (id: string, on: boolean) => void;
  /** Bring a window to the front — on any pointer press inside it. */
  raise: (id: string) => void;
  /** Re-clamp dragged windows and re-fit the parked ones after a resize. */
  reflow: () => void;
  setRoutePath: (path: string) => void;
  /** Clears only if `path` is still the current one — StrictMode runs the route
   *  watcher's cleanup once spuriously in dev. */
  clearRoutePath: (path: string) => void;
  notifyInternalSent: () => void;
}

/** Actions only, and every one of them is identity-stable — so the big consumers
 *  (`CommunicationsTab`, `InternalMessagesTab`) never re-render when a window is
 *  dragged, minimized or starts sending. The drafts themselves are handed to the
 *  stack as props instead of published through context. */
const ComposerCtx = createContext<ComposerActions | null>(null);
/** Separate, so a send landing doesn't re-render anything that only opens composers. */
const ComposerSignalsCtx = createContext<{ internalSentAt: number }>({ internalSentAt: 0 });

/**
 * Collapse the oldest parked windows on `path` until the expanded ones fit the
 * viewport. A dragged window is wherever the user put it and doesn't compete for a
 * slot; a sending one is never collapsed, because minimizing hides its progress bar
 * and any failure.
 */
function fitToViewport(list: Draft[], path: string, viewportWidth: number): Draft[] {
  const parked = list.filter((d) => d.ownerPath === path && d.pos === null && !d.minimized);
  const excess = parked.length - maxExpanded(viewportWidth);
  if (excess <= 0) return list;
  const victims = new Set(
    parked
      .filter((d) => !d.sending)
      .slice(0, excess)
      .map((d) => d.id),
  );
  if (victims.size === 0) return list;
  return list.map((d) => (victims.has(d.id) ? { ...d, minimized: true } : d));
}

/**
 * Owns every open composer for the whole app and renders them through a portal on
 * <body>.
 *
 * It has to live above the router. The composer used to be a modal dialog inside
 * CommunicationsTab, which made it impossible to browse while writing: that tab is
 * hidden with `display:none` on a tab switch (so even a `position:fixed` child
 * vanishes), it is remounted by `key={companyId}` when you open another company,
 * and the compose JSX sat inside the tab's inbox-only render branch.
 *
 * Navigating away no longer closes anything. A draft is simply not painted off its
 * own page — mounted, hidden, untouched — so walking to another company and back
 * returns every window exactly as it was left, attachments and all. That is also why
 * there is no autosave and no draft model: nothing is ever serialised because
 * nothing is ever destroyed. (A `File` could not be serialised anyway, which is why
 * a draft does not survive a page reload.)
 */
export function ComposerProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();

  // `draftsRef` is the authority and `drafts` exists to render: every action derives
  // the next array from the ref and commits both. Two calls in one tick — a fast
  // double-click on Compose — therefore both see the previous one, which a functional
  // setState could give us but a cap check plus a notice (a side effect) could not.
  const draftsRef = useRef<Draft[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const commit = useCallback((next: Draft[]) => {
    draftsRef.current = next;
    setDrafts(next);
  }, []);

  // The current route, published by ComposerRouteWatcher from inside the router.
  // `null` means "outside the authenticated shell" (/login, /privacy, /gmail/success),
  // where nothing is painted.
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const routePathRef = useRef<string | null>(null);
  const [topId, setTopId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [internalSentAt, setInternalSentAt] = useState(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const open = useCallback(
    (make: (base: DraftCommon) => Draft) => {
      const path = routePathRef.current;
      // Nowhere to belong — can't happen in practice, the watcher mounts long before
      // any Compose button renders, but a draft stamped with an unreachable path
      // would be invisible and uncloseable forever.
      if (path === null) return;

      const prev = draftsRef.current;
      if (prev.filter((d) => d.ownerPath === path).length >= MAX_PER_PAGE) {
        // Refusing in silence looks broken, so flash what is already there.
        commit(
          prev.map((d) =>
            d.ownerPath === path ? { ...d, attention: d.attention + 1 } : d,
          ),
        );
        flashNotice(CAP_NOTICE);
        return;
      }

      const draft = make({
        id: `draft-${++nextDraftId}`,
        ownerPath: path,
        minimized: false,
        pos: null,
        sending: false,
        attention: 0,
      });
      commit(fitToViewport([...prev, draft], path, window.innerWidth));
      setTopId(draft.id);
    },
    [commit, flashNotice],
  );

  const openEmail = useCallback(
    (seed: EmailDraftSeed) => open((base) => ({ kind: 'email', ...base, ...seed })),
    [open],
  );
  const openInternal = useCallback(
    () => open((base) => ({ kind: 'internal', ...base })),
    [open],
  );

  const close = useCallback(
    (id: string) => {
      commit(draftsRef.current.filter((d) => d.id !== id));
      setTopId((t) => (t === id ? null : t));
    },
    [commit],
  );

  const patch = useCallback(
    (id: string, fields: Partial<DraftCommon>) => {
      const prev = draftsRef.current;
      const i = prev.findIndex((d) => d.id === id);
      // A body unmounting during logout reports `sending: false` for an id that is
      // already gone; and a repeat of the value it already has is not worth a render.
      if (i === -1) return;
      const current = prev[i];
      const changed = (Object.keys(fields) as (keyof DraftCommon)[]).some(
        (k) => current[k] !== fields[k],
      );
      if (!changed) return;
      const next = prev.slice();
      next[i] = { ...current, ...fields };
      commit(next);
    },
    [commit],
  );

  const setMinimized = useCallback(
    (id: string, on: boolean) => patch(id, { minimized: on }),
    [patch],
  );
  const setPos = useCallback(
    (id: string, pos: ComposerPos | null) => patch(id, { pos }),
    [patch],
  );
  const setSending = useCallback(
    (id: string, on: boolean) => patch(id, { sending: on }),
    [patch],
  );
  const raise = useCallback((id: string) => setTopId((t) => (t === id ? t : id)), []);

  const reflow = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const prev = draftsRef.current;
    let next = prev.map((d) => {
      if (!d.pos) return d;
      const p = clampPos(d.pos, d.minimized, vw, vh);
      return p.x === d.pos.x && p.y === d.pos.y ? d : { ...d, pos: p };
    });
    if (routePathRef.current !== null) {
      next = fitToViewport(next, routePathRef.current, vw);
    }
    if (next.some((d, i) => d !== prev[i])) commit(next);
  }, [commit]);

  const setRoutePath = useCallback((path: string) => {
    routePathRef.current = path;
    setCurrentPath(path);
  }, []);
  const clearRoutePath = useCallback((path: string) => {
    if (routePathRef.current !== path) return;
    routePathRef.current = null;
    setCurrentPath(null);
  }, []);

  const notifyInternalSent = useCallback(() => setInternalSentAt((n) => n + 1), []);

  // A draft belongs to the session that wrote it: logging out must not leave one
  // hanging over the login page, or hand it to whoever logs in next. Adjusted during
  // render rather than in an effect, so the stale draft is never painted once.
  const [lastToken, setLastToken] = useState(token);
  if (token !== lastToken) {
    setLastToken(token);
    if (!token && draftsRef.current.length > 0) {
      draftsRef.current = [];
      setDrafts([]);
      setTopId(null);
    }
  }

  const actions = useMemo<ComposerActions>(
    () => ({
      openEmail,
      openInternal,
      close,
      setMinimized,
      setPos,
      setSending,
      raise,
      reflow,
      setRoutePath,
      clearRoutePath,
      notifyInternalSent,
    }),
    [
      openEmail,
      openInternal,
      close,
      setMinimized,
      setPos,
      setSending,
      raise,
      reflow,
      setRoutePath,
      clearRoutePath,
      notifyInternalSent,
    ],
  );

  const signals = useMemo(() => ({ internalSentAt }), [internalSentAt]);

  return (
    <ComposerCtx.Provider value={actions}>
      <ComposerSignalsCtx.Provider value={signals}>
        {children}
        {/* Gated on the draft count alone. Gating on anything that varies with the
            route — visibility, currentPath — would unmount the stashed windows and
            destroy the very drafts this is here to keep. */}
        {drafts.length > 0
          ? createPortal(
              <ComposerStack
                drafts={drafts}
                currentPath={currentPath}
                topId={topId}
                notice={notice}
                actions={actions}
              />,
              document.body,
            )
          : null}
      </ComposerSignalsCtx.Provider>
    </ComposerCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useComposer(): ComposerActions {
  const ctx = useContext(ComposerCtx);
  if (!ctx) {
    throw new Error('useComposer must be used within a ComposerProvider');
  }
  return ctx;
}

/** `internalSentAt` bumps on every successful internal send, so the Messages tab can
 *  jump to its Sent folder. It is a signal rather than an `onSent` callback on the
 *  draft because a stashed draft outlives the tab instance that opened it. */
// eslint-disable-next-line react-refresh/only-export-components
export function useComposerSignals(): { internalSentAt: number } {
  return useContext(ComposerSignalsCtx);
}
