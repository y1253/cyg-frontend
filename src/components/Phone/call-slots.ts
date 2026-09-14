import { formatE164 } from '@/lib/phone';
import type { CallView, IncomingCallInfo } from '@/context/SoftphoneContext';

/**
 * What the call switcher renders, derived from the calls in hand.
 *
 * Pure and separate from the component, following `conference-parties.ts` next door and
 * for the same reason: the rules about which call is offered, and what each row claims
 * about it, are small, easy to get subtly wrong, and impossible to check by looking at a
 * screenshot of two simultaneous calls that are not happening.
 */

export interface CallRow {
  id: string;
  /**
   * The company name — or, on an internal call, the colleague's.
   *
   * ALWAYS rendered. With two calls in hand from two different clients, "who is this?" is
   * the entire question the strip exists to answer, and a caller's number does not answer
   * it. `CallEvent.companyName` carries the colleague's name on a staff call, which is
   * what makes one field enough for both.
   */
  company: string;
  /** The caller's saved name, or their formatted number. */
  party: string;
  /** The number, kept under the name when a contact name was used. Null otherwise. */
  number: string | null;
  state: 'active' | 'held' | 'ringing' | 'transferring';
  /** `On call · 2:14` / `On hold · 2:14` / `Ringing…` / `Transferring…` */
  status: string;
  isActive: boolean;
}

/** 65 → "1:05", 3725 → "62:05". Matches the overlay's own clock. */
export function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Who the agent is talking to, and the number underneath.
 *
 * ⚠️ A LIFT, not a new rule: `CallOverlay`'s header inlines exactly this, including the
 * inbound-only caveat on `fromName`. The switcher needs the identical answer, and two
 * copies of it are how the card and the strip start disagreeing about who is on line 2.
 *
 * Inbound only for the name: `fromName` names `from`, and on an outbound call the other
 * party is `to`. Labelling a dialled number with the name of whoever we happen to be
 * calling FROM would be worse than showing no name at all.
 */
export function partyLabel(info: IncomingCallInfo): {
  party: string;
  number: string | null;
} {
  const outgoing = info.direction === 'outbound';
  const other = outgoing ? info.to : info.from;
  const name = outgoing ? undefined : info.fromName;
  const formatted = formatE164(other) || null;
  if (name) return { party: name, number: formatted };
  return {
    party: formatted ?? (outgoing ? 'Dialling' : 'Unknown caller'),
    number: null,
  };
}

function stateOf(call: CallView): CallRow['state'] {
  if (call.phase === 'transferring') return 'transferring';
  if (call.phase === 'ringing') return 'ringing';
  return call.held ? 'held' : 'active';
}

function statusOf(call: CallView): string {
  switch (stateOf(call)) {
    case 'transferring':
      return 'Transferring…';
    case 'ringing':
      return call.info.direction === 'outbound' ? 'Calling…' : 'Ringing…';
    case 'held':
      return `On hold · ${mmss(call.seconds)}`;
    case 'active':
      return `On call · ${mmss(call.seconds)}`;
  }
}

export function toRow(call: CallView): CallRow {
  const { party, number } = partyLabel(call.info);
  return {
    id: call.id,
    company: call.info.companyName,
    party,
    number,
    state: stateOf(call),
    status: statusOf(call),
    isActive: call.isActive,
  };
}

/**
 * The rows of the switcher strip: every ANSWERED call, including the active one.
 *
 * A waiting call is deliberately excluded — it has its own banner, with Answer / Decline /
 * End & answer on it, and a duplicate row offering only "switch to" would be both noise
 * and a worse action than the three it already has.
 */
export function switcherRows(calls: CallView[]): CallRow[] {
  return calls.filter((c) => c.phase !== 'ringing').map(toRow);
}

/** The call ringing while the agent is on another one, if any. */
export function waitingRow(
  calls: CallView[],
  activeCallId: string | null,
): CallRow | null {
  const waiting = calls.find(
    (c) => c.phase === 'ringing' && c.id !== activeCallId,
  );
  return waiting ? toRow(waiting) : null;
}

/** Only worth showing once there is a choice to make. */
export function showSwitcher(calls: CallView[]): boolean {
  return switcherRows(calls).length > 1;
}

/**
 * Is a one-press swap unambiguous?
 *
 * Exactly two answered calls, mirroring `canSwap` in `conference-parties.ts`: with three
 * in hand "swap" would be a guess about which two, and the strip's rows already say it
 * precisely.
 */
export function canQuickSwap(calls: CallView[]): boolean {
  return switcherRows(calls).length === 2;
}

/** The other answered call, when there are exactly two. */
export function otherCallId(
  calls: CallView[],
  activeCallId: string | null,
): string | null {
  if (!canQuickSwap(calls)) return null;
  return switcherRows(calls).find((r) => r.id !== activeCallId)?.id ?? null;
}

/**
 * How tall the strip may grow.
 *
 * ⚠️ A fixed cap, never `flex-1`. The overlay card permits exactly ONE `min-h-0 flex-1
 * overflow-y-auto` child (the dial pad, or the conference list), and a second one would
 * split the free height between them — halving the pad and, on a short viewport, pushing
 * Hang up off the screen. Tighter while a call is waiting, because the waiting banner is
 * already spending ~92px above it.
 */
export function switcherMaxHeightClass(hasWaiting: boolean): string {
  return hasWaiting ? 'max-h-24' : 'max-h-40';
}
