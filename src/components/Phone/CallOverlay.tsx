import {
  Check,
  Grid3x3,
  Loader2,
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
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatE164 } from '@/lib/phone';
import type { ConferenceStatus } from '@/api/phone';
import { DTMF_KEYS, dtmfTones } from '@/lib/dtmf';
import { playDtmfTone, unlockAudio } from '@/lib/notificationSound';
import {
  useSoftphone,
  useSoftphoneActions,
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
  } = useSoftphoneActions();
  const navigate = useNavigate();
  const [transferOpen, setTransferOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [padOpen, setPadOpen] = useState(false);

  /**
   * More than two people on the line.
   *
   * Drives the controls that change meaning in a conference — never `phase`, which stays
   * `'active'` for the reason `SoftphoneState.conference` gives.
   */
  const inConference = showConferenceCard(conference);

  if (phase === 'idle') return null;

  if (phase === 'transferring') {
    return (
      <>
        <TransferringCard
          info={info}
          transfer={transfer}
          canTakeBack={canTakeBack}
          onTakeBack={takeBack}
          onOpenCompany={(id) => navigate(`/companies/${id}`)}
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

  const ringing = phase === 'ringing';
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
        className={[
          // A flex column with a viewport cap, because the dial pad can add ~256px and
          // HANG UP IS AT THE BOTTOM — a card taller than the window would push the one
          // control you can never afford to lose off-screen. Only the pad scrolls.
          // `dvh`, not `vh`: a mobile URL bar makes them differ.
          'pointer-events-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col',
          'rounded-xl border bg-background shadow-2xl',
          ringing
            ? 'border-teal-400 ring-2 ring-teal-400/40 animate-pulse'
            : 'border-border',
        ].join(' ')}
      >
        <div className="flex shrink-0 items-start gap-3 p-4">
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
              <button
                onClick={hangup}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                <PhoneOff size={14} />
                Decline
              </button>
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
              </div>
              <button
                onClick={hangup}
                className="flex min-w-[7rem] flex-1 items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                <PhoneOff size={14} />
                Hang up
              </button>
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
}: {
  info: IncomingCallInfo | null;
  transfer: TransferView | null;
  canTakeBack: boolean;
  onTakeBack: () => void;
  onOpenCompany: (companyId: number) => void;
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
