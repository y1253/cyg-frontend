import { Building2, Pause, Phone, PhoneIncoming, PhoneOff } from 'lucide-react';
import type { CallRow } from '@/components/Phone/call-slots';

/**
 * The calls in hand, and the one asking to be let in.
 *
 * ── WHY TWO COMPONENTS AND NOT ONE LIST ────────────────────────────────────────
 * A waiting call and a parked call need different things from the agent. A parked call
 * has one action — go back to it — so its row IS the button. A waiting call has three
 * (answer, hang up and answer, send to voicemail), which is a decision, and burying a
 * decision in a list row is how it gets missed while somebody is ringing.
 *
 * Both are `shrink-0` with a FIXED max height, never `flex-1`: the card permits exactly
 * one `min-h-0 flex-1 overflow-y-auto` child, and Hang up lives below them.
 */

const STATE_DOT: Record<CallRow['state'], string> = {
  active: 'bg-green-500',
  held: 'bg-amber-500',
  ringing: 'bg-teal-500',
  transferring: 'bg-muted-foreground',
};

/**
 * A call ringing while the agent is already talking to somebody.
 *
 * Teal with a pulsing ring, matching `RingingCallBanner` in the Communications tab — the
 * same event, so it should look like the same thing wherever the agent happens to be.
 */
export function WaitingCallBanner({
  row,
  currentCompany,
  onAnswer,
  onEndAndAnswer,
  onDecline,
}: {
  row: CallRow;
  /** Named in the button hints, so neither destructive choice is a guess. */
  currentCompany: string | null;
  onAnswer: () => void;
  onEndAndAnswer: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="shrink-0 border-t border-teal-200 bg-teal-50/70 p-3">
      <div className="flex items-start gap-2.5">
        <span className="relative mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
          <Phone size={13} />
          {/* A quiet pulse: the agent is mid-conversation, so this says "now" without
              becoming a second thing shouting at them. */}
          <span className="absolute inset-0 animate-ping rounded-full bg-teal-400/40" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-teal-800">
            Call waiting
          </p>
          <p className="flex items-center gap-1 truncate text-xs font-semibold text-teal-900">
            <Building2 size={11} className="shrink-0" />
            <span className="truncate">{row.company}</span>
          </p>
          <p className="truncate text-xs text-teal-800">{row.party}</p>
        </div>
      </div>
      {/* A grid, for the reason SECONDARY_BTN gives: a long label must not be able to
          re-wrap three choices into an order the agent did not expect. */}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={onAnswer}
          title={
            currentCompany
              ? `Puts ${currentCompany} on hold`
              : 'Answer this call'
          }
          className="flex items-center justify-center gap-1 rounded-md bg-green-600 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-green-500"
        >
          <Phone size={12} />
          Answer
        </button>
        <button
          type="button"
          onClick={onEndAndAnswer}
          title={
            currentCompany
              ? `Hangs up on ${currentCompany}`
              : 'Ends the current call first'
          }
          className="flex items-center justify-center gap-1 rounded-md bg-red-600 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-red-500"
        >
          <PhoneIncoming size={12} />
          End &amp; answer
        </button>
        <button
          type="button"
          onClick={onDecline}
          title="Sends the caller to voicemail"
          className="flex items-center justify-center gap-1 rounded-md border bg-background px-2 py-1.5 text-[11px] font-medium hover:bg-muted"
        >
          <PhoneOff size={12} />
          Decline
        </button>
      </div>
    </div>
  );
}

/**
 * Every answered call, with the current one highlighted. Click a row to go to it.
 *
 * Switching parks whoever the agent is on, so the row is the whole control — there is
 * deliberately no per-row Resume button beside it. One action per row, no ambiguity about
 * which call a click applies to.
 */
export function CallSwitcher({
  rows,
  maxHeightClass,
  onSwitch,
}: {
  rows: CallRow[];
  maxHeightClass: string;
  onSwitch: (callId: string) => void;
}) {
  return (
    <div
      className={`shrink-0 overflow-y-auto overscroll-contain border-t ${maxHeightClass}`}
    >
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              disabled={row.isActive}
              onClick={() => onSwitch(row.id)}
              className={[
                'flex w-full items-center gap-2 px-3 py-2 text-left',
                row.isActive
                  ? 'cursor-default bg-muted/60'
                  : 'hover:bg-muted/40',
              ].join(' ')}
            >
              <span
                className={`size-2 shrink-0 rounded-full ${STATE_DOT[row.state]}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 truncate text-xs font-semibold">
                  <Building2 size={11} className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{row.company}</span>
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {row.party} · {row.status}
                </span>
              </span>
              {row.state === 'held' && (
                <Pause size={13} className="shrink-0 text-amber-600" />
              )}
              {row.isActive && (
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  On
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
