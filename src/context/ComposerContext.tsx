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
import { DockedComposer } from '@/components/Companies/DockedComposer';

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

/** A new internal staff-to-staff message. */
export interface InternalDraftSeed {
  /** Lets the Messages tab jump to its Sent folder once the send lands. */
  onSent?: () => void;
}

export type Draft =
  | ({ kind: 'email' } & EmailDraftSeed)
  | ({ kind: 'internal' } & InternalDraftSeed);

interface ComposerValue {
  draft: Draft | null;
  openEmail: (seed: EmailDraftSeed) => void;
  openInternal: (seed?: InternalDraftSeed) => void;
  close: () => void;
  minimized: boolean;
  setMinimized: (on: boolean) => void;
}

const ComposerCtx = createContext<ComposerValue | null>(null);

/**
 * Owns the one docked composer for the whole app and renders it through a portal
 * on <body>.
 *
 * It has to live above the router. The composer used to be a modal dialog inside
 * CommunicationsTab, which made it impossible to browse while writing: that tab is
 * hidden with `display:none` on a tab switch (so even a `position:fixed` child
 * vanishes), it is remounted by `key={companyId}` when you open another company,
 * and the compose JSX sat inside the tab's inbox-only render branch. Up here,
 * nothing but an explicit Cancel/Send closes it.
 */
export function ComposerProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [minimized, setMinimized] = useState(false);
  // Bumped whenever an open composer is re-requested, so the window can flash for
  // attention instead of silently ignoring the click.
  const [attention, setAttention] = useState(0);
  // Read the open draft from a ref inside the open* callbacks so they stay stable
  // (a re-created `openEmail` would re-run effects in every consumer). Synced in an
  // effect, not during render — same pattern as `prefsRef` in NotificationContext.
  const draftRef = useRef<Draft | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Opening while one is already open must never replace it — that would destroy a
  // draft the user cannot recover (there is no draft autosave). Surface the existing
  // window instead.
  const openEmail = useCallback((seed: EmailDraftSeed) => {
    if (draftRef.current) {
      setMinimized(false);
      setAttention((n) => n + 1);
      return;
    }
    setMinimized(false);
    setDraft({ kind: 'email', ...seed });
  }, []);

  const openInternal = useCallback((seed?: InternalDraftSeed) => {
    if (draftRef.current) {
      setMinimized(false);
      setAttention((n) => n + 1);
      return;
    }
    setMinimized(false);
    setDraft({ kind: 'internal', ...(seed ?? {}) });
  }, []);

  const close = useCallback(() => {
    setDraft(null);
    setMinimized(false);
  }, []);

  // A draft belongs to the session that wrote it: logging out must not leave one
  // hanging over the login page, or hand it to whoever logs in next. Adjusted during
  // render rather than in an effect, so the stale draft is never painted once.
  const [lastToken, setLastToken] = useState(token);
  if (token !== lastToken) {
    setLastToken(token);
    if (!token) {
      setDraft(null);
      setMinimized(false);
    }
  }

  const value = useMemo(
    () => ({ draft, openEmail, openInternal, close, minimized, setMinimized }),
    [draft, openEmail, openInternal, close, minimized],
  );

  return (
    <ComposerCtx.Provider value={value}>
      {children}
      {draft
        ? createPortal(
            <DockedComposer
              draft={draft}
              minimized={minimized}
              onMinimize={setMinimized}
              onClose={close}
              attention={attention}
            />,
            document.body,
          )
        : null}
    </ComposerCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useComposer(): ComposerValue {
  const ctx = useContext(ComposerCtx);
  if (!ctx) {
    throw new Error('useComposer must be used within a ComposerProvider');
  }
  return ctx;
}
