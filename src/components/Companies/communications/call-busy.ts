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

/** The softphone fields this needs. Structural, so the test needs no React. */
export interface LocalCallState {
  phase: 'idle' | 'ringing' | 'active' | 'transferring';
  info: { companyId: number; kind?: 'company' | 'internal' } | null;
}

export function isOnThisCompanysCall(
  local: LocalCallState,
  companyId: number,
): boolean {
  return (
    local.phase !== 'idle' &&
    local.info !== null &&
    local.info.companyId === companyId &&
    // An internal call's companyId is a staff workspace id, never a client company.
    local.info.kind !== 'internal'
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
 */
export function shouldShowActiveBanner(
  activeCall: ActiveCall | null | undefined,
  local: LocalCallState,
  companyId: number,
): activeCall is ActiveCall {
  return !!activeCall && !isOnThisCompanysCall(local, companyId);
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
