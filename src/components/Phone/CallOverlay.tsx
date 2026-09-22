import {
  Check,
  CheckCheck,
  Grid3x3,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneForwarded,
  PhoneOff,
  Play,
  Building2,
  CornerDownRight,
  Undo2,
  UserPlus,
  ArrowLeftRight,
  UserMinus,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useDraggable } from '@/hooks/useDraggable';
import { useIsPhone } from '@/hooks/useMediaQuery';
import type { ComposerPos } from '@/components/Companies/composer-layout';
import { readCallPos, writeCallPos } from './call-position';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { formatE164 } from '@/lib/phone';
import { useAuth } from '@/context/AuthContext';
import {
  completeCall,
  declineWithText,
  type ConferenceStatus,
} from '@/api/phone';
import { setInternalCallState } from '@/api/internalCalls';
import { DTMF_KEYS, dtmfTones } from '@/lib/dtmf';
import { playDtmfTone, unlockAudio } from '@/lib/notificationSound';
import {
  useSoftphone,
  useSoftphoneActions,
  type CompletePromptView,
  type IncomingCallInfo,
  type TransferView,
} from '@/context/SoftphoneContext';
import { TransferPicker } from '@/components/Phone/TransferPicker';
import { AddCallPicker } from '@/components/Phone/AddCallPicker';
import {
  canMerge,
  canSwap,
  partyRows,
  holdAllLabel,
  showConferenceCard,
} from '@/components/Phone/conference-parties';
import {
  canQuickSwap,
  otherCallId,
  showSwitcher,
  switcherMaxHeightClass,
  switcherRows,
  waitingRow,
} from '@/components/Phone/call-slots';
import {
  CallSwitcher,
  WaitingCallBanner,
} from '@/components/Phone/CallSwitcher';

/**
 * One secondary in-call control. Icon over label.
 *
 * ── WHY A GRID CELL RATHER THAN A min-w AND A WRAP ───────────────────────────
 * These used to be `min-w-[5rem] flex-1` inside a `flex-wrap`, with a comment doing the
 * arithmetic: inner width 358px, four buttons at 4x80 + 3x8 = 344, so all four share one
 * row and Hang up wraps alone beneath them. That held for exactly four buttons. A fifth
 * needs 432 and wraps, which pushes Hang up up beside it and halves the one control that
 * must never shrink.
 *
 * Shrinking to `min-w-[4rem]` would leave six pixels of slack — too tight to trust across
 * fonts. So the row is now a 3-column grid, which cannot mis-wrap whatever is added to
 * it: five buttons fill two rows, and Hang up stays outside the grid at full width.
 */
/** `max-w-sm` in pixels — what `clampPos` needs to keep the card fully on screen. */
const CARD_WIDTH = 384;

const SECONDARY_BTN =
  'flex w-full flex-col items-center justify-center gap-0.5 ' +
  'rounded-md px-2 py-1.5 text-[11px] font-medium';

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The incoming / in-progress call card.
 *
 * Deliberately NOT a shadcn `Dialog`: a modal traps focus and blocks the page, which
 * would defeat the whole point — the user must be able to keep working, and navigate to
 * another company, while on a call. This is the same non-blocking fixed-overlay pattern
 * as `ComposerStack` and `Toaster`, sitting above both at `z-[200]`.
 *
 * Rendered through a portal by SoftphoneProvider, whose mount condition depends only on
 * call state, so navigation never tears down a live call.
 */
export function CallOverlay() {
  const {
    phase,
    info,
    transfer,
    conference,
    canTakeBack,
    muted,
    held,
    seconds,
    calls,
    activeCallId,
    audioBlocked,
    dialing,
    completePrompt,
  } = useSoftphone();
  const {
    answer,
    hangup,
    toggleMute,
    toggleHold,
    blindTransfer,
    takeBack,
    sendDigit,
    addCall,
    holdParty,
    swapParties,
    mergeParties,
    dropParty,
    switchTo,
    answerWaiting,
    declineWaiting,
    declineActive,
    endAndAnswer,
    retryAudio,
    cancelDialing,
  } = useSoftphoneActions();
  const navigate = useNavigate();
  const { token } = useAuth();
  const qc = useQueryClient();
  const [transferOpen, setTransferOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [padOpen, setPadOpen] = useState(false);
  const [completing, setCompleting] = useState(false);

  // ── Dragging the card out of the way ──────────────────────────────────────
  //
  // The overlay is non-modal by design so the agent can keep working during a call —
  // but it lands top-centre, which is exactly where a page's own header and toolbar are.
  // `useDraggable` is the same hook `DockedComposer` uses; its dep-less `useLayoutEffect`
  // is not optional here, because this card re-renders EVERY SECOND from the call timer
  // and without it each tick would yank an in-flight drag back.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<ComposerPos | null>(() => readCallPos());
  // Dragging a window around a screen the window already fills is not a gesture anybody
  // wants — the same call `DockedComposer` makes.
  const canDrag = !useIsPhone();
  const dragged = canDrag && pos !== null;
  const dragStyle = dragged
    ? ({ left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } as const)
    : undefined;
  const resetPosition = () => {
    setPos(null);
    writeCallPos(null);
  };
  const drag = useDraggable({
    ref: cardRef,
    style: dragged
      ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
      : { left: 'auto', top: 'auto', right: 'auto', bottom: 'auto' },
    minimized: false,
    // The card's real width, so `clampPos` cannot leave it hanging off the edge. It is
    // `max-w-sm`; the composer default it would otherwise clamp against is wider.
    size: { w: CARD_WIDTH, h: 0 },
    onCommit: (next) => {
      setPos(next);
      writeCallPos(next);
    },
  });

  /**
   * Hang up AND clear the call off the worklist, in one action.
   *
   * ── WHY THE COMPLETE RUNS FIRST, AND IS AWAITED ────────────────────────────────
   * The server has to work out which inbox row this call is — for a click-to-call the
   * browser holds the `outbound-api` parent while the row is its `outbound-dial` child —
   * and it does that by asking SignalWire which legs are LIVE. After the BYE lands there
   * are none, and on a forked click-to-call the sid we hold is the dead twin about half
   * the time. So the call stays up for the round-trip. It is billed per minute; a second
   * costs nothing.
   *
   * ⚠️ And the hang-up happens either way. A failed bookkeeping write must never leave a
   * customer connected to an agent who has already pressed the red button — the worst case
   * here is a call that has to be completed from the inbox, which is where it already was.
   */
  const endAndComplete = () => {
    const call = info;
    if (!call || completing) return;
    setCompleting(true);

    const done = () => {
      setCompleting(false);
      hangup();
    };

    const mark =
      call.kind === 'internal'
        ? setInternalCallState(token!, call.callSid, 'complete')
        : completeCall(token!, call.companyId, call.callSid);

    // A budget, not a wait: if SignalWire is slow the agent still gets their hang-up on
    // the beat they asked for it.
    const budget = new Promise((resolve) => setTimeout(resolve, 1500));
    void Promise.race([mark.catch(() => undefined), budget])
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['phone-timeline', call.companyId] });
        void qc.invalidateQueries({ queryKey: ['phone-counts', call.companyId] });
        void qc.invalidateQueries({ queryKey: ['internal-calls'] });
        void qc.invalidateQueries({ queryKey: ['inbox-summary'] });
      })
      .finally(done);
  };

  // ── Reply by text instead of answering ─────────────────────────────────────
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [replying, setReplying] = useState<number | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  /**
   * Offered only where a text can actually go: a company call, inbound, with replies
   * configured. An internal call has no support number to send from, and an outbound
   * call is one we placed.
   */
  const quickReplies =
    info && info.kind !== 'internal' && info.direction !== 'outbound'
      ? (info.quickReplies ?? [])
      : [];

  /**
   * Send the text, then decline — sequenced BY THE SERVER, in one request.
   *
   * ⚠️ If the text fails, the call is deliberately left RINGING rather than declined: a
   * decline is irreversible for every browser holding the call, so the agent has to be
   * able to fall back to answering it. That is why this surfaces the error in place
   * instead of dismissing the card.
   */
  const sendQuickReply = async (index: number) => {
    const call = info;
    if (!call || !token || replying !== null) return;
    setReplying(index);
    setReplyError(null);
    try {
      await declineWithText(token, call.companyId, call.callSid, index);
      // The server has redirected the leg; drop our own branch so the card comes down.
      hangup();
    } catch (err) {
      setReplyError(
        err instanceof Error && err.message
          ? err.message
          : 'The reply could not be sent.',
      );
    } finally {
      setReplying(null);
    }
  };

  /**
   * More than two people on the line.
   *
   * Drives the controls that change meaning in a conference — never `phase`, which stays
   * `'active'` for the reason `SoftphoneState.conference` gives.
   */
  const inConference = showConferenceCard(conference);
  const ringing = phase === 'ringing';

  // Call waiting. `waiting` is the ring the agent is NOT on; `rows` is every answered
  // call, so the two can never describe the same call twice.
  const waiting = waitingRow(calls, activeCallId);
  const rows = switcherRows(calls);
  const strip = showSwitcher(calls) ? (
    <CallSwitcher
      rows={rows}
      maxHeightClass={switcherMaxHeightClass(!!waiting)}
      onSwitch={switchTo}
    />
  ) : null;
  const waitingBanner = waiting ? (
    <WaitingCallBanner
      row={waiting}
      currentCompany={info?.companyName ?? null}
      onAnswer={() => answerWaiting(waiting.id)}
      onEndAndAnswer={() => endAndAnswer(waiting.id)}
      onDecline={() => declineWaiting(waiting.id)}
    />
  ) : null;
  const swapTo = canQuickSwap(calls) ? otherCallId(calls, activeCallId) : null;

  /**
   * Is there one unambiguous call to complete?
   *
   * Three exclusions, each for its own reason:
   *  - RINGING: an outbound call that is still ringing has no child leg BY CONSTRUCTION,
   *    so there is no row to resolve — and completing a call you then DECLINE would tick
   *    off the missed call the team is supposed to act on. (The ringing bar is
   *    Answer/Decline anyway, so this costs no layout.)
   *  - CONFERENCE: `addCall` creates a second call with its own timeline row, so "the
   *    call" stops having one answer. Transfer is disabled here for the same reason.
   *  - An internal CALLER: `InternalCallsService.setState` scopes its write to `calleeId`,
   *    so the caller's request is a guaranteed no-op — correctly, since a call you placed
   *    already projects completed. `token` is present only on the CALLEE's event, which is
   *    the one thing that tells the two apart in the browser.
   */
  const canEndAndComplete =
    !ringing &&
    !inConference &&
    !!info &&
    (info.kind !== 'internal' || !!info.token);

  /**
   * The optimistic "Calling…" card, shown from the click until the call pairs.
   *
   * ── WHY IT IS ITS OWN BRANCH AND NOT A `phase` ─────────────────────────────────
   * `phase` drives `tryPair`'s `!== 'idle'` guard, the call timer and `sendDigit`'s
   * `=== 'active'` check. A fifth value would have to be handled in each of those, and
   * pairing in particular MUST go on believing this tab is idle — otherwise the INVITE
   * this very dial produces would be refused and the call would ring nobody's screen.
   * So `dialing` is a field beside `phase`, exactly as `conference` and `held` are.
   *
   * It renders only while there is no real call: the moment one pairs it takes over, and
   * the transition is invisible because this card is deliberately the same shell.
   */
  if (phase === 'idle') {
    // The offer outlives the call, so it is checked BEFORE the dial card — and before the
    // early return that would otherwise drop it on the floor.
    if (completePrompt) return <CompletePromptCard prompt={completePrompt} />;
    if (!dialing) return null;
    const cancelling = dialing.cancelled;
    return (
      <div className="fixed bottom-4 right-4 z-[200] w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border bg-background shadow-2xl">
        <div className="flex items-start gap-3 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
            <Phone size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {/* The same word the real card uses while ringing, so nothing changes on
                  screen when the two swap over. */}
              {cancelling ? 'Cancelling…' : 'Calling…'}
            </p>
            <p className="truncate text-sm font-semibold">
              {dialing.peerName ||
                formatE164(dialing.to ?? '') ||
                dialing.companyName}
            </p>
            {dialing.peerName && dialing.to && (
              <p className="truncate text-xs text-muted-foreground">
                {formatE164(dialing.to)}
              </p>
            )}
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              Connecting…
            </p>
          </div>
        </div>
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={cancelDialing}
            disabled={cancelling}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            <PhoneOff size={15} />
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'transferring') {
    return (
      <>
        <TransferringCard
          info={info}
          transfer={transfer}
          canTakeBack={canTakeBack}
          onTakeBack={takeBack}
          onOpenCompany={(id) => navigate(`/companies/${id}`)}
          // With nothing else in hand these are both null and this card is
          // byte-identical to what it has always rendered. With another call held, or one
          // ringing, they are the ONLY way back to it — this branch returns early, so a
          // strip left in the main shell below would simply not exist for the length of
          // the transfer.
          extra={
            <>
              {waitingBanner}
              {strip}
            </>
          }
        />
        {/*
          Kept MOUNTED, not just hidden. The phase flips to 'transferring' before the
          request resolves, so unmounting the picker here would destroy the `error` it is
          about to be handed: a failed transfer would roll the phase back and reopen a
          blank dialog with no explanation. Its own `open` closes on success.
        */}
        <TransferPicker
          open={transferOpen}
          onOpenChange={setTransferOpen}
          onTransfer={blindTransfer}
        />
      </>
    );
  }

  // A call we placed: it is connecting, not asking to be answered.
  const outgoing = info?.direction === 'outbound';
  const otherParty = outgoing ? info?.to : info?.from;
  /**
   * A saved contact's name for an INBOUND caller.
   *
   * Inbound only: `fromName` names `from`, and on an outbound call `otherParty` is `to`.
   * Labelling a dialled number with the name of whoever we happen to be calling FROM
   * would be worse than showing no name at all.
   */
  const otherPartyName = !outgoing ? info?.fromName : undefined;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[200] flex justify-center px-4">
      <div
        ref={cardRef}
        style={dragStyle}
        className={[
          // A flex column with a viewport cap, because the dial pad can add ~256px and
          // HANG UP IS AT THE BOTTOM — a card taller than the window would push the one
          // control you can never afford to lose off-screen. Only the pad scrolls.
          // `dvh`, not `vh`: a mobile URL bar makes them differ.
          //
          // ⚠️ `max-h` and the single `min-h-0 flex-1 overflow-y-auto` child below are
          // the reason dragging writes `left`/`top` and never a `height`: a fixed height
          // here would break the one-scroller rule and push Hang up off a short viewport,
          // which is the failure this card keeps being redesigned to avoid.
          'pointer-events-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col',
          'rounded-xl border bg-background shadow-2xl',
          dragged ? 'fixed' : '',
          ringing
            ? 'border-teal-400 ring-2 ring-teal-400/40 animate-pulse'
            : 'border-border',
        ].join(' ')}
      >
        {/* The drag handle is the HEADER, matching `DockedComposer`. `touch-none` or a
            touch drag scrolls the page instead; `select-none` or it paints a text
            selection across the caller's name. `useDraggable` already skips a pointer-down
            that lands on a button, so the header's own controls keep working. */}
        <div
          {...(canDrag ? drag : {})}
          onDoubleClick={canDrag ? resetPosition : undefined}
          className={[
            'flex shrink-0 items-start gap-3 p-4',
            canDrag ? 'cursor-move touch-none select-none' : '',
          ].join(' ')}
        >
          <div
            className={[
              'flex size-10 shrink-0 items-center justify-center rounded-full',
              ringing ? 'bg-teal-100 text-teal-700' : 'bg-green-100 text-green-700',
            ].join(' ')}
          >
            <Phone size={18} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {ringing
                ? outgoing
                  ? 'Calling…'
                  : 'Incoming call'
                : `On call · ${mmss(seconds)}`}
            </p>
            <p className="truncate text-sm font-semibold">
              {otherPartyName ||
                formatE164(otherParty) ||
                (outgoing ? 'Dialling' : 'Unknown caller')}
            </p>
            {otherPartyName && (
              // The number stays on screen under the name: an agent reads it back,
              // writes it down, or checks it against the contact they think it is.
              <p className="truncate text-xs text-muted-foreground">
                {formatE164(otherParty)}
              </p>
            )}
            {info && (
              <button
                type="button"
                onClick={() => navigate(`/companies/${info.companyId}`)}
                className="mt-0.5 flex items-center gap-1 text-xs text-teal-700 hover:underline"
              >
                <Building2 size={12} />
                <span className="truncate">{info.companyName}</span>
              </button>
            )}
            {/*
              A transferred call shows all three facts: who is on the line, which company
              they are, and that a colleague handed them over. Absent on an ordinary
              call, so every other card renders exactly as it did before.
            */}
            {info?.transferFrom && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <CornerDownRight size={12} />
                <span className="truncate">
                  Transferred by {info.transferFrom.name}
                </span>
              </p>
            )}
          </div>
        </div>

        {/*
          Keyed on the call sid, NOT merely mounted. `takeBack` calls setPhase('idle')
          and tryPair() synchronously, so React batches them into one render, the portal
          never unmounts, and this card survives a change of sid — leaving the digits
          typed at the previous party on screen. The key drops them.

          Collapsed while HELD rather than left open and refusing: `sendDigit` would
          reject every press, and the pad's only failure wording is about tone support,
          which would be a lie. `padOpen` is untouched, so it reappears on resume.
        */}
        {/* ── The browser refused to play this call's audio ──────────────────────
            Autoplay policy needs the document to have been interacted with, and
            answering from a desktop notification does not count — the click lands on
            the service worker. So the call is LIVE and the client can hear the agent,
            while the agent hears silence. This button is a real gesture, which is the
            one thing that reliably lifts the block. */}
        {audioBlocked && (
          <button
            type="button"
            onClick={retryAudio}
            className="flex shrink-0 items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-left text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            <Volume2 size={14} className="shrink-0" />
            <span>Can't hear the caller? Tap to turn the sound on.</span>
          </button>
        )}

        {waitingBanner}
        {strip}

        {inConference && conference && (
          <ConferenceCard
            view={conference}
            onHoldParty={(id, next) => void holdParty(id, next).catch(() => undefined)}
            onSwap={() => void swapParties().catch(() => undefined)}
            onMerge={() => void mergeParties().catch(() => undefined)}
            onDrop={(id) => void dropParty(id).catch(() => undefined)}
          />
        )}

        {padOpen && !ringing && !held && !inConference && (
          <DialPad key={info?.callSid} onDigit={sendDigit} />
        )}

        <div className="flex shrink-0 flex-wrap gap-2 border-t p-3">
          {ringing && !outgoing ? (
            <>
              <button
                onClick={answer}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-500"
              >
                <Phone size={14} />
                Answer
              </button>
              {/* ⚠️ `declineActive`, not `hangup`. This used to be a local SIP reject,
                  which ends only THIS browser's branch — every browser shares one SIP
                  credential, so the caller went on ringing all the others until the dial
                  timed out, and what the row finally said was left to how SignalWire filed
                  legs it was told to end. The server redirect sends them to this company's
                  voicemail and cancels the SIP children, which is UNCONNECTED and so
                  resolves to MISSED deterministically. It is also exactly what the WAITING
                  call's Decline has always done — the same word now means one thing. */}
              <button
                onClick={declineActive}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                <PhoneOff size={14} />
                Decline
              </button>
              {/* ⚠️ Its own full-width row, not a third button sharing this one. Answer is
                  the control that must never shrink on a ringing card, and three across a
                  384px card leaves each of them too small to hit in a hurry. */}
              {quickReplies.length > 0 && (
                <button
                  onClick={() => setRepliesOpen((v) => !v)}
                  disabled={replying !== null}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                >
                  <MessageSquare size={14} />
                  Reply by text
                </button>
              )}
              {repliesOpen && (
                <div className="flex w-full flex-col gap-1.5">
                  {quickReplies.map((text, i) => (
                    <button
                      key={text}
                      disabled={replying !== null}
                      onClick={() => void sendQuickReply(i)}
                      className="flex items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-60"
                    >
                      {replying === i ? (
                        <Loader2 size={12} className="mt-0.5 shrink-0 animate-spin" />
                      ) : (
                        <MessageSquare size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0">{text}</span>
                    </button>
                  ))}
                  {replyError && (
                    <span className="text-xs text-destructive">{replyError}</span>
                  )}
                </div>
              )}
            </>
          ) : ringing && outgoing ? (
            // No Answer button on a call we placed — only a way to give up on it.
            <button
              onClick={hangup}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
            >
              <PhoneOff size={14} />
              Cancel
            </button>
          ) : (
            <>
              {/* See SECONDARY_BTN: a 3-column grid, so adding a control cannot push
                  Hang up out of its own full-width row. */}
              <div className="grid w-full grid-cols-3 gap-2">
              <button
                onClick={toggleHold}
                className={[
                  SECONDARY_BTN,
                  held
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    : 'bg-muted hover:bg-muted/70',
                ].join(' ')}
              >
                {inConference ? (
                  <Users size={16} />
                ) : held ? (
                  <Play size={16} />
                ) : (
                  <Pause size={16} />
                )}
                {inConference
                  ? holdAllLabel(conference!)
                  : held
                    ? 'Resume'
                    : 'Hold'}
              </button>
              <button
                onClick={toggleMute}
                className={[
                  SECONDARY_BTN,
                  muted
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    : 'bg-muted hover:bg-muted/70',
                ].join(' ')}
              >
                {muted ? <MicOff size={16} /> : <Mic size={16} />}
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button
                onClick={() => setPadOpen((open) => !open)}
                disabled={held || inConference}
                title={
                  inConference
                    ? 'Everyone on the call would hear the tones'
                    : held
                      ? 'The caller is on hold and would not hear the tones'
                      : undefined
                }
                className={[
                  SECONDARY_BTN,
                  'disabled:cursor-not-allowed disabled:opacity-40',
                  padOpen
                    ? 'bg-teal-100 text-teal-800 hover:bg-teal-200'
                    : 'bg-muted hover:bg-muted/70',
                ].join(' ')}
              >
                <Grid3x3 size={16} />
                Keypad
              </button>
              <button
                onClick={() => setTransferOpen(true)}
                disabled={inConference}
                title={
                  inConference
                    ? 'Transferring would take the other people off the call'
                    : undefined
                }
                className={[
                  SECONDARY_BTN,
                  'disabled:cursor-not-allowed disabled:opacity-40',
                  'bg-muted hover:bg-muted/70',
                ].join(' ')}
              >
                <PhoneForwarded size={16} />
                Transfer
              </button>
              <button
                onClick={() => setAddOpen(true)}
                disabled={ringing || (conference ? !conference.canAdd : false)}
                title={
                  conference && !conference.canAdd
                    ? 'That is as many people as one call can hold'
                    : undefined
                }
                className={[
                  SECONDARY_BTN,
                  'disabled:cursor-not-allowed disabled:opacity-40',
                  'bg-muted hover:bg-muted/70',
                ].join(' ')}
              >
                <UserPlus size={16} />
                Add call
              </button>
              {/* The free 6th cell the grid comment above was written for: with exactly
                  two calls in hand, "the other one" is unambiguous and worth one press. */}
              {swapTo && (
                <button
                  onClick={() => switchTo(swapTo)}
                  title="Talk to the other caller"
                  className={[
                    SECONDARY_BTN,
                    'bg-muted hover:bg-muted/70',
                  ].join(' ')}
                >
                  <ArrowLeftRight size={16} />
                  Swap
                </button>
              )}
              </div>
              {/* ⚠️ STACKED, and each one full width.
                  This was an attached 44px icon-only segment on the SAME red as Hang up,
                  with its label only in a `title` — which is to say the second most
                  important action on the card was unreadable and looked like part of the
                  first. Stacking is what gives it a real label without taking a single
                  pixel of width off Hang up, which `SECONDARY_BTN`'s docblock above
                  explains must never shrink. It costs one row of height; the card is a
                  flex column whose PAD scrolls, so Hang up stays put on a short viewport.
                  Distinct tone, because two red bars would read as one control again. */}
              <div className="flex w-full flex-col gap-2">
                <button
                  onClick={hangup}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
                >
                  <PhoneOff size={14} />
                  Hang up
                </button>
                {canEndAndComplete && (
                  <button
                    onClick={endAndComplete}
                    disabled={completing}
                    title="End the call and mark it complete"
                    className="flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-70"
                  >
                    {completing ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <CheckCheck size={15} />
                    )}
                    End &amp; complete
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <TransferPicker
        open={transferOpen}
        onOpenChange={setTransferOpen}
        onTransfer={blindTransfer}
      />
      {info && (
        <AddCallPicker
          open={addOpen}
          onOpenChange={setAddOpen}
          companyId={info.companyId}
          internal={info.kind === 'internal'}
          onAdd={addCall}
        />
      )}
    </div>
  );
}

/**
 * What the TRANSFERRING agent sees while their colleague's phone rings.
 *
 * Before this existed the overlay simply carried on reading "On call · mm:ss" until the
 * BYE landed — and then, because the transfer `<Dial><Sip>` forks an INVITE back to
 * every browser sharing the SIP credential, the agent was rung by the call they had just
 * handed over. This card is the visible half of that fix; the `'transferring'` phase
 * behind it is what actually suppresses the ring.
 *
 * Deliberately NOT the same card with a different label: none of Hold / Mute / Transfer /
 * Hang up mean anything here — there is no longer a bridge to act on — and leaving them
 * on screen would invite an agent to press them.
 */
/**
 * Who else is on the call, and what can be done to each of them.
 *
 * Scrolls (`min-h-0 overflow-y-auto`) like the dial pad, and for the same reason: with
 * several parties this can outgrow a short viewport, and Hang up sits below it.
 *
 * The `⇄` swap shortcut appears ONLY at exactly two present parties, where "swap" has an
 * unambiguous meaning. With three it would be a guess about which two, and the per-party
 * hold buttons already say it precisely. See `conference-parties.ts`.
 */
function ConferenceCard({
  view,
  onHoldParty,
  onSwap,
  onMerge,
  onDrop,
}: {
  view: ConferenceStatus;
  onHoldParty: (partyId: string, held: boolean) => void;
  onSwap: () => void;
  onMerge: () => void;
  onDrop: (partyId: string) => void;
}) {
  const rows = partyRows(view);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t">
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {row.label}
              </span>
              <span
                className={[
                  'flex items-center gap-1 text-xs',
                  row.state === 'held'
                    ? 'text-amber-700'
                    : row.state === 'gone'
                      ? 'text-muted-foreground/60'
                      : 'text-muted-foreground',
                ].join(' ')}
              >
                {row.state === 'ringing' && (
                  <Loader2 size={11} className="shrink-0 animate-spin" />
                )}
                {row.status}
              </span>
            </span>

            {canSwap(view) && !row.held && row.state === 'connected' && (
              <button
                onClick={onSwap}
                title="Talk to the other person instead"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ArrowLeftRight size={14} />
              </button>
            )}
            <button
              onClick={() => onHoldParty(row.id, !row.held)}
              disabled={!row.canHold}
              title={row.held ? `Bring ${row.label} back` : `Hold ${row.label}`}
              className={[
                'rounded-md p-1.5 disabled:cursor-not-allowed disabled:opacity-30',
                row.held
                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')}
            >
              {row.held ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button
              onClick={() => onDrop(row.id)}
              disabled={!row.canDrop}
              title={`Remove ${row.label} from the call`}
              className="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <UserMinus size={14} />
            </button>
          </li>
        ))}
      </ul>

      {canMerge(view) && (
        <div className="border-t p-2">
          <button
            onClick={onMerge}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-teal-50 px-3 py-2 text-xs font-medium text-teal-800 hover:bg-teal-100"
          >
            <Users size={14} />
            Merge everyone
          </button>
        </div>
      )}
    </div>
  );
}

function TransferringCard({
  info,
  transfer,
  canTakeBack,
  onTakeBack,
  onOpenCompany,
  extra,
}: {
  info: IncomingCallInfo | null;
  transfer: TransferView | null;
  canTakeBack: boolean;
  onTakeBack: () => void;
  onOpenCompany: (companyId: number) => void;
  /**
   * The waiting-call banner and the call switcher, when there are other calls in hand.
   *
   * Null in the ordinary single-call transfer, which is what keeps this card exactly what
   * it has always been. This branch returns early from the main shell, so without this
   * the strip would not exist for the whole length of a transfer — leaving the agent with
   * no way back to a caller they have parked.
   */
  extra?: ReactNode;
}) {
  const name = transfer?.target.name ?? 'your colleague';
  const state = transfer?.state ?? 'ringing';
  const done = state === 'answered';
  const otherParty = info?.direction === 'outbound' ? info?.to : info?.from;

  const headline =
    state === 'answered'
      ? 'Transfer complete'
      : state === 'no-answer'
        ? 'Nobody picked up'
        : state === 'ended'
          ? 'Transfer finished'
          : 'Transferring…';

  const detail =
    state === 'answered'
      ? `${name} picked up`
      : state === 'no-answer'
        ? `${name} did not answer — the caller was sent to voicemail`
        : state === 'ended'
          ? 'The call has ended'
          : `Ringing ${name}…`;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[200] flex justify-center px-4">
      <div
        className={[
          'pointer-events-auto w-full max-w-sm rounded-xl border bg-background shadow-2xl',
          done ? 'border-green-400' : 'border-amber-300',
        ].join(' ')}
      >
        <div className="flex items-start gap-3 p-4">
          <div
            className={[
              'flex size-10 shrink-0 items-center justify-center rounded-full',
              done
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700',
            ].join(' ')}
          >
            {done ? <Check size={18} /> : <PhoneForwarded size={18} />}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {headline}
            </p>
            <p className="truncate text-sm font-semibold">
              {info?.fromName ||
                formatE164(otherParty) ||
                info?.from ||
                'Unknown caller'}
            </p>
            {info && (
              <button
                type="button"
                onClick={() => onOpenCompany(info.companyId)}
                className="mt-0.5 flex items-center gap-1 text-xs text-teal-700 hover:underline"
              >
                <Building2 size={12} />
                <span className="truncate">{info.companyName}</span>
              </button>
            )}
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              {state === 'ringing' && (
                <Loader2 size={12} className="shrink-0 animate-spin" />
              )}
              <span className="truncate">{detail}</span>
            </p>
          </div>
        </div>

        {/*
          Only offered while the fork this browser is holding is still live. Once the
          colleague answers, SignalWire cancels our branch and there is nothing left to
          accept — so the button disappears rather than failing when pressed.
        */}
        {canTakeBack && (
          <div className="flex gap-2 border-t p-3">
            <button
              onClick={onTakeBack}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-muted px-3 py-2 text-sm font-medium hover:bg-muted/70"
            >
              <Undo2 size={14} />
              Take it back
            </button>
          </div>
        )}
        {extra}
      </div>
    </div>
  );
}

/**
 * The in-call keypad.
 *
 * ── WHY IT IS INLINE AND NOT A DIALOG ─────────────────────────────────────────
 * `TransferPicker` is a shadcn `Dialog` and gets away with it because a transfer ends the
 * agent's involvement in the call. A dial pad is the opposite: it is used *while listening
 * to an IVR*, so a focus trap and a page-blocking backdrop are exactly wrong — and
 * `DialogContent` portals at `z-50`, i.e. BEHIND this overlay's own `z-[200]`.
 *
 * Owns its own `digits` so the parent can drop them with a `key` when the call sid
 * changes, and so a re-render of the card does not churn them.
 */
function DialPad({ onDigit }: { onDigit: (digit: string) => boolean }) {
  const [digits, setDigits] = useState('');
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Focus on open, which is what makes the keyboard handler below reachable at all.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  function press(key: string) {
    // The context is normally unlocked by NotificationContext's one-shot global listener
    // long before any call, but `resume()` is async — doing it here too costs nothing and
    // covers a genuinely cold tab. Only the local beep depends on it; the digit does not.
    unlockAudio();
    const ok = onDigit(key);
    if (!ok) {
      setFailed(true);
      return;
    }
    // Cleared on success, so a transient refusal does not leave the warning standing over
    // a pad that is now working.
    setFailed(false);
    const tones = dtmfTones(key);
    // Played for the same length the wire tone is held, or the echo stops meaning what it
    // looks like it means.
    if (tones) playDtmfTone(tones[0], tones[1], 160);
    setDigits((prev) => prev + key);
  }

  return (
    <div
      ref={ref}
      // ⚠️ tabIndex + a handler ON THIS CONTAINER, never a `window` listener. The overlay
      // follows the user onto every page for the whole call, so a document-level handler
      // would take digits typed into any field anywhere — and the usual
      // `e.target instanceof HTMLInputElement` guard misses `contentEditable`, which is
      // exactly what the email composer is. Scoping by focus makes that unreachable by
      // construction. Not a focus trap: Tab still leaves.
      tabIndex={-1}
      onKeyDown={(e) => {
        // Holding a key fires ~30 keydowns a second, which would be seconds of
        // machine-gun DTMF into somebody's IVR.
        if (e.repeat) return;
        if (!(DTMF_KEYS as readonly string[]).includes(e.key)) return;
        e.preventDefault();
        press(e.key);
      }}
      // `min-h-0` is load-bearing: a flex child defaults to `min-height:auto`, which
      // defeats `overflow-y-auto` and would let the card grow past the viewport and push
      // Hang up off-screen. `overscroll-contain` stops a scroll here chaining to the page
      // behind an overlay that is deliberately not modal.
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t px-3 pb-3 pt-2 outline-none"
    >
      <div className="mb-2 flex h-6 items-center justify-between gap-2">
        <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
          {failed ? 'Tones unavailable' : 'Sent'}
        </span>
        {failed ? (
          <span className="truncate text-xs text-amber-700">
            This call did not negotiate tone support
          </span>
        ) : (
          // Tail-clipped rather than wrapped: an unbounded string in a flex row would
          // stretch the pad below it. There is deliberately no backspace — a sent digit
          // cannot be recalled, and a delete key would imply otherwise.
          <span className="truncate text-right font-mono text-sm tabular-nums text-muted-foreground">
            {digits.slice(-24)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {DTMF_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            className="rounded-md bg-muted py-2.5 text-base font-medium tabular-nums hover:bg-muted/70 active:bg-muted/50"
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * "That call is done" — offered for five seconds after the OTHER side hangs up.
 *
 * ── WHY ONLY THAT ENDING ───────────────────────────────────────────────────────
 * The two endings are not symmetric. An agent who hangs up has "End & complete" under
 * their cursor at the moment they decide the call is finished. An agent whose caller
 * hangs up first has the whole card vanish out from under them, and the only route back
 * to that row is to go and find it in the inbox — which is exactly the friction that
 * leaves calls sitting uncompleted.
 *
 * ⚠️ It dismisses ITSELF. The card it replaces disappeared without being asked to, so a
 * replacement that demanded a click to get rid of would be a strictly worse trade. The
 * countdown is shown rather than implied so the five seconds do not feel like a glitch.
 */
function CompletePromptCard({ prompt }: { prompt: CompletePromptView }) {
  const { completeEndedCall, dismissCompletePrompt } = useSoftphoneActions();
  const [left, setLeft] = useState(() =>
    Math.max(0, Math.ceil((prompt.until - Date.now()) / 1000)),
  );

  // Derived from the deadline on every tick rather than decremented, so a throttled
  // background tab cannot leave the number stuck at 4 over a card that is already gone.
  useEffect(() => {
    const id = setInterval(
      () => setLeft(Math.max(0, Math.ceil((prompt.until - Date.now()) / 1000))),
      250,
    );
    return () => clearInterval(id);
  }, [prompt.until]);

  return (
    <div className="fixed bottom-4 right-4 z-[200] w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border bg-background shadow-2xl">
      <div className="flex items-start gap-3 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700">
          <PhoneOff size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Call ended
          </p>
          <p className="truncate text-sm font-semibold">{prompt.peer}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            They hung up. Clear it off the list?
          </p>
        </div>
        <button
          type="button"
          onClick={dismissCompletePrompt}
          aria-label="Dismiss"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <X size={15} />
        </button>
      </div>
      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={completeEndedCall}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600"
        >
          <CheckCheck size={15} />
          Mark complete
          <span className="ml-1 tabular-nums opacity-70">({left})</span>
        </button>
      </div>
    </div>
  );
}
