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
import { dialedHere } from '@/lib/dialIntent';
import { invitePairsWith, type InviteMarkers } from './invite-pairing';
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
  fetchPendingCalls,
  declineCall,
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
  reportCallAnswered,
  type AddCallTarget,
  hangUpCall,
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
import {
  SW_MESSAGE_SOURCE,
  callNotificationTag,
  closeNotification,
} from '@/lib/desktopNotification';
import { useCallNotifier } from '@/context/NotificationContext';
import { formatE164 } from '@/lib/phone';
import {
  audioReady,
  startCallWaitingTone,
  startRinging,
  stopCallWaitingTone,
  stopRinging,
  unlockAudio,
} from '@/lib/notificationSound';
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
 * The two SIP headers that can identify an INVITE.
 *
 * `X-Cyg-Call` is the internal-call token, and predates this. `X-Cyg-Leg` carries a
 * company call's own sid and is what makes two concurrent calls distinguishable. They are
 * separate names on purpose — see `ringAndDial` on the server: reusing `X-Cyg-Call` for
 * company calls would make an older cached client build refuse every inbound call.
 */

/**
 * Both markers on an INVITE.
 *
 * sip.js exposes the raw INVITE as `invitation.request`, and SignalWire delivers the
 * `?X-Cyg-…=` parameters we put on the <Sip> noun as SIP headers of those names.
 */
function markersOf(invitation: Invitation): InviteMarkers {
  const read = (name: string): string | null => {
    try {
      return invitation.request.getHeader(name) ?? null;
    } catch {
      // Never let header parsing break call pairing — a missing marker just means this
      // INVITE falls back to order-based matching, i.e. the pre-call-waiting behaviour.
      return null;
    }
  };
  return { call: read('X-Cyg-Call'), leg: read('X-Cyg-Leg') };
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

/**
 * One live call, as render sees it. Immutable; rebuilt by `publish()`.
 *
 * `id` is a MINTED slot id, never the call sid. A sid is not a stable key here: on a
 * transfer take-back the same slot is deliberately re-pointed at a different sid
 * (`transferredSid`), and on an inbound transfer the transferrer's and transferee's
 * entries name the SAME sid. `info.callSid` remains what every API call is made against.
 */
export interface CallView {
  id: string;
  info: IncomingCallInfo;
  /** A slot never reaches `'idle'` — it is removed instead. */
  phase: Exclude<CallPhase, 'idle'>;
  held: boolean;
  /**
   * Parked because the agent switched away, rather than because they pressed Hold.
   *
   * The difference decides whether switching BACK resumes the call. A manual hold is an
   * instruction about that caller ("stay parked"); silently un-parking them would put
   * them live on a call the agent believes is still held.
   */
  heldAuto: boolean;
  muted: boolean;
  /** The browser refused to play this call's audio — see `CallSlot.audioBlocked`. */
  audioBlocked: boolean;
  seconds: number;
  isActive: boolean;
  conference: ConferenceStatus | null;
  transfer: TransferView | null;
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
  /**
   * The browser refused to play the ACTIVE call's audio — see `CallSlot.audioBlocked`.
   * The overlay turns this into a button, because only a real gesture can lift it.
   */
  audioBlocked: boolean;
  /** Seconds since the call was answered. */
  seconds: number;
  /**
   * EVERY live call, oldest first — call waiting's whole surface.
   *
   * Every field above it now means "the ACTIVE call's". That is deliberate: `phase` is
   * still the overlay's portal gate and `hasHeldInvite && phase === 'idle'` is still the
   * Communications tab's Answer-banner gate, so redefining either would quietly change
   * who can answer a call from where. With one call in the list — which is almost every
   * call — every one of those reads means exactly what it meant before.
   */
  calls: CallView[];
  activeCallId: string | null;
  /**
   * A call that is ringing and is NOT the one the agent is on. Derived, never stored, so
   * the FIRST call ringing on an idle phone (active AND ringing) can never be mistaken
   * for a call waiting.
   */
  waitingCallId: string | null;
  /**
   * This browser is holding a live INVITE it has not been told to display.
   *
   * True on every registered browser during a ring it is not the target of, because all
   * of them share one SIP credential. It is what lets the Communications tab offer
   * "Answer" to an admin: without a held invitation there is nothing to accept, however
   * much the server knows about the call.
   */
  hasHeldInvite: boolean;
  /**
   * A call this tab has asked for, before SignalWire has rung it back.
   *
   * ⚠️ A FIELD beside `phase`, deliberately NOT a fifth `CallPhase` value — the same rule
   * `conference` and `held` state above. `phase` drives `tryPair`'s `!== 'idle'` guard,
   * the call timer and `sendDigit`'s `=== 'active'` check; a fifth value would have to be
   * handled in each of those and every omission is a silent bug. Pairing in particular
   * must go on believing this tab is idle, or the INVITE this very dial produces would be
   * refused.
   *
   * It exists because nothing at all appeared between the click and pairing — roughly one
   * to three seconds of a button that looked broken, made of the server's DB and provider
   * round trips plus SignalWire forking the INVITE back to us.
   */
  dialing: DialingView | null;
}

/** What the optimistic card shows while a dial is in flight. */
export interface DialingView {
  companyId: number;
  companyName: string;
  /** E.164 for a company call; null for a staff call, which is placed by user id. */
  to: string | null;
  /** Who is being rung, when we know a name — a colleague, or a saved contact. */
  peerName: string | null;
  kind: 'company' | 'internal';
  startedAt: number;
  /**
   * Known only once the dial request answers. Until then Cancel has nothing to act on, so
   * it latches `cancelled` and the sid is hung up the moment it arrives.
   */
  callSid: string | null;
  /**
   * Cancel was pressed. Only ever visible while `callSid` is still null — once the sid
   * lands the call is hung up and the card comes down, so there is nothing left to show.
   */
  cancelled: boolean;
}

/**
 * What a dial site holds onto between the click and the call appearing.
 *
 * Deliberately tiny: the three dial sites are hooks in three different files, each already
 * owning its own mutation, so the context supplies the card and they supply the request.
 */
export interface DialHandle {
  /** The dial answered; `callSid` is now known. Also hangs it up if Cancel got there first. */
  placed: (callSid: string) => void;
  /** The dial failed, or the call has paired and owns the screen now. */
  done: () => void;
}

interface SoftphoneActions {
  answer: () => void;
  hangup: () => void;
  /**
   * "A call is being placed" — call this synchronously in the click, beside
   * `unlockAudio()`, before the request goes out.
   *
   * Returns a handle rather than taking the promise: the dial sites are three different
   * hooks in three different files, and each already owns its own mutation.
   */
  beginDialing: (view: Omit<DialingView, 'startedAt' | 'callSid'>) => DialHandle;
  /**
   * Cancel a dial from the optimistic card.
   *
   * Before the sid is known there is nothing to hang up, so this only latches the intent
   * and `DialHandle.placed` ends the call the moment the sid lands — the request was
   * already accepted by then and somebody's phone is ringing.
   */
  cancelDialing: () => void;
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
  /**
   * Talk to a different one of the calls in hand.
   *
   * Parks the current caller first and AWAITS it, then resumes the target if it was
   * auto-held. Park-then-resume, never the reverse: resuming first would leave both calls
   * live for the length of a hold round-trip, i.e. the first customer listening to the
   * agent talk to the second.
   */
  switchTo: (callId: string) => void;
  /** Answer a call that is ringing while another is in progress. Parks the current one. */
  answerWaiting: (callId: string) => void;
  /**
   * Send a waiting caller to voicemail.
   *
   * Goes through the server, which redirects that leg. Rejecting the INVITE here would
   * end only THIS browser's branch — every browser shares one SIP credential — and the
   * caller would go on ringing into the other branches until the dial timed out.
   */
  declineWaiting: (callId: string) => void;
  /** Hang up on the current caller and take the waiting one instead. */
  endAndAnswer: (callId: string) => void;
  /**
   * Re-attempt playback of the active call's remote audio, from a user gesture.
   *
   * The only reliable way out of an autoplay refusal — which is what happens when a call
   * is answered from a desktop notification in a tab nobody has clicked in.
   */
  retryAudio: () => void;
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
/**
 * How long to wait before re-checking a leg we rejected mid-`Establishing`.
 *
 * Long enough for an `accept()` already in flight to settle into `Established`, short
 * enough that nobody is left connected to a call they hung up on. See
 * `terminateInvitation`.
 */
const ESTABLISHING_BYE_MS = 1_500;

/**
 * How long the optimistic "Calling…" card may stand with no INVITE behind it.
 *
 * Just past the 30s `<Dial timeout>` the server rings the browser with, so a call that is
 * genuinely still being set up is never cut short — and a dial whose INVITE never arrives
 * at all cannot strand a card the agent has no way to dismiss.
 */
const DIAL_CARD_TTL_MS = 35_000;

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
/**
 * One live call. MUTABLE and ref-only — never put in state; `publish()` snapshots it.
 *
 * Everything here used to be a singleton ref on the provider (`invitationRef`, `infoRef`,
 * `micTrackRef`, `holdMusicRef`, `holdBusyRef`, `transferInviteRef`, …). Gathering them
 * into a record is the whole refactor: with one slot in the registry, every operation
 * below does exactly what it did before.
 */
interface CallSlot {
  /** Minted `call-1`, `call-2`, … — see `CallView.id` for why this is not the sid. */
  id: string;
  invitation: Invitation;
  info: IncomingCallInfo;
  phase: Exclude<CallPhase, 'idle'>;
  /** This call's own remote-audio sink. */
  audio: HTMLAudioElement;
  /** The real microphone, parked here while hold music takes its place. */
  micTrack: MediaStreamTrack | null;
  music: HoldMusic | null;
  held: boolean;
  heldAuto: boolean;
  /** Serialises hold/resume on THIS slot. A chain, not a flag — `switchTo` must await it. */
  holdOp: Promise<void> | null;
  muted: boolean;
  /**
   * The agent has pressed Answer and `accept()` is in flight.
   *
   * ⚠️ Load-bearing for the TONE, not for the call. `syncTones` derives what should be
   * sounding from the active slot's phase, and a call being answered is still `'ringing'`
   * until Established lands — so without this, answering a WAITING call makes it the
   * active ringing slot for a few hundred milliseconds and the full ringtone blares at an
   * agent who just picked the call up.
   */
  answering: boolean;
  /**
   * The browser refused to play this call's remote audio.
   *
   * Autoplay policy keys on the document having been interacted with. Answering from a
   * DESKTOP NOTIFICATION does not count — the click lands on the service worker, and the
   * `message` event it posts back is not a user gesture — so in a tab that has never
   * been clicked in, `accept()` succeeds and the caller can hear the agent while the
   * AGENT HEARS NOTHING. That used to be swallowed by a bare `.catch`; now it raises a
   * button in the overlay that re-plays from a real gesture.
   */
  audioBlocked: boolean;
  /** Epoch ms at Established; null while ringing. `seconds` is derived from it. */
  answeredAt: number | null;
  /** Epoch ms this slot was last the active one. Decides who is promoted on hang-up. */
  lastActiveAt: number;
  conference: ConferenceStatus | null;
  transfer: TransferView | null;
  /** Our own fork of this call's transfer `<Dial><Sip>`, claimed once and never replaced. */
  takeBackInvite: Invitation | null;
  transferTimer: ReturnType<typeof setTimeout> | undefined;
}

/** An INVITE that has arrived with no matching event YET. */
interface HeldInvite {
  invitation: Invitation;
  /** Read ONCE, on arrival. */
  markers: InviteMarkers;
  at: number;
  /** Its OWN release timer — there is no longer a single shared one. */
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Ceiling on unpaired INVITEs.
 *
 * Every browser receives every INVITE for the whole firm, because they all share one SIP
 * credential. This used to be a single slot that each new INVITE overwrote, so it could
 * not grow; a list can, on a busy afternoon in an idle admin's browser.
 */
const MAX_HELD_INVITES = 8;

export function SoftphoneProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const notifyCall = useCallNotifier();

  const [status, setStatus] = useState<SoftphoneStatus>('idle');
  const [calls, setCalls] = useState<CallView[]>([]);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [hasHeldInvite, setHasHeldInvite] = useState(false);
  const [dialing, setDialing] = useState<DialingView | null>(null);
  /**
   * The live dial, read synchronously.
   *
   * A ref beside the state for the reason every other slot field is: `cancel()` and the
   * sid arriving can both happen before React re-renders, and a stale closure would hang
   * up the wrong call or none at all.
   */
  const dialingRef = useRef<DialingView | null>(null);
  const dialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const uaRef = useRef<UserAgent | null>(null);
  const regRef = useRef<Registerer | null>(null);
  /** Holds every slot's <audio>. Outside the React tree, so nothing can detach one. */
  const audioHostRef = useRef<HTMLDivElement | null>(null);

  /** Every live call, keyed by minted slot id, in the order they arrived. */
  const slotsRef = useRef<Map<string, CallSlot>>(new Map());
  const activeIdRef = useRef<string | null>(null);
  const slotSeqRef = useRef(0);
  const switchBusyRef = useRef(false);

  /** INVITEs waiting for an event, and events waiting for an INVITE. Both are LISTS now. */
  const invitesRef = useRef<HeldInvite[]>([]);
  const eventsRef = useRef<IncomingCallInfo[]>([]);

  /**
   * `publish`, reachable from callbacks defined ABOVE it.
   *
   * Only `attachRemoteAudio` needs this: it is declared before `publish` (publish reads
   * the slot list, which this populates) but has to re-render when the browser refuses
   * to play a call's audio.
   */
  const publishRef = useRef<() => void>(() => undefined);

  /** Read from callbacks without making them depend on it. */
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const slotList = useCallback(() => [...slotsRef.current.values()], []);
  const activeSlot = useCallback(
    () =>
      activeIdRef.current
        ? slotsRef.current.get(activeIdRef.current) ?? null
        : null,
    [],
  );
  /** The exact replacement for every `phaseRef.current` read. */
  const phaseNow = useCallback(
    (): CallPhase => activeSlot()?.phase ?? 'idle',
    [activeSlot],
  );
  const slotIn = useCallback(
    (phase: CallSlot['phase']) =>
      slotList().find((s) => s.phase === phase) ?? null,
    [slotList],
  );

  /**
   * Which tone should be sounding right now, DERIVED rather than commanded.
   *
   * Called from `publish()` and nowhere else, so "forgot to stop the beep" is unreachable
   * — the characteristic failure of a sound that plays over a live conversation. Both
   * starters are idempotent and both stoppers are no-ops when silent, so running this on
   * every publish (including the 1 Hz tick) costs nothing.
   *
   * The branches are mutually exclusive on the ACTIVE slot's phase, so the ringtone and
   * the call-waiting pips can never sound together.
   */
  const syncTones = useCallback(() => {
    const active = activeSlot();
    const othersRinging = slotList().some(
      (s) => s !== active && s.phase === 'ringing',
    );
    if (
      active?.phase === 'ringing' &&
      !active.answering &&
      active.info.direction !== 'outbound'
    ) {
      stopCallWaitingTone();
      startRinging();
    } else if (active && othersRinging) {
      stopRinging();
      startCallWaitingTone();
    } else {
      stopRinging();
      stopCallWaitingTone();
    }
  }, [activeSlot, slotList]);

  /**
   * Rebuild the render-visible snapshot from the registry. The ONE way state changes.
   *
   * Replaces the four paired ref+setState setters this file used to carry (`setPhase`,
   * `setInfo`, `setTransferBoth`, `setConferenceBoth`): that pattern gives one pair per
   * value, which does not scale to N calls. Their synchronous-read property is preserved
   * for free, because a slot's fields are plain mutable properties.
   */
  const publish = useCallback(() => {
    const now = Date.now();
    const activeId = activeIdRef.current;
    setCalls(
      slotList().map((s) => ({
        id: s.id,
        info: s.info,
        phase: s.phase,
        held: s.held,
        heldAuto: s.heldAuto,
        muted: s.muted,
        audioBlocked: s.audioBlocked,
        // DERIVED, not ticked: a held call's timer keeps running, and a throttled
        // background tab can no longer under-count.
        seconds: s.answeredAt ? Math.floor((now - s.answeredAt) / 1000) : 0,
        isActive: s.id === activeId,
        conference: s.conference,
        transfer: s.transfer,
      })),
    );
    setActiveCallId(activeId);
    setHasHeldInvite(invitesRef.current.length > 0);
    // A copy, not the ref: the fields are mutated in place, and React would skip a
    // re-render for the same object identity — so pressing Cancel would change nothing.
    setDialing(dialingRef.current ? { ...dialingRef.current } : null);
    syncTones();
  }, [slotList, syncTones]);

  useEffect(() => {
    publishRef.current = publish;
  }, [publish]);

  /** Route a slot's remote audio into its own element. Synchronous, as it always was. */
  const attachRemoteAudio = useCallback((slot: CallSlot) => {
    const pc = (
      slot.invitation.sessionDescriptionHandler as unknown as {
        peerConnection?: RTCPeerConnection;
      }
    )?.peerConnection;
    if (!pc) return;
    const remote = new MediaStream();
    pc.getReceivers().forEach((r) => r.track && remote.addTrack(r.track));
    slot.audio.srcObject = remote;
    void slot.audio
      .play()
      .then(() => {
        if (!slot.audioBlocked) return;
        slot.audioBlocked = false;
        publishRef.current();
      })
      .catch(() => {
        // Not swallowed any more: this is the difference between "the call is quiet"
        // and "the agent cannot hear the client and has no idea why".
        slot.audioBlocked = true;
        publishRef.current();
      });
  }, []);

  /**
   * Put the microphone back and tear the music down, for ONE slot.
   *
   * Called by resume AND by teardown: hanging up while still held must not leave a live
   * microphone track or a playing element behind.
   */
  const teardownHold = useCallback((slot: CallSlot, sender?: RTCRtpSender) => {
    const mic = slot.micTrack;
    if (mic) {
      // Re-enabled because a silent hold disables the track in place rather than
      // replacing it; a no-op when music was used.
      mic.enabled = true;
      if (sender) void sender.replaceTrack(mic).catch(() => undefined);
    }
    slot.micTrack = null;
    slot.music?.stop();
    slot.music = null;
    // This slot's OWN element. It used to be the one shared <audio>, which with several
    // calls in hand would unmute whichever call happened to be playing through it.
    slot.audio.muted = false;
    slot.held = false;
    slot.heldAuto = false;
  }, []);

  /**
   * Give up ONE slot's media, leaving the registry and every held INVITE alone.
   *
   * Split out for the same caller as before: a transfer, where the server hangs up our leg
   * but the browser must keep holding its fork of the transfer `<Dial>` or "Take it back"
   * has nothing to accept.
   */
  const releaseSlotMedia = useCallback(
    (slot: CallSlot) => {
      // ⚠️ BEFORE anything drops the session: `audioSenderOf` reads it, and without a
      // sender the microphone track leaks and the tab keeps its recording indicator lit.
      teardownHold(slot, audioSenderOf(slot.invitation));
      slot.holdOp = null;
      slot.muted = false;
      slot.audioBlocked = false;
      slot.answeredAt = null;
      slot.audio.srcObject = null;
    },
    [teardownHold],
  );

  /** Serialise hold/resume on one slot. A chain, so `switchTo` can AWAIT a hold in flight. */
  const queueHold = useCallback(
    (slot: CallSlot, op: () => Promise<void>): Promise<void> => {
      const next = (slot.holdOp ?? Promise.resolve())
        .catch(() => undefined)
        .then(op);
      slot.holdOp = next;
      return next;
    },
    [],
  );

  /**
   * Park one caller.
   *
   * ORDER IS LOAD-BEARING and unchanged: the recording is paused BEFORE the music starts,
   * and resumed AFTER it stops. The opposite order records a slice of music at each
   * boundary, which is the whole defect the pause exists to prevent.
   */
  const holdSlot = useCallback(
    async (slot: CallSlot, kind: 'manual' | 'auto'): Promise<void> => {
      const sender = audioSenderOf(slot.invitation);
      if (!sender || slot.held) return;
      const tok = tokenRef.current;
      const call = slot.info;

      if (tok) await setCallHold(tok, call.companyId, call.callSid, true);

      slot.micTrack = sender.track ?? null;
      slot.audio.muted = true;

      let music: HoldMusic | null = null;
      if (tok) {
        try {
          const { audioId } = await fetchHoldAudio(tok, call.companyId);
          if (audioId !== null) {
            music = await startHoldMusic(phoneAudioUrl(tok, audioId));
          }
        } catch {
          /* fall through to a silent hold */
        }
      }

      if (music) {
        slot.music = music;
        await sender.replaceTrack(music.track).catch(() => undefined);
      } else if (sender.track) {
        // Silent hold. The track is disabled rather than replaced, and `micTrack` still
        // holds it so resume and mute both behave.
        sender.track.enabled = false;
      }
      slot.held = true;
      slot.heldAuto = kind === 'auto';
      publish();
    },
    [publish],
  );

  const resumeSlot = useCallback(
    async (slot: CallSlot): Promise<void> => {
      if (!slot.held) return;
      teardownHold(slot, audioSenderOf(slot.invitation));
      publish();
      const tok = tokenRef.current;
      if (tok) {
        await setCallHold(tok, slot.info.companyId, slot.info.callSid, false);
      }
    },
    [publish, teardownHold],
  );

  /**
   * The active call ended while others are in hand — who does the agent land on?
   *
   * Focus MOVES (the overlay would otherwise show nothing coherent and Hang up would be
   * ambiguous), to the call they were most recently on. Audio resumes only in the one
   * unambiguous case: a single survivor that this browser parked itself. Putting the agent
   * live on a call they did not choose, in the same tick as hanging up on somebody else,
   * is worse than leaving them a Resume button.
   */
  const promoteAfterEnd = useCallback(() => {
    const remaining = slotList();
    if (remaining.length === 0) return;
    const next = remaining.reduce((a, b) =>
      b.lastActiveAt > a.lastActiveAt ? b : a,
    );
    activeIdRef.current = next.id;
    next.lastActiveAt = Date.now();
    if (remaining.length === 1 && next.heldAuto) {
      void queueHold(next, () => resumeSlot(next)).catch(() => undefined);
    }
  }, [queueHold, resumeSlot, slotList]);

  /**
   * End ONE call and forget it.
   *
   * ⚠️ This is where the old global `endCall` was wrong in a way call waiting exposes: it
   * cleared the single unpaired-INVITE slot, so hanging up on call 1 threw away a live,
   * answerable INVITE for a call 2 that was still ringing. Nothing here touches
   * `invitesRef` or `eventsRef` — every held INVITE carries its own release timer and its
   * own Terminated listener, so none of them leaks.
   */
  const endSlot = useCallback(
    (id: string, reason: string) => {
      const slot = slotsRef.current.get(id);
      if (!slot) return;
      // Declined, hung up, rang out, or CANCELled because another tab or another agent
      // answered — every one of those funnels through here. It carries
      // `requireInteraction`, so an unclosed one outlives the call indefinitely.
      void closeNotification(callNotificationTag(slot.info.callSid));
      clearTimeout(slot.transferTimer);
      releaseSlotMedia(slot);
      slot.audio.remove();
      slot.takeBackInvite = null;
      slotsRef.current.delete(id);
      if (activeIdRef.current === id) {
        activeIdRef.current = null;
        promoteAfterEnd();
      }
      log('call ended', id, reason);
      publish();
    },
    [promoteAfterEnd, publish, releaseSlotMedia],
  );

  /** Drop a held INVITE from the list, whatever became of it. */
  const releaseInvite = useCallback((held: HeldInvite) => {
    clearTimeout(held.timer);
    invitesRef.current = invitesRef.current.filter((h) => h !== held);
    setHasHeldInvite(invitesRef.current.length > 0);
  }, []);

  /**
   * Close this browser's SIP dialog, whatever state it is in.
   *
   * ⚠️ **`Establishing` was the hole.** sip.js only allows `bye()` on an `Established`
   * session, so the old two-branch form (`Established ? bye() : reject()`) sent no BYE at
   * all for the whole window between `accept()` and the 200 OK — which on an OUTBOUND
   * click-to-call is every call, because `pair()` auto-accepts and `accept()` runs
   * getUserMedia plus ICE first. Press Cancel in that window and `endSlot` tore the card
   * down while the leg stayed up. A cross-border call has a longer post-dial delay, which
   * is exactly what makes the window wide enough to hit.
   *
   * So the `Establishing` branch rejects AND follows up with a BYE once the accept has
   * settled: whichever of the two the far end acts on, the dialog closes. Both are
   * swallowed — by the time either runs the agent has already been shown a dismissed card,
   * and the server-side hangup is the belt to this pair of braces.
   */
  const terminateInvitation = useCallback((inv: Invitation) => {
    if (inv.state === SessionState.Established) {
      void inv.bye().catch(() => undefined);
      return;
    }
    if (inv.state === SessionState.Establishing) {
      void inv.reject().catch(() => undefined);
      // The accept may still land after the reject. Ask again once it has, or the leg
      // survives its own hang-up.
      setTimeout(() => {
        if (inv.state === SessionState.Established) {
          void inv.bye().catch(() => undefined);
        }
      }, ESTABLISHING_BYE_MS);
      return;
    }
    void inv.reject().catch(() => undefined);
  }, []);

  /**
   * Turn one matched (INVITE, event) pair into a live slot.
   *
   * `path` is logged rather than branched on: it is how a field report says whether the
   * `X-Cyg-Leg` header actually arrives from SignalWire, which is still unverified.
   */
  const pair = useCallback(
    (held: HeldInvite, info: IncomingCallInfo, path: 'marker' | 'order') => {
      releaseInvite(held);
      eventsRef.current = eventsRef.current.filter((e) => e !== info);

      // A real call has arrived, so the optimistic card has done its job and the slot
      // below takes over the screen. Cleared unconditionally rather than matched against
      // this call: with one dial in flight at a time there is nothing else it could be,
      // and a card that outlived a mismatch would sit there until its TTL with a live
      // call already on top of it.
      if (dialingRef.current) {
        if (dialTimerRef.current) {
          clearTimeout(dialTimerRef.current);
          dialTimerRef.current = null;
        }
        dialingRef.current = null;
      }

      const id = `call-${++slotSeqRef.current}`;
      const audio = new Audio();
      audio.autoplay = true;
      audioHostRef.current?.appendChild(audio);

      const slot: CallSlot = {
        id,
        invitation: held.invitation,
        info,
        phase: 'ringing',
        audio,
        micTrack: null,
        music: null,
        held: false,
        heldAuto: false,
        holdOp: null,
        muted: false,
        answering: false,
        audioBlocked: false,
        answeredAt: null,
        lastActiveAt: Date.now(),
        conference: null,
        transfer: null,
        takeBackInvite: null,
        transferTimer: undefined,
      };
      slotsRef.current.set(id, slot);
      // The first call in hand becomes the active one; a later call is WAITING until the
      // agent answers it, which is what stops a second ring hijacking a live conversation.
      if (activeIdRef.current === null) activeIdRef.current = id;

      // `callSid` is here so a client log can be lined up against the server's own
      // `internal call X -> Y sid=...`; without it the two cannot be correlated.
      log('paired call', path, info.callSid, info.companyName, info.from, id);

      if (info.direction === 'outbound') {
        // The user already clicked "Call"; making them then click "Answer" to reach the
        // person THEY dialled would be absurd.
        void held.invitation
          .accept({
            sessionDescriptionHandlerOptions: {
              constraints: { audio: true, video: false },
            },
          })
          .catch(() => endSlot(id, 'outbound accept failed'));
      }

      held.invitation.stateChange.addListener((state) => {
        if (state === SessionState.Established) {
          slot.answeredAt = Date.now();
          slot.phase = 'active';
          attachRemoteAudio(slot);

          // Tell the server WHO picked up, so everyone else looking at this company sees
          // "On a call · <name>". Inbound company calls only. Best-effort.
          if (info.direction !== 'outbound' && info.kind !== 'internal') {
            const tok = tokenRef.current;
            if (tok) {
              void reportCallAnswered(tok, info.companyId, info.callSid).catch(
                () => undefined,
              );
            }
          }
          publish();
        }
        if (state === SessionState.Terminated) {
          // The one place the two teardowns differ. During a transfer this BYE is the
          // server hanging up our leg on purpose; the card must stay up and the held fork
          // must survive, so only the media goes.
          if (slot.phase === 'transferring') {
            releaseSlotMedia(slot);
            publish();
          } else {
            endSlot(slot.id, 'terminated');
          }
        }
      });

      publish();

      // ── The alert that reaches a BACKGROUNDED tab ────────────────────────────
      // Inbound only — nobody needs telling about a call they placed.
      //
      // Here rather than in `publish()`: `pair` runs exactly ONCE per call (tryPair
      // removes the event and releases the invite before calling it), while `publish`
      // runs every second.
      //
      // AFTER `publish()`, because publish → syncTones is what starts the ringtone, so
      // by now `audioReady()` reflects whether this tab will make any sound at all. A
      // tab the agent has never clicked in has no AudioContext, rings silently, and
      // needs the OS to make the noise instead — which is `silent: false`.
      if (info.direction !== 'outbound') {
        const party =
          info.fromName || formatE164(info.from) || 'Unknown caller';
        notifyCall({
          callSid: info.callSid,
          companyId: info.companyId,
          title: party,
          body: info.transferFrom
            ? `Incoming call · ${info.companyName}
Transferred by ${info.transferFrom.name}`
            : `Incoming call · ${info.companyName}`,
          silent: audioReady(),
        });
      }
    },
    [attachRemoteAudio, endSlot, notifyCall, publish, releaseInvite, releaseSlotMedia],
  );

  /**
   * Match every INVITE in hand against every event in hand.
   *
   * ⚠️ The `phaseRef.current !== 'idle'` guard this used to open with is GONE — it is what
   * made a second call unpairable. It was doing a second job too (stopping a transferring
   * browser being rung by its own `<Dial><Sip>` fork), and that job now belongs entirely
   * to the claim in `onInvite`, which runs first and is scoped to the transferring slot.
   */
  const tryPair = useCallback(() => {
    const now = Date.now();
    eventsRef.current = eventsRef.current.filter(
      (e) => now - e.at <= EVENT_STALE_MS,
    );

    const fromThisTab = dialedHere(now);

    for (const held of [...invitesRef.current]) {
      const info = eventsRef.current.find((e) =>
        invitePairsWith(held.markers, e, fromThisTab),
      );
      if (!info) {
        // Nothing was logged here before, so a failed pair was invisible until the
        // 33s release line — which carries no sid and no reason.
        log(
          'no pair for INVITE',
          held.markers.leg ?? held.markers.call ?? 'unmarked',
          `held=${invitesRef.current.length}`,
          `events=${eventsRef.current.length}`,
          `dialedHere=${fromThisTab}`,
        );
        continue;
      }
      const exact = held.markers.call !== null || held.markers.leg !== null;
      pair(held, info, exact ? 'marker' : 'order');
    }
  }, [pair]);

  /**
   * Record an event and try to place it. The single writer for `eventsRef`.
   *
   * De-dupes on sid, because the SSE frame and the `/pending-calls` response for one call
   * are the same fact arriving twice, and ignores anything already paired.
   */
  const pushEvent = useCallback(
    (info: IncomingCallInfo) => {
      if (slotList().some((s) => s.info.callSid === info.callSid)) return;
      eventsRef.current = [
        ...eventsRef.current.filter((e) => e.callSid !== info.callSid),
        info,
      ];
      tryPair();
    },
    [slotList, tryPair],
  );

  const onInvite = useCallback(
    (invitation: Invitation) => {
      const markers = markersOf(invitation);
      log('INVITE received', markers.leg ?? markers.call ?? 'unmarked');

      // Claimed ONCE, and scoped to the slot that is actually transferring. While a
      // transfer of ours is ringing, an UNMARKED INVITE is its fork coming back to us —
      // every browser shares one SIP credential — and it is the handle "Take it back"
      // accepts. A MARKED INVITE is provably not our fork, since the transfer <Dial><Sip>
      // deliberately carries none.
      const transferring = slotIn('transferring');
      if (transferring && !transferring.takeBackInvite && markers.call === null) {
        transferring.takeBackInvite = invitation;
        setHasHeldInvite(true);
        invitation.stateChange.addListener((state) => {
          if (state !== SessionState.Terminated) return;
          if (transferring.takeBackInvite !== invitation) return;
          // SignalWire cancelled our branch: the colleague answered, or it rang out.
          transferring.takeBackInvite = null;
          publish();
        });
        return;
      }

      // ALWAYS hold it, even with no context yet — it may still be on its way, and for a
      // whole company's worth of admins it never will: the call is somebody else's to be
      // shown, but any of them may still pick it up from that company's tab.
      const held: HeldInvite = {
        invitation,
        markers,
        at: Date.now(),
        timer: setTimeout(() => {
          if (!invitesRef.current.includes(held)) return;
          // The ring is over. Release it and do NOTHING: a reject on one forked branch can
          // tear down a call another branch is about to answer. Ignoring lets ours simply
          // time out.
          releaseInvite(held);
          log('INVITE released unpaired — ring window elapsed');
        }, PAIR_WINDOW_MS),
      };
      // Oldest first, and bounded: every browser receives every INVITE for the whole firm.
      invitesRef.current = [...invitesRef.current, held].slice(-MAX_HELD_INVITES);
      setHasHeldInvite(true);

      // Its OWN Terminated listener, replacing the single one the shared slot used to
      // carry. This is what notices SignalWire CANCELling our branch when another browser
      // answers — without it the tab keeps offering "Answer" for a call that is gone.
      invitation.stateChange.addListener((state) => {
        if (state !== SessionState.Terminated) return;
        if (!invitesRef.current.includes(held)) return;
        releaseInvite(held);
        log('held INVITE terminated — answered elsewhere or rang out');
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
        if (!invitesRef.current.includes(held)) return; // paired or released already
        void fetchPendingCalls(tok)
          .then((pending: IncomingCallInfo[]) => {
            if (!invitesRef.current.includes(held)) return;
            // EVERY ringing call, not just the newest. With two in flight, the singular
            // answer could hand call 1's INVITE call 2's event.
            for (const call of pending) pushEvent(call);
          })
          .finally(() => {
            if (++attempt < 4 && invitesRef.current.includes(held)) {
              setTimeout(ask, 400);
            }
          });
      };
      ask();
    },
    [publish, pushEvent, releaseInvite, slotIn, tryPair],
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
      stopCallWaitingTone();
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
          pushEvent(payload);
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
  }, [token, pushEvent]);

  // ── Call timer ────────────────────────────────────────────────────────────
  /**
   * ONE interval for every call, rather than one per call: `seconds` is derived inside
   * `publish` from each slot's `answeredAt`, so this only has to nudge a re-render. It
   * runs while ANY call is answered, which is what keeps a held caller's timer moving.
   */
  const anyAnswered = calls.some((c) => c.phase !== 'ringing');
  useEffect(() => {
    if (!anyAnswered) return;
    const id = setInterval(() => publish(), 1000);
    return () => clearInterval(id);
  }, [anyAnswered, publish]);

  // ── "Has my colleague picked up yet?" ─────────────────────────────────────
  /**
   * A bare interval rather than a TanStack query, even though the provider sits inside
   * QueryClientProvider. This feeds a state MACHINE — the card's wording, then the call's
   * teardown — not a render-time cache read, and the app-wide `retry` plus refetch-on-focus
   * would turn one terminal answer into several teardowns. Every other timer in this file
   * is a bare interval for the same reason.
   */
  const transferringId = calls.find((c) => c.phase === 'transferring')?.id ?? null;
  useEffect(() => {
    if (!transferringId) return;
    const tok = tokenRef.current;
    const slot = slotsRef.current.get(transferringId);
    if (!tok || !slot) return;
    const call = slot.info;

    let stopped = false;
    const settle = (next: TransferState) => {
      if (stopped) return;
      stopped = true;
      if (slot.transfer) slot.transfer = { ...slot.transfer, state: next };
      publish();
      // The server's agent-leg hangup is best-effort and swallowed. When it failed,
      // no BYE ever arrives and this session would linger until the media times out,
      // so it is closed explicitly rather than waiting on a listener that may not fire.
      terminateInvitation(slot.invitation);
      slot.transferTimer = setTimeout(
        () => endSlot(slot.id, 'transfer settled'),
        TRANSFER_SETTLE_MS,
      );
    };

    const tick = () => {
      const view = slot.transfer;
      if (stopped || !view) return;
      const ask =
        call.kind === 'internal'
          ? fetchInternalTransferStatus(tok, call.callSid)
          : fetchTransferStatus(tok, call.companyId, call.callSid);
      void ask
        .then(({ state }) => {
          if (stopped || slot.transfer !== view) return;
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
  }, [transferringId, endSlot, publish, terminateInvitation]);

  // ── Conference ────────────────────────────────────────────────────────────

  /**
   * Keep the party list honest while a conference is live.
   *
   * A bare `setInterval` rather than TanStack, for the reason the transfer poll above
   * gives in its own words: this feeds a state machine, not a render-time cache read.
   *
   * ⚠️ NO equivalent of TRANSFER_MAX_MS. A transfer resolves in seconds so a backstop is
   * a safety net; a conference legitimately runs for an hour, and giving up on one would
   * blank the controls out from under a call that is still going.
   *
   * An inactive answer clears the card and NOTHING else — ending the call stays owned by
   * the SIP Terminated listener, which is the only thing that actually knows it ended.
   */
  const conferencingId = calls.find((c) => c.conference)?.id ?? null;
  useEffect(() => {
    if (!conferencingId || !token) return;
    let stopped = false;

    const tick = () => {
      const slot = slotsRef.current.get(conferencingId);
      if (!slot) return;
      const call = slot.info;
      const fetching =
        call.kind === 'internal'
          ? fetchInternalConferenceStatus(token, call.callSid)
          : fetchConferenceStatus(token, call.companyId, call.callSid);

      void fetching
        .then((view) => {
          if (stopped) return;
          slot.conference = view.active ? view : null;
          publish();
        })
        // A blip must not blank a live call's controls; the next tick re-asks.
        .catch(() => undefined);
    };

    const id = setInterval(tick, CONFERENCE_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [conferencingId, token, publish]);

  /**
   * Run one conference operation against whichever API the ACTIVE call belongs to.
   *
   * Company and internal calls have separate endpoints because they have separate
   * authorization primitives (`assertMayUseCompanyPhone` + `assertCallBelongsTo` versus
   * `assertParticipant`), and unifying them server-side would weaken one. This is the
   * single place the client picks between them.
   *
   * ⚠️ Reads the ACTIVE SLOT, never the newest event seen. `eventsRef` holds calls this
   * browser is not on — during a ring for another company that is that other company's
   * call, and acting on it would be a write against a call the agent is not on. That was
   * the original `pendingRef` bug, and a registry makes it structurally unavailable.
   */
  const runConference = useCallback(
    async (
      op: (call: IncomingCallInfo, internal: boolean) => Promise<ConferenceStatus>,
    ): Promise<void> => {
      const slot = activeSlot();
      if (!slot || !token) return;
      const view = await op(slot.info, slot.info.kind === 'internal');
      slot.conference = view.active ? view : null;
      publish();
    },
    [activeSlot, publish, token],
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
      const slot = activeSlot();
      const parties = slot?.conference?.parties ?? [];
      let view = slot!.conference!;
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
    [activeSlot, token],
  );

  /**
   * Move the agent's ear and microphone to a different call.
   *
   * ⚠️ PARK THEN RESUME, never the reverse: resuming first leaves both calls live for the
   * length of a hold round-trip that includes an HTTP request, i.e. the first customer
   * listening to the agent talk to the second.
   *
   * ⚠️ Step 1 is SYNCHRONOUS and happens before any await. That round-trip is a few
   * hundred milliseconds and the agent is already talking, so the mute and
   * `track.enabled = false` make the separation instant while the music and the recording
   * pause land behind it. `holdSlot` still finds `sender.track` to park, and
   * `teardownHold` re-enables it.
   */
  const switchTo = useCallback(
    (callId: string) => {
      if (switchBusyRef.current) return;
      const target = slotsRef.current.get(callId);
      if (!target || callId === activeIdRef.current) return;
      switchBusyRef.current = true;
      // A real user gesture, which is what keeps audio playable.
      unlockAudio();

      void (async () => {
        try {
          const previous = activeSlot();

          if (previous && !previous.held) {
            previous.audio.muted = true;
            const sender = audioSenderOf(previous.invitation);
            if (sender?.track) sender.track.enabled = false;
          }

          if (previous && previous.phase === 'active' && !previous.held) {
            await queueHold(previous, () => holdSlot(previous, 'auto'));
          }

          if (previous) previous.lastActiveAt = Date.now();
          activeIdRef.current = callId;
          target.lastActiveAt = Date.now();
          publish();

          // A MANUAL hold stays held: the agent parked that caller deliberately, and
          // un-parking them silently would put them live on a call their agent believes
          // is still on hold.
          if (target.heldAuto) {
            await queueHold(target, () => resumeSlot(target));
          }
        } catch (err) {
          // A `void`ed async IIFE that rejects is an unhandled rejection, which this
          // codebase treats as a real hazard rather than noise. Nothing here can leave the
          // agent stuck — `finally` frees the mutex either way — so log and carry on.
          log('switch failed', err);
        } finally {
          switchBusyRef.current = false;
          publish();
        }
      })();
    },
    [activeSlot, holdSlot, publish, queueHold, resumeSlot],
  );

  /** Accept one slot's INVITE and make it the call the agent is on. */
  const answerSlot = useCallback(
    (callId: string) => {
      const slot = slotsRef.current.get(callId);
      if (!slot) return;
      // The ring is over for this call however it was answered — from the overlay, from
      // the in-tab banner, or from the notification itself. `endSlot` does not run on an
      // answer, so without this the notification would sit there for the whole call.
      void closeNotification(callNotificationTag(slot.info.callSid));
      // BEFORE anything that can publish — see `CallSlot.answering`.
      slot.answering = true;
      // Also the first reliable user gesture, which is what lets audio play at all.
      unlockAudio();
      const wasActive = activeIdRef.current === callId;
      if (!wasActive) switchTo(callId);
      else stopRinging();
      void slot.invitation
        .accept({
          sessionDescriptionHandlerOptions: {
            constraints: { audio: true, video: false },
          },
        })
        .catch(() => endSlot(callId, 'accept failed'));
    },
    [endSlot, switchTo],
  );


  /**
   * Tell the server to end every leg of this call, not just ours.
   *
   * ⚠️ Fired BEFORE the local BYE and deliberately NOT awaited. The server asks
   * SignalWire which legs are live, and after our BYE lands there are none — the same
   * ordering constraint "End & complete" documents in `CallOverlay`. Not awaiting is what
   * keeps the red button instant: the card still dismisses on the beat.
   *
   * Internal calls are skipped: both legs are browsers on the shared SIP credential, they
   * touch no company's support number, and so they cannot wedge a line the way an
   * orphaned `<Dial>` child does.
   */
  const endCallServerSide = useCallback((slot: CallSlot) => {
    const tok = tokenRef.current;
    if (!tok) return;
    const { kind, companyId, callSid } = slot.info;
    if (kind === 'internal' || !callSid) return;
    void hangUpCall(tok, companyId, callSid);
  }, []);

  /** Take the optimistic card down, and stop its expiry timer. */
  const clearDialing = useCallback(() => {
    if (dialTimerRef.current) {
      clearTimeout(dialTimerRef.current);
      dialTimerRef.current = null;
    }
    if (!dialingRef.current) return;
    dialingRef.current = null;
    publish();
  }, [publish]);

  /**
   * Raise the "Calling…" card immediately, and hand back the two callbacks the dial site
   * needs.
   *
   * ⚠️ The card is torn down by `pair()`, by `done()`, or by `DIAL_CARD_TTL_MS` —
   * whichever comes first. The TTL is not belt-and-braces: a dial whose INVITE never
   * arrives (SIP down, the agent's registration lost) would otherwise strand a card with
   * no call behind it and no way to dismiss it.
   */
  const beginDialing = useCallback(
    (view: Omit<DialingView, 'startedAt' | 'callSid'>): DialHandle => {
      if (dialTimerRef.current) clearTimeout(dialTimerRef.current);
      dialingRef.current = {
        ...view,
        startedAt: Date.now(),
        callSid: null,
        cancelled: false,
      };
      dialTimerRef.current = setTimeout(() => {
        log('dial card expired with no INVITE');
        clearDialing();
      }, DIAL_CARD_TTL_MS);
      publish();

      return {
        placed: (callSid: string) => {
          const live = dialingRef.current;
          if (!live) return;
          live.callSid = callSid;
          // Cancel was pressed before the sid existed. Now it does, so end the call it
          // names — the request was already accepted and somebody's phone is ringing.
          if (live.cancelled) {
            const tok = tokenRef.current;
            if (tok && live.kind === 'company') {
              void hangUpCall(tok, live.companyId, callSid);
            }
            clearDialing();
            return;
          }
          publish();
        },
        done: () => clearDialing(),
      };
    },
    [clearDialing, publish],
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  const actions = useMemo<SoftphoneActions>(
    () => ({
      answer: () => {
        const id = activeIdRef.current;
        if (id) answerSlot(id);
      },
      beginDialing,
      cancelDialing: () => {
        const live = dialingRef.current;
        if (!live) return;
        live.cancelled = true;
        if (live.callSid) {
          const tok = tokenRef.current;
          if (tok && live.kind === 'company') {
            void hangUpCall(tok, live.companyId, live.callSid);
          }
          clearDialing();
          return;
        }
        // No sid yet: keep the card up, now reading "Cancelling…", until `placed`
        // arrives and hangs it up. Dropping it here would leave a call ringing somebody's
        // phone with no UI anywhere to end it.
        publish();
      },
      hangup: () => {
        const slot = activeSlot();
        if (!slot) return;
        // Server FIRST, then our own dialog — see `endCallServerSide`.
        endCallServerSide(slot);
        terminateInvitation(slot.invitation);
        endSlot(slot.id, 'hung up');
      },
      switchTo,
      retryAudio: () => {
        const slot = activeSlot();
        if (!slot) return;
        // This IS the gesture, so unlock the context on the way through: a tab that
        // never had one is exactly the tab this button exists for.
        unlockAudio();
        attachRemoteAudio(slot);
      },
      answerWaiting: (callId: string) => answerSlot(callId),
      endAndAnswer: (callId: string) => {
        // Marked BEFORE the hang-up below, because `endSlot` promotes this slot to active
        // and publishes — which would ring at the agent for the call they are answering.
        const target = slotsRef.current.get(callId);
        if (target) target.answering = true;
        const current = activeSlot();
        if (current && current.id !== callId) {
          endCallServerSide(current);
          terminateInvitation(current.invitation);
          endSlot(current.id, 'ended to answer another call');
        }
        answerSlot(callId);
      },
      declineWaiting: (callId: string) => {
        const slot = slotsRef.current.get(callId);
        const tok = tokenRef.current;
        if (!slot) return;
        const { companyId, callSid } = slot.info;
        // The server redirects the leg into voicemail, which ends the ring for EVERY
        // branch. Rejecting here would only end ours. If it fails we still drop the call
        // locally — the agent said no, and a dismissal is better than a stuck card — but
        // then it goes on ringing for whoever else is holding it, which is the old
        // "Ignore" behaviour rather than a new failure.
        if (tok) {
          void declineCall(tok, companyId, callSid).catch((err: unknown) =>
            log('decline failed, dismissing locally', err),
          );
        }
        endSlot(callId, 'declined');
      },
      blindTransfer: async (targetUserId: number) => {
        const slot = activeSlot();
        if (!token || !slot) throw new Error('No call to transfer');
        const call = slot.info;

        // Optimistic, and it has to be: the BYE and the transfer fork travel the
        // already-open SIP WebSocket while this request is still in flight, so a phase
        // set after the await is reliably too late.
        const previous = slot.phase;
        slot.phase = 'transferring';
        publish();
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
          slot.transfer = {
            target: result.target,
            state: 'ringing',
            transferredSid: result.transferredSid,
          };
          publish();
        } catch (err) {
          slot.phase = previous;
          publish();
          throw err;
        }
        // Deliberately no teardown here. SignalWire tears the bridge down as a result of
        // the redirect, our session goes Terminated, and `releaseSlotMedia` runs through
        // the existing listener. The card is closed by the status poll instead.
      },
      takeBack: () => {
        const slot = slotIn('transferring');
        const invitation = slot?.takeBackInvite;
        if (!slot || !invitation) return;
        const view = slot.transfer;
        clearTimeout(slot.transferTimer);
        slot.takeBackInvite = null;

        // Re-point this slot at the leg we are taking back, and accept it.
        slot.invitation = invitation;
        slot.info = {
          ...slot.info,
          callSid: view?.transferredSid ?? slot.info.callSid,
          direction: 'inbound',
          transferFrom: undefined,
          // ⚠️ `token` MUST be dropped. It is compared against the INVITE's X-Cyg-Call
          // header, and a transfer deliberately carries none — so an internal call's
          // original token would compare `'tok' !== null` and this leg would never match
          // itself. Company calls have none and were never affected, which is exactly how
          // this would have shipped unnoticed.
          token: undefined,
        };
        slot.transfer = null;
        slot.phase = 'ringing';
        // Same reason as `answerSlot`: this leg is being accepted, not offered, so the
        // tone derivation must not treat it as a fresh incoming ring.
        slot.answering = true;
        slot.answeredAt = null;
        activeIdRef.current = slot.id;
        slot.lastActiveAt = Date.now();
        publish();

        // Pairing an inbound call starts the ringtone; there is nothing to answer here.
        stopRinging();
        void invitation
          .accept({
            sessionDescriptionHandlerOptions: {
              constraints: { audio: true, video: false },
            },
          })
          .catch(() => endSlot(slot.id, 'take-back accept failed'));

        invitation.stateChange.addListener((state) => {
          if (state === SessionState.Established) {
            slot.answeredAt = Date.now();
            slot.phase = 'active';
            attachRemoteAudio(slot);
            publish();
          }
          if (state === SessionState.Terminated) {
            if (slot.phase === 'transferring') {
              releaseSlotMedia(slot);
              publish();
            } else {
              endSlot(slot.id, 'terminated');
            }
          }
        });
      },
      answerHeld: (info: IncomingCallInfo) => {
        // Unlock audio on this click, while it is still a real user gesture.
        unlockAudio();
        // Feed the pairing path rather than accepting directly: pairing is what builds
        // the slot, and therefore what raises the overlay that follows the user for the
        // rest of the call. `at` is refreshed so the staleness sweep in `tryPair` cannot
        // reject a call the user is deliberately picking up.
        pushEvent({ ...info, at: Date.now(), direction: 'inbound' });
        const slot = slotList().find((s) => s.info.callSid === info.callSid);
        if (slot) answerSlot(slot.id);
      },

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
       * the raw sender.
       *
       * ⚠️ A `true` here means the browser queued the telephone-events. Whether
       * SignalWire's `<Dial>` bridge relays them to the far leg is NOT observable from
       * the client, and is not something this return value claims.
       */
      sendDigit: (digit: string) => {
        // The pad reads `phase` from a render, while the slot's fields are written
        // synchronously — and a keyboard press can outrun a `disabled` prop.
        if (phaseNow() !== 'active') return false;
        const slot = activeSlot();
        if (!slot) return false;
        // ⚠️ Hold refuses because DTMF WORKS, not because it fails: the RTCDTMFSender
        // belongs to the sender, not the track, so it is unaffected by hold's
        // replaceTrack. A digit pressed while held really would reach the IVR, with the
        // agent believing the caller is parked.
        if (slot.music || slot.micTrack) return false;
        if (!isDtmfKey(digit)) return false;

        const dtmf = audioSenderOf(slot.invitation)?.dtmf;
        // False when the far end never negotiated `telephone-event`, or the transceiver
        // is not sending. Either way RTP DTMF cannot work on this call, and the pad says
        // so rather than pretending.
        if (!dtmf?.canInsertDTMF) {
          log('dtmf unavailable', digit);
          return false;
        }
        try {
          dtmf.insertDTMF(dtmf.toneBuffer + digit, DTMF_DURATION_MS, DTMF_GAP_MS);
          return true;
        } catch {
          return false;
        }
      },

      toggleMute: () => {
        const slot = activeSlot();
        const sender = audioSenderOf(slot?.invitation ?? null);
        if (!slot || !sender) return;
        const next = !slot.muted;
        slot.muted = next;
        // The parked microphone, when held, so unmuting mid-hold cannot un-park it.
        const track = slot.micTrack ?? sender.track;
        if (track) track.enabled = !next;
        publish();
      },

      /**
       * Put the caller on hold, or take them off it.
       *
       * Swaps the microphone for a looping music track on the outgoing stream. The far
       * end hears music; the agent hears nothing, because that call's own remote audio
       * element is muted for the duration.
       *
       * With no track configured this is simply a silent hold, which is also what happens
       * if the music fails to build. Hold must never fail outright: the caller is on a
       * live call and the agent has already stopped talking to them.
       */
      toggleHold: () => {
        const slot = activeSlot();
        if (!slot) return;

        /**
         * ⚠️ In a conference, hold is a SERVER operation and nothing below runs.
         *
         * The browser's hold works by replacing the microphone on the agent's own
         * outgoing track — and in a conference that track is mixed to EVERY participant.
         * Holding would therefore play hold music to the very person it claims you are
         * still talking to, and mute the agent to both. `setCallHold` would also pause
         * the recording of the whole conference rather than one party's share of it.
         */
        if (slot.conference) {
          // One button, two meanings: "hold everyone" while the call is merged, and
          // "merge everyone" once anybody is held. Merge is the only way back, so the
          // button has to offer it.
          const merged = slot.conference.merged;
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

        void queueHold(slot, () =>
          slot.held ? resumeSlot(slot) : holdSlot(slot, 'manual'),
        ).catch(() => undefined);
      },
    }),
    // Every entry is an identity-stable useCallback, so this memo stays identity-stable —
    // which matters, because a consumer that only wants the buttons re-renders on it.
    [
      activeSlot,
      answerSlot,
      attachRemoteAudio,
      beginDialing,
      clearDialing,
      endCallServerSide,
      endSlot,
      holdAllParties,
      holdSlot,
      phaseNow,
      publish,
      pushEvent,
      queueHold,
      releaseSlotMedia,
      resumeSlot,
      runConference,
      slotIn,
      slotList,
      switchTo,
      terminateInvitation,
      token,
    ],
  );

  /**
   * Answer / Decline pressed on the desktop notification.
   *
   * The service worker cannot touch the call itself — it has no SIP session — so it
   * focuses this tab and posts the action back. This effect is what turns that into a
   * call action, and it lives inside the provider because it needs `slotsRef` and
   * `activeIdRef`, which nothing outside can see.
   *
   * Two guards carry the whole safety of the round trip:
   *  - the `source` check, because workbox and the PWA plugin post their own messages
   *    on this very channel;
   *  - matching the sid AND `phase === 'ringing'`, so a click on a stale notification —
   *    for a call already answered, or one that rang out — resolves to nothing and does
   *    nothing. It can never act on a DIFFERENT call.
   */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const message = event.data as
        | { source?: string; action?: string; callSid?: string }
        | undefined;
      if (message?.source !== SW_MESSAGE_SOURCE) return;

      const slot = slotList().find(
        (s) => s.info.callSid === message.callSid && s.phase === 'ringing',
      );
      if (!slot) return;

      if (message.action === 'answer') {
        answerSlot(slot.id);
        return;
      }
      if (message.action !== 'decline') return;

      // ⚠️ The overlay's two Declines are NOT the same action, and this mirrors it
      // rather than picking one. On the ACTIVE ringing call, Decline is a local SIP
      // reject that leaves the caller ringing everybody else's browser; on a WAITING
      // call it is a server-side redirect that sends them to voicemail for good.
      // Collapsing them would silently change what the button means.
      if (slot.id === activeIdRef.current) actions.hangup();
      else actions.declineWaiting(slot.id);
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [actions, answerSlot, slotList]);

  const state = useMemo<SoftphoneState>(() => {
    const active = calls.find((c) => c.id === activeCallId) ?? null;
    const waiting =
      calls.find((c) => c.phase === 'ringing' && c.id !== activeCallId) ?? null;
    return {
      status,
      // Every field here is THE ACTIVE CALL'S, which with one call in hand — almost every
      // call — means exactly what it meant before this file learned to hold several.
      phase: active?.phase ?? 'idle',
      info: active?.info ?? null,
      transfer: active?.transfer ?? null,
      conference: active?.conference ?? null,
      // Both halves matter: the colleague has not answered yet, AND our fork of the
      // transfer <Dial> is still alive. The server can say the first; only the browser
      // knows the second, and without it the button would offer a dead session.
      canTakeBack:
        active?.transfer?.state === 'ringing' &&
        !!(activeCallId && slotsRef.current.get(activeCallId)?.takeBackInvite),
      muted: active?.muted ?? false,
      held: active?.held ?? false,
      audioBlocked: active?.audioBlocked ?? false,
      seconds: active?.seconds ?? 0,
      hasHeldInvite,
      calls,
      activeCallId,
      waitingCallId: waiting?.id ?? null,
      // Not derived from `calls` — it is what stands in the gap BEFORE there is a call.
      dialing,
    };
  }, [status, calls, activeCallId, hasHeldInvite, dialing]);

  return (
    <ActionsCtx.Provider value={actions}>
      <StateCtx.Provider value={state}>
        {children}
        {/*
          Every call's <audio> lives HERE, appended imperatively, so audio survives the
          overlay re-rendering or being collapsed — and so React reconciliation can never
          detach one. One element per call: a shared element cannot carry two remote
          streams, and muting it for a held call would silence the live one.
        */}
        <div ref={audioHostRef} className="hidden" aria-hidden />
        {/*
          Mount gated on call state ONLY, never on the route — gating on anything
          route-derived would unmount a live call on navigation.
        */}
        {calls.length > 0 || dialing
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
