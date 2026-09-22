import type { ActiveCall } from '@/api/phone';

/**
 * "May this tab dial out from this company's number?" — the one place that is decided.
 *
 * Three sources, because each covers a gap in the others:
 * - the SERVER, which knows about a call in any browser, but only as fresh as its poll;
 * - THIS browser's softphone, which knows instantly when it is on this company's call;
 * - a call still being STARTED here, before either of the above can know.
 *
 * The server refuses a busy dial on its own, so this is what keeps the buttons honest,
 * not what keeps the line safe.
 */

/**
 * The softphone fields this needs. Structural, so the test needs no React.
 *
 * ⚠️ A LIST of calls, not one. Call waiting means the agent can be on company A while
 * company B is parked — and with only "the active call" to look at, company B's tab would
 * offer a Call button for a line this very browser is holding. The server refuses the dial
 * either way; this is what keeps the button honest about why.
 */
export interface LocalCallState {
  calls: { companyId: number; kind?: 'company' | 'internal' }[];
}

export function isOnThisCompanysCall(
  local: LocalCallState,
  companyId: number,
): boolean {
  return local.calls.some(
    (call) =>
      call.companyId === companyId &&
      // An internal call's companyId is a staff workspace id, never a client company.
      call.kind !== 'internal',
  );
}

export function callBlockedReason(input: {
  activeCall: ActiveCall | null | undefined;
  local: LocalCallState;
  companyId: number;
  starting: boolean;
}): string | null {
  const { activeCall, local, companyId, starting } = input;
  if (isOnThisCompanysCall(local, companyId)) {
    return 'You are on a call on this line.';
  }
  if (starting) return 'A call is being placed from this line.';
  if (activeCall) {
    if (activeCall.direction === 'inbound' && activeCall.state === 'ringing') {
      return 'An incoming call is ringing on this line.';
    }
    if (activeCall.isViewer) {
      return 'You are already on a call on this line, in another tab or browser.';
    }
    return `${activeCall.userName ?? 'Someone'} is on a call on this line.`;
  }
  return null;
}

/**
 * The busy banner is for people NOT on the call. The browser that is on it already has the
 * floating call card, so repeating it there is noise.
 *
 * ── WHY A RINGING CALL NEEDS `hasHeldInvite` ──────────────────────────────────
 * The server marks the company's line busy in `ringAndDial`, which runs BEFORE the LaML
 * it returns has played a note. When a greeting is configured, LaML runs its verbs in
 * document order: the caller hears the whole `<Say>` first, and only then does `<Dial>`
 * emit the SIP INVITE that reaches any browser. So for the length of the greeting this
 * banner announced "Incoming call ringing" while there was nothing to answer and no way
 * to end it — the reported "a call comes up before the call, with no option to end".
 *
 * Holding an INVITE is exactly "the caller's phone is actually ringing here now", and
 * every registered browser gets one (they share a SIP credential), so nobody who could
 * act loses the banner. The actionable `RingingCallBanner` is gated the same way, and
 * takes over at the same instant.
 *
 * ⚠️ Only the RINGING case is gated. An answered call stays visible to everyone: it is a
 * state that explains why the Call buttons are disabled, and it is not something the
 * viewer was ever offered a way to act on.
 */
export function shouldShowActiveBanner(
  activeCall: ActiveCall | null | undefined,
  local: LocalCallState,
  companyId: number,
  hasHeldInvite: boolean,
): activeCall is ActiveCall {
  if (!activeCall || isOnThisCompanysCall(local, companyId)) return false;
  const ringingIn =
    activeCall.direction === 'inbound' && activeCall.state === 'ringing';
  return ringingIn ? hasHeldInvite : true;
}

/** 65 → "01:05", 3725 → "1:02:05". */
export function formatElapsed(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
