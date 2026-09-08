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
import {
  fetchHoldAudio,
  fetchPendingCall,
  fetchSipCredentials,
  phoneAudioUrl,
  phoneEventsUrl,
  setCallHold,
  transferCallBlind,
} from '@/api/phone';
import { transferInternalCallBlind } from '@/api/internalCalls';
import { startHoldMusic, type HoldMusic } from '@/lib/hold-music';
import { startRinging, stopRinging, unlockAudio } from '@/lib/notificationSound';
import { CallOverlay } from '@/components/Phone/CallOverlay';

/**
 * The outgoing audio sender on a live call, or undefined.
 *
 * sip.js does not expose the RTCPeerConnection in its types, so this cast is the same
 * one toggleMute has always used. Kept in one place now that two features need it.
 */
function audioSenderOf(session: Session | null): RTCRtpSender | undefined {
  const pc = (
    session?.sessionDescriptionHandler as unknown as {
      peerConnection?: RTCPeerConnection;
    }
  )?.peerConnection;
  return pc?.getSenders().find((sender) => sender.track?.kind === 'audio');
}

/**
 * The X-Cyg-Call marker on an INVITE, or null.
 *
 * sip.js exposes the raw INVITE as `invitation.request`, and SignalWire delivers the
 * `?X-Cyg-Call=…` parameter we put on the <Sip> noun as a SIP header of that name.
 */
function markerOf(invitation: Invitation): string | null {
  try {
    return invitation.request.getHeader('X-Cyg-Call') ?? null;
  } catch {
    // Never let header parsing break call pairing — a missing marker just means this
    // INVITE is treated as an ordinary (company) leg.
    return null;
  }
}

/** Where the SIP registration currently stands. Surfaced so it is never a mystery. */
export type SoftphoneStatus =
  | 'idle'
  | 'connecting'
  | 'registered'
  | 'unavailable'
  | 'failed';

/**
 * What the server tells us about a call the INVITE cannot.
 *
 * Covers both directions. A call PLACED from the app arrives here as an ordinary
 * INVITE too: click-to-call asks SignalWire to ring the shared SIP credential first
 * and only then dials the customer, so the INVITE alone cannot say whether the user
 * is being called or is placing a call. `direction` is what separates them.
 */
export interface IncomingCallInfo {
  companyId: number;
  companyName: string;
  from: string;
  /** The number being dialled. Outbound only. */
  to?: string;
  /** Absent on an event from an older build — treated as inbound. */
  direction?: 'inbound' | 'outbound';
  callSid: string;
  at: number;
  /**
   * INTERNAL (staff-to-staff) calls only: the X-Cyg-Call header expected on OUR leg.
   *
   * An internal call has two legs, and both fork to every registered browser because
   * every browser shares one SIP credential. Absent on company calls, which have one
   * leg per browser and need no marker. See markerOf().
   */
  token?: string;
  /**
   * Which family of call this is, so the client knows which API to act on.
   *
   * `token != null` is NOT a usable discriminator: an internal CALLER's own event
   * carries no token, so it looks identical to a company call. Absent on events from an
   * older server build, which are company calls.
   */
  kind?: 'company' | 'internal';
  /**
   * Set only when this ring is the result of a TRANSFER: who handed the call over.
   *
   * Rendered as an extra line so the person taking over sees the client's number AND
   * that a colleague passed it to them. Absent on every ordinary call, which is what
   * keeps their card byte-identical to before.
   */
  transferFrom?: { id: number; name: string };
}

export type CallPhase = 'idle' | 'ringing' | 'active';

interface SoftphoneState {
  status: SoftphoneStatus;
  phase: CallPhase;
  info: IncomingCallInfo | null;
  muted: boolean;
  /**
   * The caller is on hold and hearing music (or silence, if none is configured).
   *
   * Deliberately NOT a CallPhase value: phase drives tryPair and the overlay portal,
   * and widening it would put call pairing at risk for what is really a display state.
   * Hold is orthogonal to the call machine, exactly like muted.
   */
  held: boolean;
  /** Seconds since the call was answered. */
  seconds: number;
  /**
   * This browser is holding a live INVITE it has not been told to display.
   *
   * True on every registered browser during a ring it is not the target of, because all
   * of them share one SIP credential. It is what lets the Communications tab offer
   * "Answer" to an admin: without a held invitation there is nothing to accept, however
   * much the server knows about the call.
   */
  hasHeldInvite: boolean;
}

interface SoftphoneActions {
  answer: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  /**
   * Answer the held INVITE as the given call.
   *
   * Goes through the normal pairing path rather than calling `accept()` directly: it is
   * pairing that sets `info` and `phase`, and therefore that raises the floating overlay
   * which follows the user across every page for the rest of the call. A bare `accept()`
   * would connect the audio and leave `phase` at 'idle' — a live call with no UI
   * anywhere and no way to hang it up.
   */
  answerHeld: (info: IncomingCallInfo) => void;
  /**
   * Hand the live call to a colleague and drop out.
   *
   * Rejects rather than swallowing, so the picker can show why it failed — a transfer
   * that silently did nothing leaves the agent believing the client was handed over.
   *
   * The local leg is NOT torn down here: the server redirects the other party, which
   * ends the bridge, and our own session then terminates on its own and runs `endCall`
   * through the existing Terminated listener. Hanging up here first would tear the
   * bridge down before the redirect landed and drop the caller into voicemail.
   */
  blindTransfer: (targetUserId: number) => Promise<void>;
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
 * How long an INVITE waits for its SSE event before being ignored.
 *
 * Distinct from EVENT_STALE_MS: that discards events from a finished call, this decides
 * how long the two halves may arrive apart. Generous, because being late costs a held
 * reference while being early costs a missed call.
 */
/**
 * Just past the `<Dial timeout="30">` the inbound webhook sends.
 *
 * It was 6s, which was enough for the routed target — their pending event arrives within
 * about a second. But it also threw away the ONLY reference to the invitation five
 * seconds into a thirty-second ring, so an admin who opened the ringing company at
 * second 10 had nothing left to answer with even though the SIP branch was still live.
 * Holding it for the whole ring is what makes answering from the tab possible; the
 * `Terminated` listener attached in `onInvite` is what keeps that safe.
 */
const PAIR_WINDOW_MS = 33_000;

const log = (...args: unknown[]) => console.log('[softphone]', ...args);

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
  const [held, setHeld] = useState(false);
  /** The real microphone track, parked here while hold music takes its place. */
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const holdMusicRef = useRef<HoldMusic | null>(null);
  /** Guards a double-click: two swaps in flight would fight over one sender. */
  const holdBusyRef = useRef(false);
  const [seconds, setSeconds] = useState(0);
  // Mirrors `unpairedRef` into render, so the tab can offer Answer only when there is
  // genuinely something to answer.
  const [hasHeldInvite, setHasHeldInvite] = useState(false);

  const uaRef = useRef<UserAgent | null>(null);
  const regRef = useRef<Registerer | null>(null);
  const invitationRef = useRef<Invitation | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** The newest SSE event, waiting for (or already paired with) an INVITE. */
  const pendingRef = useRef<IncomingCallInfo | null>(null);
  /** An INVITE that has arrived but has no matching event YET. */
  const unpairedRef = useRef<Invitation | null>(null);
  const unpairedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  /** Read from callbacks without making them depend on it. */
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  /** Current phase, readable from callbacks without making them a dependency. */
  const phaseRef = useRef<CallPhase>('idle');
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

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

  /**
   * Put the microphone back and tear the music down.
   *
   * Called by resume AND by endCall: hanging up while still held must not leave a live
   * microphone track or an open AudioContext behind. Browsers cap how many contexts a
   * page may have, and a track left running keeps the tab’s recording indicator lit.
   */
  const teardownHold = useCallback((sender?: RTCRtpSender) => {
    const mic = micTrackRef.current;
    if (mic) {
      // Re-enabled because a silent hold disables the track in place rather than
      // replacing it; a no-op when music was used.
      mic.enabled = true;
      if (sender) void sender.replaceTrack(mic).catch(() => undefined);
    }
    micTrackRef.current = null;
    holdMusicRef.current?.stop();
    holdMusicRef.current = null;
    if (audioRef.current) audioRef.current.muted = false;
  }, []);

  const endCall = useCallback(() => {
    stopRinging();
    teardownHold(audioSenderOf(invitationRef.current));
    setHeld(false);
    holdBusyRef.current = false;
    clearTimeout(unpairedTimerRef.current);
    unpairedRef.current = null;
    setHasHeldInvite(false);
    invitationRef.current = null;
    pendingRef.current = null;
    setPhase('idle');
    setInfo(null);
    setMuted(false);
    setSeconds(0);
    if (audioRef.current) audioRef.current.srcObject = null;
  }, [teardownHold]);

  // ── Incoming calls ────────────────────────────────────────────────────────
  /**
   * Shows the call once BOTH halves are in hand, whichever order they arrived in.
   *
   * A call needs two independent signals: the INVITE (the media, which every browser
   * gets because they all share one SIP credential) and the SSE event (which company,
   * and whether this user is a target). Nothing guarantees their order — the server
   * pushes the event before returning the LaML, but they travel different connections.
   *
   * The previous version only handled event-then-INVITE and dropped the invitation
   * outright in the other order, so the call rang for 30 seconds with no popup.
   * Both callers now funnel through here.
   */
  const tryPair = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    const invitation = unpairedRef.current;
    const pending = pendingRef.current;
    if (!invitation || !pending) return;
    if (Date.now() - pending.at > EVENT_STALE_MS) return;

    // ── WHICH LEG IS THIS? ────────────────────────────────────────────────────────
    // An internal call rings the shared SIP address TWICE — once to reach the caller,
    // once to reach the callee — and every registered browser receives both. Nothing
    // else here distinguishes them: this function pairs whatever INVITE it is holding
    // with whatever event it has, and never matches on call sid.
    //
    // So without this the callee can answer the CALLER's own leg, and whether it
    // happens depends on arrival timing — it would pass a first test and fail later.
    // The callee's event carries the token that its leg's header must match; the
    // caller's event carries none, so it pairs only an unmarked INVITE.
    //
    // Company calls have neither, so `null === null` and this is a no-op for them.
    if ((pending.token ?? null) !== markerOf(invitation)) return;

    clearTimeout(unpairedTimerRef.current);
    unpairedRef.current = null;
    setHasHeldInvite(false);
    invitationRef.current = invitation;
    log('paired call', pending.companyName, pending.from);

    setInfo(pending);
    setPhase('ringing');

    if (pending.direction === 'outbound') {
      // The user already clicked "Call"; making them then click "Answer" to reach the
      // person THEY dialled would be absurd. Accept immediately and let the overlay
      // read "Calling…" until the far end picks up.
      void invitation
        .accept({
          sessionDescriptionHandlerOptions: {
            constraints: { audio: true, video: false },
          },
        })
        .catch(() => endCall());
    } else {
      startRinging();
    }

    invitation.stateChange.addListener((state) => {
      if (state === SessionState.Established) {
        stopRinging();
        setPhase('active');
        setSeconds(0);
        attachRemoteAudio(invitation);
      }
      if (state === SessionState.Terminated) endCall();
    });
  }, [attachRemoteAudio, endCall]);

  const onInvite = useCallback(
    (invitation: Invitation) => {
      log('INVITE received');
      // ALWAYS hold it, even with no context yet — it may still be on its way, and for
      // a whole company's worth of admins it never will: the call is somebody else's to
      // be shown, but any of them may still pick it up from that company's tab.
      unpairedRef.current = invitation;
      setHasHeldInvite(true);
      clearTimeout(unpairedTimerRef.current);
      unpairedTimerRef.current = setTimeout(() => {
        if (unpairedRef.current !== invitation) return;
        // The ring is over. Release it and do NOTHING: a reject on one forked branch can
        // tear down a call another branch is about to answer. Ignoring lets ours simply
        // time out.
        unpairedRef.current = null;
        setHasHeldInvite(false);
        log('INVITE released unpaired — ring window elapsed');
      }, PAIR_WINDOW_MS);

      // Attached HERE, not only in tryPair. An unpaired invitation used to carry no
      // listener at all, which was survivable while it was dropped after 6s. Now that it
      // is held for the full ring, this is what notices SignalWire CANCELling our branch
      // when another browser answers — without it the tab would keep offering "Answer"
      // for a call that is already gone. Terminated is idempotent with the listener
      // tryPair adds: whichever fires, `endCall` resets the same state.
      invitation.stateChange.addListener((state) => {
        if (state !== SessionState.Terminated) return;
        if (unpairedRef.current === invitation) {
          unpairedRef.current = null;
          setHasHeldInvite(false);
          log('held INVITE terminated — answered elsewhere or rang out');
        }
      });

      // Try the push first (instant where SSE works), then ASK.
      tryPair();

      // The reliable path. A TLS-intercepting content filter on some networks buffers
      // streaming responses until they complete, so SSE never delivers there while
      // ordinary requests are fine. Poll briefly: the webhook records the pending call
      // before returning its LaML, but the INVITE can still beat our request.
      const tok = tokenRef.current;
      if (!tok) return;
      let attempt = 0;
      const ask = () => {
        if (unpairedRef.current !== invitation) return; // paired or released already
        void fetchPendingCall(tok)
          .then((call) => {
            if (!call || unpairedRef.current !== invitation) return;
            log('pending-call fetched', call.companyName, call.from);
            pendingRef.current = call;
            tryPair();
          })
          .finally(() => {
            if (++attempt < 4 && unpairedRef.current === invitation) {
              setTimeout(ask, 400);
            }
          });
      };
      ask();
    },
    [tryPair],
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
          // Both directions arrive on this stream; anything else (the 25s ping) is
          // not a call.
          if (
            payload.type !== 'incoming-call' &&
            payload.type !== 'outgoing-call'
          ) {
            return;
          }
          log('SSE', payload.type, payload.companyName, payload.from);
          pendingRef.current = payload;
          // The INVITE may already be waiting; tryPair handles either order.
          tryPair();
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
    // `token` ONLY. Including call state here tore the stream down and reopened it on
    // every change — visible in nginx as a run of `GET /api/phone/events … 200 6`.
    // The stream must live as long as the session, like useInternalMessageStream.
  }, [token, tryPair]);

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
      blindTransfer: async (targetUserId: number) => {
        const call = pendingRef.current;
        if (!token || !call) throw new Error('No call to transfer');
        if (call.kind === 'internal') {
          await transferInternalCallBlind(token, call.callSid, targetUserId);
        } else {
          await transferCallBlind(
            token,
            call.companyId,
            call.callSid,
            targetUserId,
          );
        }
        // Deliberately no endCall() here. SignalWire tears the bridge down as a result
        // of the redirect, our session goes Terminated, and the existing listener does
        // the teardown — one path out of a call instead of two that can disagree.
      },
      answerHeld: (call: IncomingCallInfo) => {
        // Unlock audio on this click, while it is still a real user gesture.
        unlockAudio();
        // Feed the pairing path rather than accepting directly: pairing is what sets
        // `info` and `phase`, and therefore what raises the overlay that follows the
        // user for the rest of the call. `at` is refreshed so the staleness guard in
        // tryPair cannot reject a call the user is deliberately picking up.
        pendingRef.current = { ...call, at: Date.now(), direction: 'inbound' };
        tryPair();
        // Pairing an inbound call starts the ringtone and waits for Answer. The user
        // just pressed Answer, so silence it in the same tick — before accept, or the
        // oscillator gets a moment to sound.
        stopRinging();
        void invitationRef.current
          ?.accept({
            sessionDescriptionHandlerOptions: {
              constraints: { audio: true, video: false },
            },
          })
          .catch(() => endCall());
      },
      toggleMute: () => {
        const sender = audioSenderOf(invitationRef.current);
        if (!sender) return;
        setMuted((prev) => {
          const next = !prev;
          // While held, the sender carries the music track — muting must still apply to
          // the microphone, so it is parked in micTrackRef and toggled there instead.
          const track = micTrackRef.current ?? sender.track;
          if (track) track.enabled = !next;
          return next;
        });
      },

      /**
       * Put the caller on hold, or take them off it.
       *
       * Swaps the microphone for a looping music track on the outgoing stream. The far
       * end hears music; the agent hears nothing, because the remote audio element is
       * muted locally for the duration.
       *
       * ORDER IS LOAD-BEARING. The recording is paused BEFORE the music starts and
       * resumed AFTER it stops — the opposite order records a slice of music at each
       * boundary, which is the whole defect the pause exists to prevent.
       *
       * With no track configured this is simply a silent hold, which is also what
       * happens if the music fails to build. Hold must never fail outright: the caller
       * is on a live call and the agent has already stopped talking to them.
       */
      toggleHold: () => {
        if (holdBusyRef.current) return;
        const sender = audioSenderOf(invitationRef.current);
        const call = pendingRef.current;
        if (!sender) return;
        holdBusyRef.current = true;

        void (async () => {
          try {
            if (holdMusicRef.current || micTrackRef.current) {
              // ── Resume ──
              teardownHold(sender);
              setHeld(false);
              if (token && call) {
                await setCallHold(token, call.companyId, call.callSid, false);
              }
              return;
            }

            // ── Hold ──
            if (token && call) {
              await setCallHold(token, call.companyId, call.callSid, true);
            }

            micTrackRef.current = sender.track ?? null;
            if (audioRef.current) audioRef.current.muted = true;

            let music: HoldMusic | null = null;
            if (token && call) {
              try {
                const { audioId } = await fetchHoldAudio(token, call.companyId);
                if (audioId !== null) {
                  music = await startHoldMusic(phoneAudioUrl(token, audioId));
                }
              } catch {
                /* fall through to a silent hold */
              }
            }

            if (music) {
              holdMusicRef.current = music;
              await sender.replaceTrack(music.track).catch(() => undefined);
            } else if (sender.track) {
              // Silent hold. The track is disabled rather than replaced, and
              // micTrackRef still holds it so resume and mute both behave.
              sender.track.enabled = false;
            }
            setHeld(true);
          } finally {
            holdBusyRef.current = false;
          }
        })();
      },
    }),
    [endCall, teardownHold, token, tryPair],
  );

  const state = useMemo<SoftphoneState>(
    () => ({ status, phase, info, muted, held, seconds, hasHeldInvite }),
    [status, phase, info, muted, held, seconds, hasHeldInvite],
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
