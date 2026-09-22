import { describe, expect, it } from 'vitest';
import type { ActiveCall } from '@/api/phone';
import {
  callBlockedReason,
  formatElapsed,
  shouldShowActiveBanner,
  type LocalCallState,
} from './call-busy';

const IDLE: LocalCallState = { calls: [] };

function active(over: Partial<ActiveCall> = {}): ActiveCall {
  return {
    companyId: 7,
    callSid: 'sid-1',
    direction: 'outbound',
    state: 'active',
    userName: 'Sarah',
    isViewer: false,
    peer: '+15145550000',
    peerName: null,
    elapsedSec: 12,
    ...over,
  };
}

describe('callBlockedReason', () => {
  it('allows dialling on a quiet line', () => {
    expect(
      callBlockedReason({ activeCall: null, local: IDLE, companyId: 7, starting: false }),
    ).toBeNull();
  });

  it('blocks for a call the server knows about, naming who is on it', () => {
    expect(
      callBlockedReason({ activeCall: active(), local: IDLE, companyId: 7, starting: false }),
    ).toBe('Sarah is on a call on this line.');
  });

  it('tells the same user it is their own call in another tab', () => {
    expect(
      callBlockedReason({
        activeCall: active({ isViewer: true }),
        local: IDLE,
        companyId: 7,
        starting: false,
      }),
    ).toMatch(/another tab or browser/);
  });

  it('blocks while an incoming call rings', () => {
    expect(
      callBlockedReason({
        activeCall: active({ direction: 'inbound', state: 'ringing', userName: null }),
        local: IDLE,
        companyId: 7,
        starting: false,
      }),
    ).toBe('An incoming call is ringing on this line.');
  });

  it("blocks instantly for this browser's own call on this company, before any poll", () => {
    expect(
      callBlockedReason({
        activeCall: null,
        local: { calls: [{ companyId: 7, kind: 'company' }] },
        companyId: 7,
        starting: false,
      }),
    ).toBe('You are on a call on this line.');
  });

  it('blocks while a call is still being placed', () => {
    expect(
      callBlockedReason({ activeCall: null, local: IDLE, companyId: 7, starting: true }),
    ).not.toBeNull();
  });

  it("does not block for this browser's call on ANOTHER company", () => {
    expect(
      callBlockedReason({
        activeCall: null,
        local: { calls: [{ companyId: 8 }] },
        companyId: 7,
        starting: false,
      }),
    ).toBeNull();
  });

  it('does not block for an internal staff call, whose companyId is a workspace', () => {
    expect(
      callBlockedReason({
        activeCall: null,
        local: { calls: [{ companyId: 7, kind: 'internal' }] },
        companyId: 7,
        starting: false,
      }),
    ).toBeNull();
  });
});

describe('shouldShowActiveBanner', () => {
  it('shows the banner to everyone not on the call', () => {
    expect(shouldShowActiveBanner(active(), IDLE, 7, false)).toBe(true);
  });

  it('hides it in the browser that is on the call, which has the call card', () => {
    const local: LocalCallState = { calls: [{ companyId: 7 }] };
    expect(shouldShowActiveBanner(active({ isViewer: true }), local, 7, false)).toBe(
      false,
    );
  });

  it('shows nothing when the line is quiet', () => {
    expect(shouldShowActiveBanner(null, IDLE, 7, false)).toBe(false);
  });

  /**
   * ⚠️ THE regression test for "a call appears before the call".
   *
   * The server marks the line busy in `ringAndDial`, before the LaML it returns has
   * played a note — and with a greeting configured, LaML plays the whole `<Say>` before
   * `<Dial>` emits any INVITE. So this banner used to announce an incoming call for the
   * length of the greeting, offering no way to answer it and no way to end it.
   */
  it('hides an inbound ring while no browser here is holding the INVITE', () => {
    const ringing = active({ direction: 'inbound', state: 'ringing' });
    expect(shouldShowActiveBanner(ringing, IDLE, 7, false)).toBe(false);
  });

  it('shows that same ring the moment this browser IS holding one', () => {
    const ringing = active({ direction: 'inbound', state: 'ringing' });
    expect(shouldShowActiveBanner(ringing, IDLE, 7, true)).toBe(true);
  });

  it('still shows an ANSWERED call with no INVITE held', () => {
    // The gate is only for the ring. A live call is a state that explains why the Call
    // buttons are disabled, and it was never something the viewer could act on.
    const live = active({ direction: 'inbound', state: 'active' });
    expect(shouldShowActiveBanner(live, IDLE, 7, false)).toBe(true);
  });

  it('still shows an OUTBOUND call that is ringing', () => {
    // Somebody here placed it; there is no INVITE for anyone else to hold.
    const out = active({ direction: 'outbound', state: 'ringing' });
    expect(shouldShowActiveBanner(out, IDLE, 7, false)).toBe(true);
  });
});

describe('formatElapsed', () => {
  it('formats minutes and hours', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(65)).toBe('01:05');
    expect(formatElapsed(3725)).toBe('1:02:05');
  });
});
