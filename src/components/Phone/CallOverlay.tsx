import {
  Check,
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
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatE164 } from '@/lib/phone';
import {
  useSoftphone,
  useSoftphoneActions,
  type IncomingCallInfo,
  type TransferView,
} from '@/context/SoftphoneContext';
import { TransferPicker } from '@/components/Phone/TransferPicker';

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
  const { phase, info, transfer, canTakeBack, muted, held, seconds } =
    useSoftphone();
  const { answer, hangup, toggleMute, toggleHold, blindTransfer, takeBack } =
    useSoftphoneActions();
  const navigate = useNavigate();
  const [transferOpen, setTransferOpen] = useState(false);

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

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[200] flex justify-center px-4">
      <div
        className={[
          'pointer-events-auto w-full max-w-sm rounded-xl border bg-background shadow-2xl',
          ringing
            ? 'border-teal-400 ring-2 ring-teal-400/40 animate-pulse'
            : 'border-border',
        ].join(' ')}
      >
        <div className="flex items-start gap-3 p-4">
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
              {formatE164(otherParty) || (outgoing ? 'Dialling' : 'Unknown caller')}
            </p>
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

        <div className="flex flex-wrap gap-2 border-t p-3">
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
              <button
                onClick={toggleHold}
                className={[
                  'flex min-w-[7rem] flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium',
                  held
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    : 'bg-muted hover:bg-muted/70',
                ].join(' ')}
              >
                {held ? <Play size={14} /> : <Pause size={14} />}
                {held ? 'Resume' : 'Hold'}
              </button>
              <button
                onClick={toggleMute}
                className={[
                  'flex min-w-[7rem] flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium',
                  muted
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    : 'bg-muted hover:bg-muted/70',
                ].join(' ')}
              >
                {muted ? <MicOff size={14} /> : <Mic size={14} />}
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button
                onClick={() => setTransferOpen(true)}
                className="flex min-w-[7rem] flex-1 items-center justify-center gap-1.5 rounded-md bg-muted px-3 py-2 text-sm font-medium hover:bg-muted/70"
              >
                <PhoneForwarded size={14} />
                Transfer
              </button>
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
              {formatE164(otherParty) || info?.from || 'Unknown caller'}
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
