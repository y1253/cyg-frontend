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
  fetchTransferStatus,
  addCallToConference,
  setConferenceHold,
  swapConference,
  mergeConference,
  dropConferenceParty,
  fetchConferenceStatus,
  type AddCallTarget,
  type ConferenceStatus,
  type TransferState,
} from '@/api/phone';
import {
  fetchInternalTransferStatus,
  transferInternalCallBlind,
  addToInternalConference,
  setInternalConferenceHold,
  swapInternalConference,
  mergeInternalConference,
  dropInternalConferenceParty,
  fetchInternalConferenceStatus,
} from '@/api/internalCalls';
import { startHoldMusic, type HoldMusic } from '@/lib/hold-music';
import { startRinging, stopRinging, unlockAudio } from '@/lib/notificationSound';
import { isDtmfKey } from '@/lib/dtmf';
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
  /**
   * The saved contact's name for `from`, when this company has one. INBOUND only —
   * an outbound call's other party is `to`, which no contact lookup covers.
   *
   * Absent on an event from an older build, and absent whenever nobody has saved the
   * caller, which is most calls. The card falls back to formatting `from`.
   */
  fromName?: string;
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

/**
 * `'transferring'` is the agent's own state after handing a call over, while the
 * colleague's phone rings.
 *
 * It is a real phase rather than a flag beside `'idle'` because it has to do the work of
 * a phase: `tryPair` bails on anything but `'idle'` and the in-tab ringing banner is
 * gated on `'idle'` too, so being in this phase is single-handedly what stops the
 * transferring browser being rung by the very call it just gave away. (Every browser
 * shares one SIP credential, so the transfer `<Dial><Sip>` forks an INVITE back to it.)
 */
export type CallPhase = 'idle' | 'ringing' | 'active' | 'transferring';

/** What the transferring agent's card is showing. */
export interface TransferView {
  target: { id: number; name: string };
  state: TransferState;
  /** The leg that was handed over. Used to re-pair on take-back. */
  transferredSid: string;
}

interface SoftphoneState {
  status: SoftphoneStatus;
  phase: CallPhase;
  info: IncomingCallInfo | null;
  /**
   * More than two people on this call, once somebody has been added.
   *
   * ⚠️ A FIELD beside `phase`, deliberately NOT a new CallPhase value — the same rule
   * `held` states below. `phase` drives tryPair's `!== 'idle'` guard, the overlay portal,
   * the call timer and sendDigit's `=== 'active'` check; a fifth value would have to be
   * added to each of those and every omission is a silent bug. A conference is an
   * ordinary active call that happens to have more people in it.
   */
  conference: ConferenceStatus | null;
  /** Non-null exactly while `phase === 'transferring'`. */
  transfer: TransferView | null;
  /**
   * The transfer can still be pulled back: the colleague has not answered AND this
   * browser is still holding its fork of the transfer `<Dial>`.
   */
  canTakeBack: boolean;
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
   * ends the bridge, and our own session then terminates on its own. Hanging up here
   * first would tear the bridge down before the redirect landed and drop the caller into
   * voicemail.
   *
   * ⚠️ The phase moves to `'transferring'` BEFORE the request, not after it. The BYE and
   * the transfer INVITE both travel the already-open SIP WebSocket while the browser is
   * still awaiting this HTTP response, so setting it afterwards is reliably too late:
   * the Terminated listener would run a full `endCall()`, throw the INVITE away, and
   * unmount the overlay (and the picker inside it) mid-`await`. Rolled back to
   * `'active'` if the request rejects.
   */
  blindTransfer: (targetUserId: number) => Promise<void>;
  /**
   * Pull a transfer back before the colleague picks up.
   *
   * No second redirect and no new endpoint: this browser is one of the forks of the
   * transfer `<Dial><Sip>`, so it is already holding an answerable INVITE for the very
   * call it handed over. Accepting it wins the fork and SignalWire cancels the
   * colleague's branch.
   */
  takeBack: () => void;
  /**
   * Press a key on the far end — an IVR menu, an extension.
   *
   * Returns whether the digit could be sent, and the pad SHOWS a failure. Swallowing it
   * would be the defect `blindTransfer` above warns about in its own words: an agent who
   * believes they pressed 1 and is waiting for a menu that never comes has no way to tell
   * that from an IVR being slow.
   */
  sendDigit: (digit: string) => boolean;
  /**
   * Bring one more person onto the call.
   *
   * Whoever is already on it is put on hold first, exactly as a phone does — that
   * happens server-side, in one request, so a failure cannot leave a stranger listening
   * to a client who was never parked.
   *
   * Rejects rather than swallowing, like `blindTransfer` and unlike `setCallHold`.
   *
   * ⚠️ No optimistic phase change, unlike `blindTransfer`: nothing here tears the SIP
   * session down. The agent's own leg is redirected in place and keeps its dialog, so
   * the only visible change is a re-INVITE for the new media — which the stateChange
   * listener ignores, since it acts only on Established and Terminated.
   */
  addCall: (target: AddCallTarget) => Promise<void>;
  /** Park or un-park one person. `partyId` is the server's opaque id, never a sid. */
  holdParty: (partyId: string, held: boolean) => Promise<void>;
  /** Talk to the other one. Only offered with exactly two people on the call. */
  swapParties: () => Promise<void>;
  /** Everybody hears everybody. */
  mergeParties: () => Promise<void>;
  /** Remove one person; the call continues with whoever is left. */
  dropParty: (partyId: string) => Promise<void>;
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

/** How often the transferring agent's card asks whether the colleague picked up. */
const TRANSFER_POLL_MS = 3_000;

/**
 * How often the conference card re-reads its party list.
 *
 * Slower than the transfer poll: each tick costs the server a `listParticipants` plus a
 * `getCall` for anybody still ringing, and unlike a transfer there is no deadline to
 * race — nothing here resolves on its own.
 */
const CONFERENCE_POLL_MS = 4_000;
/**
 * How long the card lingers on its final wording before clearing itself.
 *
 * Long enough to read "David Levy picked up" and know the hand-off worked; short enough
 * that it is not sitting on the screen when the next call arrives.
 */
const TRANSFER_SETTLE_MS = 2_500;
/**
 * Backstop, just past PAIR_WINDOW_MS on purpose.
 *
 * At 33s the held fork is released, so take-back is gone and the card can no longer do
 * anything for the agent. Outliving that would leave a card that only pretends to offer
 * a choice.
 */
const TRANSFER_MAX_MS = 35_000;

/**
 * How long each DTMF tone is held, and the silence between two of them.
 *
 * The browser defaults (100ms / 70ms) are at the low end of what an older IVR detects
 * reliably, and they also set how long a queued digit can be overwritten for — see
 * `sendDigit`. 160ms matches the `Duration=160` that sip.js's own SIP INFO idiom sends.
 * The local feedback tone is played for the same length, or the echo stops meaning what
 * it looks like it means.
 */
const DTMF_DURATION_MS = 160;
const DTMF_GAP_MS = 80;

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
  const [phase, setPhaseState] = useState<CallPhase>('idle');
  const [info, setInfoState] = useState<IncomingCallInfo | null>(null);
  const [transfer, setTransfer] = useState<TransferView | null>(null);
  const [conference, setConference] = useState<ConferenceStatus | null>(
    null,
  );
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
  /**
   * The fork of OUR OWN transfer's `<Dial><Sip>`, claimed once and never overwritten.
   *
   * Take-back cannot use `unpairedRef`: `onInvite` overwrites that unconditionally, so
   * any unrelated inbound call arriving during the thirty-second transfer ring would
   * replace it — and "Take it back" would then answer a stranger while labelling them
   * with the transferred call's caller and company. Whether that happened would depend
   * on timing, which is the worst way to find out.
   */
  const transferInviteRef = useRef<Invitation | null>(null);
  const transferTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  /** Read from callbacks without making them depend on it. */
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  /**
   * Current phase, readable from callbacks without making them a dependency.
   *
   * ⚠️ Written by `setPhase` below, NOT by an effect. It used to lag one render behind,
   * which is invisible until something sets the phase and then immediately calls
   * something guarded on the ref in the same tick — take-back does exactly that, and
   * would have been a silent no-op.
   */
  const phaseRef = useRef<CallPhase>('idle');
  const setPhase = useCallback((next: CallPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  /** The PAIRED call. See `infoRef` below for why this is not `pendingRef`. */
  const infoRef = useRef<IncomingCallInfo | null>(null);
  const setInfo = useCallback((next: IncomingCallInfo | null) => {
    infoRef.current = next;
    setInfoState(next);
  }, []);

  const transferRef = useRef<TransferView | null>(null);
  const setTransferBoth = useCallback((next: TransferView | null) => {
    transferRef.current = next;
    setTransfer(next);
  }, []);

  /**
   * Mirrored to a ref for the same reason as `transfer`: the poll below and the actions
   * read it from callbacks that would otherwise close over a stale render.
   */
  const conferenceRef = useRef<ConferenceStatus | null>(null);
  const setConferenceBoth = useCallback((next: ConferenceStatus | null) => {
    conferenceRef.current = next;
    setConference(next);
  }, []);

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

  /**
   * Give up the MEDIA — microphone, hold music, remote audio, the session itself — while
   * leaving the held invitations alone.
   *
   * Split out of `endCall` for one caller: a transfer. When the agent hands a call over,
   * their own leg is hung up by the server and the session terminates, but the browser
   * must keep holding its fork of the transfer `<Dial>` or "Take it back" has nothing to
   * accept. Every other exit still wants the full reset.
   *
   * ⚠️ `teardownHold` reads `invitationRef.current` for its sender, so it must run BEFORE
   * that ref is cleared or the microphone track leaks and the tab keeps its recording
   * indicator lit.
   */
  const releaseMedia = useCallback(() => {
    stopRinging();
    teardownHold(audioSenderOf(invitationRef.current));
    setHeld(false);
    holdBusyRef.current = false;
    invitationRef.current = null;
    pendingRef.current = null;
    setMuted(false);
    setSeconds(0);
    if (audioRef.current) audioRef.current.srcObject = null;
  }, [teardownHold]);

  const endCall = useCallback(() => {
    releaseMedia();
    clearTimeout(unpairedTimerRef.current);
    clearTimeout(transferTimerRef.current);
    unpairedRef.current = null;
    transferInviteRef.current = null;
    setHasHeldInvite(false);
    setPhase('idle');
    setInfo(null);
    setTransferBoth(null);
    setConferenceBoth(null);
  }, [releaseMedia, setInfo, setPhase, setTransferBoth, setConferenceBoth]);

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
      if (state === SessionState.Terminated) {
        // The one place the two teardowns differ. During a transfer this BYE is the
        // server hanging up our leg on purpose; the card must stay up and the held
        // fork must survive, so only the media goes.
        if (phaseRef.current === 'transferring') releaseMedia();
        else endCall();
      }
    });
  }, [attachRemoteAudio, endCall, releaseMedia, setInfo, setPhase]);

  const onInvite = useCallback(
    (invitation: Invitation) => {
      log('INVITE received');

      // Claimed ONCE. While a transfer of ours is ringing, the first INVITE to arrive is
      // its fork coming back to us — every browser shares one SIP credential — and it is
      // the handle "Take it back" accepts. `unpairedRef` below is overwritten by every
      // later INVITE, so it cannot serve: an unrelated call arriving mid-ring would make
      // take-back answer a stranger under the transferred call's name.
      if (phaseRef.current === 'transferring' && !transferInviteRef.current) {
        transferInviteRef.current = invitation;
        setHasHeldInvite(true);
        invitation.stateChange.addListener((state) => {
          if (state !== SessionState.Terminated) return;
          if (transferInviteRef.current !== invitation) return;
          // SignalWire cancelled our branch: the colleague answered, or it rang out.
          transferInviteRef.current = null;
          setHasHeldInvite(false);
        });
        return;
      }

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

  // ── "Has my colleague picked up yet?" ─────────────────────────────────────
  /**
   * A bare interval rather than a TanStack query, even though the provider sits inside
   * QueryClientProvider. This feeds a state MACHINE — the card's wording, then `endCall`
   * — not a render-time cache read, and the app-wide `retry` plus refetch-on-focus would
   * turn one terminal answer into several `endCall()`s. Every other timer in this file
   * is a bare interval for the same reason.
   */
  useEffect(() => {
    if (phase !== 'transferring') return;
    const tok = tokenRef.current;
    const call = infoRef.current;
    if (!tok || !call) return;

    let stopped = false;
    const settle = (next: TransferState) => {
      if (stopped) return;
      stopped = true;
      setTransferBoth(
        transferRef.current ? { ...transferRef.current, state: next } : null,
      );
      // The server's agent-leg hangup is best-effort and swallowed. When it failed,
      // no BYE ever arrives and this session would linger until the media times out,
      // so it is closed explicitly rather than waiting on a listener that may not fire.
      const inv = invitationRef.current;
      if (inv && inv.state === SessionState.Established) {
        void inv.bye().catch(() => undefined);
      }
      transferTimerRef.current = setTimeout(endCall, TRANSFER_SETTLE_MS);
    };

    const tick = () => {
      const view = transferRef.current;
      if (stopped || !view) return;
      const ask =
        call.kind === 'internal'
          ? fetchInternalTransferStatus(tok, call.callSid)
          : fetchTransferStatus(tok, call.companyId, call.callSid);
      void ask
        .then(({ state }) => {
          if (stopped || transferRef.current !== view) return;
          if (state === 'ringing') return;
          settle(state);
        })
        .catch(() => undefined);
    };

    const id = setInterval(tick, TRANSFER_POLL_MS);
    tick();
    // The backstop, capped just past PAIR_WINDOW_MS: once the held fork is released
    // there is nothing left to take back and the card has nothing useful left to say.
    const giveUp = setTimeout(() => settle('ended'), TRANSFER_MAX_MS);
    return () => {
      stopped = true;
      clearInterval(id);
      clearTimeout(giveUp);
    };
  }, [phase, endCall, setTransferBoth]);

  // ── Conference ────────────────────────────────────────────────────────────

  /**
   * Keep the party list honest while a conference is live.
   *
   * A bare `setInterval` rather than TanStack, for the reason the transfer poll above
   * gives in its own words: this feeds a state machine, not a render-time cache read,
   * and the app-wide retry plus refetch-on-focus would turn one answer into several.
   *
   * ⚠️ NO equivalent of TRANSFER_MAX_MS. A transfer resolves in seconds so a backstop is
   * a safety net; a conference legitimately runs for an hour, and giving up on one would
   * blank the controls out from under a call that is still going.
   *
   * An inactive answer clears the card and NOTHING else — `endCall` stays owned by the
   * SIP Terminated listener, which is the only thing that actually knows the call ended.
   */
  useEffect(() => {
    if (!conference || !token) return;
    let stopped = false;

    const tick = () => {
      const call = infoRef.current;
      if (!call) return;
      const fetching =
        call.kind === 'internal'
          ? fetchInternalConferenceStatus(token, call.callSid)
          : fetchConferenceStatus(token, call.companyId, call.callSid);

      void fetching
        .then((view) => {
          if (stopped) return;
          setConferenceBoth(view.active ? view : null);
        })
        // A blip must not blank a live call's controls; the next tick re-asks.
        .catch(() => undefined);
    };

    const id = setInterval(tick, CONFERENCE_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [conference, token, setConferenceBoth]);


  /**
   * Run one conference operation against whichever API this call belongs to.
   *
   * Company and internal calls have separate endpoints because they have separate
   * authorization primitives (`assertMayUseCompanyPhone` + `assertCallBelongsTo` versus
   * `assertParticipant`), and unifying them server-side would weaken one. This is the
   * single place the client picks between them.
   *
   * ⚠️ Reads `infoRef`, never `pendingRef`. During an add, this browser is guaranteed to
   * receive an unrelated INVITE and to poll `/pending-call` — `pendingRef` holds the
   * newest event SEEN, which is not necessarily the call we are on. That is the exact
   * bug `blindTransfer` and `toggleHold` already carry warnings about.
   *
   * Every operation returns the new view, so the card updates without waiting for the
   * next poll.
   */
  const runConference = useCallback(
    async (
      op: (call: IncomingCallInfo, internal: boolean) => Promise<ConferenceStatus>,
    ): Promise<void> => {
      const call = infoRef.current;
      if (!call || !token) return;
      const view = await op(call, call.kind === 'internal');
      setConferenceBoth(view.active ? view : null);
    },
    [token, setConferenceBoth],
  );

  /**
   * Park everybody who is not already parked.
   *
   * Sequential rather than `Promise.all`: these are writes against one conference, and a
   * failure half way through should stop rather than race the rest. The last answer is
   * the one returned, which is the fully-applied view.
   */
  const holdAllParties = useCallback(
    async (call: IncomingCallInfo, internal: boolean) => {
      const parties = conferenceRef.current?.parties ?? [];
      let view = conferenceRef.current!;
      for (const party of parties) {
        if (party.state === 'held' || party.state === 'gone') continue;
        view = internal
          ? await setInternalConferenceHold(token!, call.callSid, party.id, true)
          : await setConferenceHold(
              token!,
              call.companyId,
              call.callSid,
              party.id,
              true,
            );
      }
      return view;
    },
    [token],
  );

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
        // `infoRef`, NOT `pendingRef`. `pendingRef` is overwritten by every SSE frame and
        // every /pending-call response, including ones for a call this browser is not on
        // — so a ring for another company arriving mid-call would make this POST against
        // that company's id and sid. `info` is the call we are actually paired with.
        const call = infoRef.current;
        if (!token || !call) throw new Error('No call to transfer');

        // Optimistic, and it has to be: the BYE and the transfer fork travel the
        // already-open SIP WebSocket while this request is still in flight, so a phase
        // set after the await is reliably too late.
        const previous = phaseRef.current;
        setPhase('transferring');
        try {
          const result =
            call.kind === 'internal'
              ? await transferInternalCallBlind(
                  token,
                  call.callSid,
                  targetUserId,
                )
              : await transferCallBlind(
                  token,
                  call.companyId,
                  call.callSid,
                  targetUserId,
                );
          setTransferBoth({
            target: result.target,
            state: 'ringing',
            transferredSid: result.transferredSid,
          });
        } catch (err) {
          setPhase(previous);
          throw err;
        }
        // Deliberately no endCall() here. SignalWire tears the bridge down as a result
        // of the redirect, our session goes Terminated, and `releaseMedia` runs through
        // the existing listener. The card is closed by the status poll instead.
      },
      takeBack: () => {
        const invitation = transferInviteRef.current;
        const call = infoRef.current;
        const view = transferRef.current;
        if (!invitation || !call || !view) return;

        // The first real user gesture since the transfer, so audio can play again.
        unlockAudio();
        clearTimeout(transferTimerRef.current);
        transferInviteRef.current = null;
        setHasHeldInvite(false);
        setTransferBoth(null);

        // Re-pair through the normal path so `info` and `phase` are set by the same code
        // that sets them for every other call. `callSid` becomes the transferred leg:
        // on an inbound call it is the sid we already had, but on an outbound one the
        // old root was our OWN leg and is now dead, so keeping it would break hold,
        // hang-up and any second transfer.
        unpairedRef.current = invitation;
        pendingRef.current = {
          ...call,
          callSid: view.transferredSid,
          at: Date.now(),
          direction: 'inbound',
          transferFrom: undefined,
          // ⚠️ `token` MUST be dropped. `tryPair` compares it against the INVITE's
          // X-Cyg-Call header, and a transfer deliberately carries none — so an internal
          // call's original token would compare `'tok' !== null` and take-back would
          // silently never pair. Company calls have no token and were never affected,
          // which is exactly how this would have shipped unnoticed.
          token: undefined,
        };
        setPhase('idle');
        tryPair();
        // Pairing an inbound call starts the ringtone; there is nothing to answer here.
        stopRinging();
        void invitationRef.current
          ?.accept({
            sessionDescriptionHandlerOptions: {
              constraints: { audio: true, video: false },
            },
          })
          .catch(() => endCall());
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
      /**
       * Send one DTMF digit down the live call.
       *
       * ── WHY THE RAW RTCDTMFSender, AND NOT sip.js's `sendDtmf` ────────────────────
       * `sendDtmf` exists and is typed, but it calls `insertDTMF(tones)` and nothing
       * else — and per the WebRTC spec `insertDTMF` **SETS** the tone buffer, it does not
       * append. The playout task then dequeues one character and sleeps
       * `duration + interToneGap`. So a second press inside that window OVERWRITES the
       * first, and the pending digit is silently dropped while its local beep has already
       * played. At one-digit-per-press that is a ~240ms hole; an agent typing a six-digit
       * extension at normal speed loses digits, intermittently.
       *
       * Appending to the pending `toneBuffer` is the fix, and it is only expressible on
       * the raw sender. It costs nothing in types: `toneBuffer` and `canInsertDTMF` are
       * both in lib.dom, `RTCRtpSender.dtmf` is `RTCDTMFSender | null`, and
       * `audioSenderOf` already does the one cast this file needs. It also picks the
       * audio sender BY KIND, where sip.js takes `getSenders()[0]` by index — safe today
       * only because the UA is audio-only.
       *
       * ⚠️ A `true` here means the browser queued the telephone-events. Whether
       * SignalWire's `<Dial>` bridge relays them to the far leg is NOT observable from
       * the client, and is not something this return value claims.
       */
      addCall: (target: AddCallTarget) =>
        runConference((call, internal) => {
          if (internal) {
            if (!('targetUserId' in target)) {
              // Structurally unreachable: the internal picker offers colleagues only.
              // Stated anyway, because the alternative is dialling a number from a call
              // that has no caller ID to present.
              throw new Error('Only a colleague can be added to a staff call');
            }
            return addToInternalConference(
              token!,
              call.callSid,
              target.targetUserId,
            );
          }
          return addCallToConference(
            token!,
            call.companyId,
            call.callSid,
            target,
          );
        }),

      holdParty: (partyId: string, held: boolean) =>
        runConference((call, internal) =>
          internal
            ? setInternalConferenceHold(token!, call.callSid, partyId, held)
            : setConferenceHold(
                token!,
                call.companyId,
                call.callSid,
                partyId,
                held,
              ),
        ),

      swapParties: () =>
        runConference((call, internal) =>
          internal
            ? swapInternalConference(token!, call.callSid)
            : swapConference(token!, call.companyId, call.callSid),
        ),

      mergeParties: () =>
        runConference((call, internal) =>
          internal
            ? mergeInternalConference(token!, call.callSid)
            : mergeConference(token!, call.companyId, call.callSid),
        ),

      dropParty: (partyId: string) =>
        runConference((call, internal) =>
          internal
            ? dropInternalConferenceParty(token!, call.callSid, partyId)
            : dropConferenceParty(token!, call.companyId, call.callSid, partyId),
        ),

      sendDigit: (digit: string) => {
        // Guards live here rather than only on the pad: the pad reads `phase` from a
        // render, while `phaseRef` is written synchronously by `setPhase`, and a keyboard
        // press can outrun a `disabled` prop.
        if (phaseRef.current !== 'active') return false;
        // While held the far end hears music. Refused because the digit WOULD arrive —
        // DTMF is unaffected by `replaceTrack` and by `track.enabled = false`, since the
        // sender owns it, not the track — and reaching an IVR while the agent believes
        // the caller is parked is worse than not sending it.
        if (holdMusicRef.current || micTrackRef.current) return false;
        // insertDTMF throws InvalidCharacterError on an illegal character and rejects the
        // WHOLE string, which with the append below would discard the queued digits too.
        if (!isDtmfKey(digit)) return false;

        const dtmf = audioSenderOf(invitationRef.current)?.dtmf;
        // False when the far end never negotiated `telephone-event`, or the transceiver
        // is not sending. Either way RTP DTMF cannot work on this call, and the pad says
        // so rather than pretending.
        if (!dtmf?.canInsertDTMF) {
          log('dtmf unavailable', digit);
          return false;
        }

        try {
          dtmf.insertDTMF(dtmf.toneBuffer + digit, DTMF_DURATION_MS, DTMF_GAP_MS);
        } catch {
          return false;
        }
        return true;
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
        /**
         * ⚠️ In a conference, hold is a SERVER operation and nothing below runs.
         *
         * The browser's hold works by replacing the microphone on the agent's own
         * outgoing track — and in a conference that track is mixed to EVERY participant.
         * Holding would therefore play hold music to the very person it claims you are
         * still talking to, and mute the agent to both. `setCallHold` would also pause
         * the recording of the whole conference rather than one party's share of it.
         *
         * So the two-party path below is left exactly as it was, including its
         * load-bearing pause-before-music ordering, and conference hold goes through
         * per-participant holds instead.
         */
        if (conferenceRef.current) {
          // One button, two meanings: "hold everyone" while the call is merged, and
          // "merge everyone" once anybody is held. Merge is the only way back, so the
          // button has to offer it.
          const merged = conferenceRef.current.merged;
          void runConference((call, internal) => {
            if (!merged) {
              return internal
                ? mergeInternalConference(token!, call.callSid)
                : mergeConference(token!, call.companyId, call.callSid);
            }
            return holdAllParties(call, internal);
          }).catch(() => undefined);
          return;
        }

        if (holdBusyRef.current) return;
        const sender = audioSenderOf(invitationRef.current);
        // `infoRef`, not `pendingRef` — same bug as `blindTransfer` had. `pendingRef`
        // holds the newest event this browser has SEEN, which during a ring for another
        // company is that other company's call, and pausing its recording would be a
        // write against a call the agent is not on.
        const call = infoRef.current;
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
    // `setPhase` / `setTransferBoth` / `setInfo` are all identity-stable useCallbacks, so
    // listing them keeps the linter honest without churning this memo — which must stay
    // identity-stable, since a consumer that only wants the buttons re-renders on it.
    [
      endCall,
      setPhase,
      setTransferBoth,
      teardownHold,
      token,
      tryPair,
      runConference,
      holdAllParties,
    ],
  );

  const state = useMemo<SoftphoneState>(
    () => ({
      status,
      phase,
      info,
      transfer,
      conference,
      // Both halves matter: the colleague has not answered yet, AND our fork of the
      // transfer <Dial> is still alive. The server can say the first; only the browser
      // knows the second, and without it the button would offer a dead session.
      canTakeBack: transfer?.state === 'ringing' && hasHeldInvite,
      muted,
      held,
      seconds,
      hasHeldInvite,
    }),
    [
      status,
      phase,
      info,
      transfer,
      conference,
      muted,
      held,
      seconds,
      hasHeldInvite,
    ],
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
