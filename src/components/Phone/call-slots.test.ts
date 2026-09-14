import { describe, expect, it } from 'vitest';
import type { CallView, IncomingCallInfo } from '@/context/SoftphoneContext';
import {
  canQuickSwap,
  otherCallId,
  partyLabel,
  showSwitcher,
  switcherMaxHeightClass,
  switcherRows,
  waitingRow,
} from './call-slots';

function info(over: Partial<IncomingCallInfo> = {}): IncomingCallInfo {
  return {
    companyId: 7,
    companyName: 'Acme Bookkeeping',
    from: '+15145550000',
    callSid: 'sid-1',
    at: Date.now(),
    direction: 'inbound',
    ...over,
  };
}

function call(over: Partial<CallView> = {}): CallView {
  return {
    id: 'call-1',
    info: info(),
    phase: 'active',
    held: false,
    heldAuto: false,
    muted: false,
    seconds: 0,
    isActive: false,
    conference: null,
    transfer: null,
    ...over,
  };
}

describe('partyLabel', () => {
  it('prefers a saved contact name and keeps the number underneath', () => {
    expect(partyLabel(info({ fromName: 'Dana Roy' }))).toEqual({
      party: 'Dana Roy',
      number: '(514) 555-0000',
    });
  });

  it('never names an OUTBOUND call after fromName', () => {
    // `fromName` names `from`, which on an outbound call is OUR support number. Labelling
    // the dialled number with it would be worse than showing no name at all.
    expect(
      partyLabel(
        info({ direction: 'outbound', to: '+15145551111', fromName: 'Us' }),
      ),
    ).toEqual({ party: '(514) 555-1111', number: null });
  });

  it('falls back to a wording that says which direction it is', () => {
    expect(partyLabel(info({ from: '' })).party).toBe('Unknown caller');
    expect(
      partyLabel(info({ direction: 'outbound', to: '' })).party,
    ).toBe('Dialling');
  });
});

describe('switcherRows', () => {
  it('shows the company name on every row', () => {
    // The whole point of the strip: with two clients in hand, the caller's number does
    // not answer "who is this?".
    const rows = switcherRows([
      call({ id: 'a', isActive: true }),
      call({ id: 'b', info: info({ companyName: 'Beta Ltd' }), held: true }),
    ]);
    expect(rows.map((r) => r.company)).toEqual(['Acme Bookkeeping', 'Beta Ltd']);
  });

  it('EXCLUDES a waiting call — it has its own banner with real actions', () => {
    const rows = switcherRows([
      call({ id: 'a', isActive: true }),
      call({ id: 'b', phase: 'ringing' }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['a']);
  });

  it('says on-call, on-hold and transferring apart, with a clock on the live ones', () => {
    const rows = switcherRows([
      call({ id: 'a', seconds: 134 }),
      call({ id: 'b', held: true, seconds: 65 }),
      call({ id: 'c', phase: 'transferring' }),
    ]);
    expect(rows.map((r) => r.status)).toEqual([
      'On call · 2:14',
      'On hold · 1:05',
      'Transferring…',
    ]);
  });
});

describe('waitingRow', () => {
  it('is the ringing call that is NOT the one the agent is on', () => {
    const row = waitingRow(
      [call({ id: 'a', isActive: true }), call({ id: 'b', phase: 'ringing' })],
      'a',
    );
    expect(row?.id).toBe('b');
    expect(row?.status).toBe('Ringing…');
  });

  it('is null for the FIRST call ringing on an idle phone', () => {
    // That call is active AND ringing. Treating it as "waiting" would put a second
    // Answer button on the card for the call the card is already offering.
    expect(waitingRow([call({ id: 'a', phase: 'ringing', isActive: true })], 'a'))
      .toBeNull();
  });
});

describe('the switcher only appears when there is a choice', () => {
  it('stays hidden for one call', () => {
    expect(showSwitcher([call({ id: 'a', isActive: true })])).toBe(false);
  });

  it('stays hidden for one call plus a ringing one', () => {
    // The waiting banner covers that case; a one-row strip beneath it says nothing.
    expect(
      showSwitcher([
        call({ id: 'a', isActive: true }),
        call({ id: 'b', phase: 'ringing' }),
      ]),
    ).toBe(false);
  });

  it('appears once two calls are answered', () => {
    expect(
      showSwitcher([call({ id: 'a', isActive: true }), call({ id: 'b', held: true })]),
    ).toBe(true);
  });
});

describe('quick swap', () => {
  const two = [
    call({ id: 'a', isActive: true }),
    call({ id: 'b', held: true }),
  ];

  it('is offered at exactly two answered calls, and names the other one', () => {
    expect(canQuickSwap(two)).toBe(true);
    expect(otherCallId(two, 'a')).toBe('b');
  });

  it('is NOT offered at three — "swap" would be a guess about which two', () => {
    const three = [...two, call({ id: 'c', held: true })];
    expect(canQuickSwap(three)).toBe(false);
    expect(otherCallId(three, 'a')).toBeNull();
  });

  it('ignores a ringing call when counting', () => {
    expect(canQuickSwap([...two, call({ id: 'c', phase: 'ringing' })])).toBe(true);
  });
});

describe('switcherMaxHeightClass', () => {
  it('is a FIXED cap, never flex-1, and tightens while a call is waiting', () => {
    // The card allows exactly one `min-h-0 flex-1 overflow-y-auto` child; a second would
    // split the height with the dial pad and push Hang up off a short viewport.
    expect(switcherMaxHeightClass(false)).toBe('max-h-40');
    expect(switcherMaxHeightClass(true)).toBe('max-h-24');
  });
});
