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

/**
 * step12 — Hetzner showed 1,619 click-to-calls from 9 users all ringing ONE SIP address.
 * Two members of staff dialling within a second or two each auto-answered whichever
 * unmarked leg arrived first, and talked to the other's customer.
 */
describe('invitePairsWith — the X-Cyg-Dial marker (step12)', () => {
  const dialled = (dial: string): InviteMarkers => ({ call: null, leg: null, dial });
  const mine = event({ direction: 'outbound', callSid: 'sid-a', dialToken: 'dial-a' });
  const theirs = event({ direction: 'outbound', callSid: 'sid-b', dialToken: 'dial-b' });

  it("pairs a dialler's INVITE only with the event naming the same dial", () => {
    expect(invitePairsWith(dialled('dial-a'), mine, true)).toBe(true);
    expect(invitePairsWith(dialled('dial-b'), mine, true)).toBe(false);
  });

  it('two concurrent dials: each tab takes only its own leg, in either arrival order', () => {
    // A's browser holds both INVITEs and only A's event.
    expect(invitePairsWith(dialled('dial-b'), mine, true)).toBe(false);
    expect(invitePairsWith(dialled('dial-a'), mine, true)).toBe(true);
    // B's browser, the mirror image.
    expect(invitePairsWith(dialled('dial-a'), theirs, true)).toBe(false);
    expect(invitePairsWith(dialled('dial-b'), theirs, true)).toBe(true);
  });

  it('a dial-marked INVITE never pairs with a ringing INBOUND call', () => {
    const inbound = event({ direction: 'inbound', callSid: 'sid-in' });
    expect(invitePairsWith(dialled('dial-a'), inbound, false)).toBe(false);
  });

  it("an added colleague's inbound event pairs with its own dial-marked leg", () => {
    const added = event({ direction: 'inbound', callSid: 'sid-c', dialToken: 'dial-c' });
    expect(invitePairsWith(dialled('dial-c'), added, false)).toBe(true);
  });

  it('a dial-marked INVITE never answers an internal callee event', () => {
    const callee = event({ direction: 'inbound', token: 'tok-1' });
    expect(invitePairsWith(dialled('dial-a'), callee, false)).toBe(false);
  });

  it('an unmarked INVITE still falls back to dialedHere for a dial event (advisory for now)', () => {
    expect(invitePairsWith(unmarked, mine, true)).toBe(true);
    expect(invitePairsWith(unmarked, mine, false)).toBe(false);
  });

  it('a leg-marked INVITE does not pair with a dial event of another sid', () => {
    expect(invitePairsWith(legged('sid-x'), mine, true)).toBe(false);
  });
});
