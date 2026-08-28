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
import {
  Invitation,
  Registerer,
  RegistererState,
  SessionState,
  UserAgent,
  type Session,
} from 'sip.js';
import { useAuth } from '@/context/AuthContext';
import { fetchSipCredentials, phoneEventsUrl } from '@/api/phone';
import { startRinging, stopRinging, unlockAudio } from '@/lib/notificationSound';
import { CallOverlay } from '@/components/Phone/CallOverlay';

/** Where the SIP registration currently stands. Surfaced so it is never a mystery. */
export type SoftphoneStatus =
  | 'idle'
  | 'connecting'
  | 'registered'
  | 'unavailable'
  | 'failed';

/** What the SSE stream tells us about a call the INVITE cannot. */
export interface IncomingCallInfo {
  companyId: number;
  companyName: string;
  from: string;
  callSid: string;
  at: number;
}

export type CallPhase = 'idle' | 'ringing' | 'active';

interface SoftphoneState {
  status: SoftphoneStatus;
  phase: CallPhase;
  info: IncomingCallInfo | null;
  muted: boolean;
  /** Seconds since the call was answered. */
  seconds: number;
}

interface SoftphoneActions {
  answer: () => void;
  hangup: () => void;
  toggleMute: () => void;
}

const StateCtx = createContext<SoftphoneState | null>(null);
/**
 * Separate from state, and identity-stable, so a consumer that only needs the buttons
 * does not re-render on every tick of the call timer. Same split as ComposerContext.
 */
const ActionsCtx = createContext<SoftphoneActions | null>(null);

/** SSE reconnect ceiling, matching useInternalMessageStream. */
const MAX_BACKOFF_MS = 30_000;
/** An SSE event older than this belongs to a call that has already gone. */
const EVENT_STALE_MS = 60_000;

/**
 * Registers the browser as a phone the moment the app loads, and owns the in-call state.
 *
 * ── WHY THE POPUP IS DRIVEN BY SSE, NOT BY THE INVITE ──────────────────────────
 * Every browser registers the SAME shared SIP credential, so SignalWire rings all of
 * them for every call and the INVITE identifies nobody — its target is the credential.
 * The server separately pushes an `incoming-call` event to exactly the users who should
 * see it (the company's assigned user, or all admins when there is none). This provider
 * shows the overlay only when such an event has arrived.
 *
 * ── A NON-TARGET MUST IGNORE ITS INVITE, NEVER REJECT IT ───────────────────────
 * All those browsers receive the INVITE. Rejecting from one branch can tear down a
 * forked call that another branch was about to answer, so a browser with no matching
 * SSE event simply does nothing and lets its branch time out.
 *
 * Mounted from AppLayout so it survives every authenticated navigation — a call stays
 * up while the user browses to another company — and unmounts on logout, which
 * deregisters.
 */
export function SoftphoneProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();

  const [status, setStatus] = useState<SoftphoneStatus>('idle');
  const [phase, setPhase] = useState<CallPhase>('idle');
  const [info, setInfo] = useState<IncomingCallInfo | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const uaRef = useRef<UserAgent | null>(null);
  const regRef = useRef<Registerer | null>(null);
  const invitationRef = useRef<Invitation | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** The newest SSE event, waiting for (or already paired with) an INVITE. */
  const pendingRef = useRef<IncomingCallInfo | null>(null);

  // ── Media ─────────────────────────────────────────────────────────────────
  const attachRemoteAudio = useCallback((session: Session) => {
    const pc = (
      session.sessionDescriptionHandler as unknown as {
        peerConnection?: RTCPeerConnection;
      }
    )?.peerConnection;
    if (!pc || !audioRef.current) return;
    const remote = new MediaStream();
    pc.getReceivers().forEach((r) => r.track && remote.addTrack(r.track));
    audioRef.current.srcObject = remote;
    void audioRef.current.play().catch(() => undefined);
  }, []);

  const endCall = useCallback(() => {
    stopRinging();
    invitationRef.current = null;
    pendingRef.current = null;
    setPhase('idle');
    setInfo(null);
    setMuted(false);
    setSeconds(0);
    if (audioRef.current) audioRef.current.srcObject = null;
  }, []);

  // ── Incoming calls ────────────────────────────────────────────────────────
  const onInvite = useCallback(
    (invitation: Invitation) => {
      const pending = pendingRef.current;
      const fresh = pending && Date.now() - pending.at < EVENT_STALE_MS;

      // Not for us: no SSE event named this user. Do NOT reject — see the class
      // docblock. Leave the branch to time out so whoever IS the target can answer.
      if (!fresh) return;

      invitationRef.current = invitation;
      setInfo(pending);
      setPhase('ringing');
      startRinging();

      invitation.stateChange.addListener((state) => {
        if (state === SessionState.Established) {
          stopRinging();
          setPhase('active');
          setSeconds(0);
          attachRemoteAudio(invitation);
        }
        if (state === SessionState.Terminated) endCall();
      });
    },
    [attachRemoteAudio, endCall],
  );

  // Read the handler through a ref so a re-created callback never churns the UserAgent.
  const onInviteRef = useRef(onInvite);
  useEffect(() => {
    onInviteRef.current = onInvite;
  }, [onInvite]);

  // ── SIP registration, on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    void (async () => {
      let creds;
      try {
        creds = await fetchSipCredentials(token);
      } catch {
        // 503 means the server has no SIP config. That is a deployment state, not an
        // error worth retrying in a loop.
        if (!cancelled) setStatus('unavailable');
        return;
      }
      if (cancelled) return;
      setStatus('connecting');

      const uri = UserAgent.makeURI(`sip:${creds.username}@${creds.domain}`);
      if (!uri) {
        setStatus('failed');
        return;
      }

      const ua = new UserAgent({
        uri,
        authorizationUsername: creds.username,
        authorizationPassword: creds.password,
        transportOptions: { server: creds.wsServer },
        // Audio only: asking for video prompts for a camera and can fail negotiation
        // outright on a machine without one.
        sessionDescriptionHandlerFactoryOptions: {
          constraints: { audio: true, video: false },
        },
        logLevel: 'error',
        delegate: { onInvite: (inv) => onInviteRef.current(inv) },
      });
      uaRef.current = ua;

      try {
        await ua.start();
        const registerer = new Registerer(ua);
        regRef.current = registerer;
        registerer.stateChange.addListener((s) => {
          if (cancelled) return;
          if (s === RegistererState.Registered) setStatus('registered');
          else if (s === RegistererState.Unregistered) setStatus('failed');
        });
        await registerer.register();
      } catch {
        if (!cancelled) setStatus('failed');
      }
    })();

    return () => {
      cancelled = true;
      stopRinging();
      void regRef.current?.unregister().catch(() => undefined);
      void uaRef.current?.stop().catch(() => undefined);
      uaRef.current = null;
      regRef.current = null;
    };
  }, [token]);

  // ── SSE: which call belongs to whom ───────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retry = 0;
    let closed = false;

    const open = () => {
      if (closed) return;
      es = new EventSource(phoneEventsUrl(token));
      es.onopen = () => {
        retry = 0;
      };
      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data as string) as {
            type?: string;
          } & IncomingCallInfo;
          if (payload.type !== 'incoming-call') return; // ignores the 25s ping
          pendingRef.current = payload;
          // The INVITE may already be here (it usually arrives a beat later, but the
          // order is not guaranteed), in which case adopt it now.
          if (invitationRef.current && !info) {
            setInfo(payload);
            setPhase('ringing');
            startRinging();
          }
        } catch {
          /* malformed frame — ignore */
        }
      };
      es.onerror = () => {
        // A non-CLOSED readyState means the browser is already retrying on its own;
        // closing here would throw that away.
        if (es?.readyState !== EventSource.CLOSED) return;
        es.close();
        es = null;
        timer = setTimeout(
          open,
          Math.min(MAX_BACKOFF_MS, 1000 * 2 ** retry++) + Math.random() * 500,
        );
      };
    };

    open();
    return () => {
      closed = true;
      clearTimeout(timer);
      es?.close();
    };
  }, [token, info]);

  // ── Call timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active') return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const actions = useMemo<SoftphoneActions>(
    () => ({
      answer: () => {
        // Also the first reliable user gesture, which is what lets audio play at all.
        unlockAudio();
        stopRinging();
        void invitationRef.current
          ?.accept({
            sessionDescriptionHandlerOptions: {
              constraints: { audio: true, video: false },
            },
          })
          .catch(() => endCall());
      },
      hangup: () => {
        const inv = invitationRef.current;
        if (!inv) return endCall();
        // Before answering the correct rejection is a decline; after, a BYE.
        if (inv.state === SessionState.Established) {
          void inv.bye().catch(() => undefined);
        } else {
          void inv.reject().catch(() => undefined);
        }
        endCall();
      },
      toggleMute: () => {
        const pc = (
          invitationRef.current?.sessionDescriptionHandler as unknown as {
            peerConnection?: RTCPeerConnection;
          }
        )?.peerConnection;
        if (!pc) return;
        setMuted((prev) => {
          const next = !prev;
          pc.getSenders().forEach((s) => {
            if (s.track?.kind === 'audio') s.track.enabled = !next;
          });
          return next;
        });
      },
    }),
    [endCall],
  );

  const state = useMemo<SoftphoneState>(
    () => ({ status, phase, info, muted, seconds }),
    [status, phase, info, muted, seconds],
  );

  return (
    <ActionsCtx.Provider value={actions}>
      <StateCtx.Provider value={state}>
        {children}
        {/*
          The audio element lives HERE, not in the overlay, so audio survives the
          overlay re-rendering or being collapsed.
        */}
        <audio ref={audioRef} autoPlay />
        {/*
          Mount gated on call state ONLY, never on the route — gating on anything
          route-derived would unmount a live call on navigation.
        */}
        {phase !== 'idle'
          ? createPortal(<CallOverlay />, document.body)
          : null}
      </StateCtx.Provider>
    </ActionsCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSoftphone(): SoftphoneState {
  const ctx = useContext(StateCtx);
  if (!ctx) throw new Error('useSoftphone must be used within a SoftphoneProvider');
  return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSoftphoneActions(): SoftphoneActions {
  const ctx = useContext(ActionsCtx);
  if (!ctx) {
    throw new Error('useSoftphoneActions must be used within a SoftphoneProvider');
  }
  return ctx;
}
