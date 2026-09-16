import { describe, expect, it } from 'vitest';
import { invitePairsWith } from './invite-pairing';
import type { InviteMarkers, PairableEvent } from './invite-pairing';

const unmarked: InviteMarkers = { call: null, leg: null };
const marked = (call: string): InviteMarkers => ({ call, leg: null });
const legged = (leg: string): InviteMarkers => ({ call: null, leg });

function event(over: Partial<PairableEvent> = {}): PairableEvent {
  return {
    companyId: 1,
    companyName: 'Acme',
    from: '+14385551212',
    callSid: 'sid-1',
    at: Date.now(),
    ...over,
  } as PairableEvent;
}

/**
 * Every case here is a RACE in production — two INVITEs milliseconds apart, forked to
 * every browser on one shared SIP credential. A manual test passes them by luck, which is
 * exactly why they are pinned here.
 */
describe('invitePairsWith — who may claim an INVITE', () => {
  describe("an internal CALLER's own leg (unmarked, outbound)", () => {
    const own = event({ direction: 'outbound', callSid: 'internal-1' });

    it('is claimed by the tab that dialled', () => {
      expect(invitePairsWith(unmarked, own, true)).toBe(true);
    });

    /**
     * The whole bug. A colleague whose own outbound company call had just ended still
     * held a pending event for up to 60s; their browser took the caller's unmarked leg,
     * matched by order and — outbound events auto-answer — ANSWERED it. The caller got no
     * overlay and no audio, and an uninvolved member of staff was on the call.
     */
    it('is REFUSED by a tab that did not dial, however fresh its own event', () => {
      expect(invitePairsWith(unmarked, own, false)).toBe(false);
    });

    it('is refused by the caller’s own second tab too', () => {
      // Same rule, and it is what stops both tabs accepting and the loser's teardown
      // tearing the overlay off the tab being watched.
      expect(invitePairsWith(unmarked, own, false)).toBe(false);
    });
  });

  /**
   * ⚠️ The regression this change could otherwise have caused. An inbound company call
   * arrives UNMARKED whenever `<Sip>` URI parameters are not delivered as SIP headers —
   * which is unverified against the live account and is the reason order-matching exists.
   * Requiring a dial intent for those would break every inbound call on the fallback path.
   */
  describe('an INBOUND call', () => {
    const incoming = event({ direction: 'inbound' });

    it('still pairs with no dial intent at all', () => {
      expect(invitePairsWith(unmarked, incoming, false)).toBe(true);
    });

    it('pairs regardless of intent', () => {
      expect(invitePairsWith(unmarked, incoming, true)).toBe(true);
    });

    it('treats an event from an older build (no direction) as inbound', () => {
      expect(invitePairsWith(unmarked, event(), false)).toBe(true);
    });
  });

  describe('markers still win when present', () => {
    it("pairs an internal CALLEE's event only with its own token", () => {
      const callee = event({ token: 'tok-a' } as Partial<PairableEvent>);
      expect(invitePairsWith(marked('tok-a'), callee, false)).toBe(true);
      expect(invitePairsWith(marked('tok-b'), callee, false)).toBe(false);
      expect(invitePairsWith(unmarked, callee, true)).toBe(false);
    });

    it("refuses somebody else's marked internal leg for a token-less event", () => {
      // Intent must not override a marker: the marker is the stronger signal.
      expect(invitePairsWith(marked('tok-a'), event({ direction: 'outbound' }), true)).toBe(
        false,
      );
    });

    it('matches a company leg on the call sid', () => {
      const company = event({ callSid: 'sid-9', direction: 'inbound' });
      expect(invitePairsWith(legged('sid-9'), company, false)).toBe(true);
      expect(invitePairsWith(legged('sid-other'), company, false)).toBe(false);
    });
  });
});
