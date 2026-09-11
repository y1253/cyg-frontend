import { describe, expect, it } from 'vitest';
import {
  canMerge,
  canSwap,
  holdAllLabel,
  partyRows,
  presentParties,
  showConferenceCard,
} from './conference-parties';
import type { ConferenceStatus, PartyState } from '@/api/phone';

function view(
  states: PartyState[],
  over: Partial<ConferenceStatus> = {},
): ConferenceStatus {
  const parties = states.map((state, i) => ({
    id: i === 0 ? 'peer' : `p${i + 1}`,
    label: `Party ${i + 1}`,
    state,
  }));
  return {
    active: true,
    parties,
    merged: !parties.some((p) => p.state === 'held'),
    canAdd: true,
    canSwap: false,
    ...over,
  };
}

describe('partyRows', () => {
  it('labels each state in words the agent can act on', () => {
    const rows = partyRows(view(['connected', 'held', 'ringing', 'gone']));
    expect(rows.map((r) => r.status)).toEqual([
      'On the call',
      'On hold',
      'Ringing…',
      'Left the call',
    ]);
  });

  it('cannot hold somebody whose phone is still ringing', () => {
    // They have not joined the room, so there is no participant to park.
    const [ringing] = partyRows(view(['ringing']));
    expect(ringing.canHold).toBe(false);
    // But they CAN be dropped — that is how you give up on a party who is not answering.
    expect(ringing.canDrop).toBe(true);
  });

  it('keeps a row for somebody who left, with its controls off', () => {
    // Silently removing a row mid-call reads as a glitch, and "they hung up" is
    // information the agent wants.
    const [gone] = partyRows(view(['gone']));
    expect(gone.status).toBe('Left the call');
    expect(gone.canHold).toBe(false);
    expect(gone.canDrop).toBe(false);
  });

  it('counts only the people still on the call as present', () => {
    expect(presentParties(view(['connected', 'gone', 'held']))).toHaveLength(2);
  });
});

describe('canSwap — exactly two, both actually there', () => {
  it('is offered with two connected parties', () => {
    expect(canSwap(view(['connected', 'held']))).toBe(true);
  });

  it('is not offered with one', () => {
    expect(canSwap(view(['connected']))).toBe(false);
  });

  it('is not offered with three — swap has no meaning then', () => {
    expect(canSwap(view(['connected', 'held', 'held']))).toBe(false);
  });

  it('is not offered while one of the two is still ringing', () => {
    // Swapping to a phone that has not been picked up puts the agent in silence.
    expect(canSwap(view(['connected', 'ringing']))).toBe(false);
  });

  it('ignores a party who has left when counting', () => {
    expect(canSwap(view(['connected', 'held', 'gone']))).toBe(true);
  });
});

describe('merge and the Hold button', () => {
  it('offers merge only while somebody is parked', () => {
    expect(canMerge(view(['connected', 'held']))).toBe(true);
    expect(canMerge(view(['connected', 'connected']))).toBe(false);
  });

  it('flips the whole-room button between holding and merging', () => {
    // Merge is the only way back from a hold, so the button has to offer it.
    expect(holdAllLabel(view(['connected', 'connected']))).toBe('Hold all');
    expect(holdAllLabel(view(['connected', 'held']))).toBe('Merge all');
  });

  it('does not count somebody who left as holding the room un-merged', () => {
    expect(canMerge(view(['connected', 'gone']))).toBe(false);
  });
});

describe('showConferenceCard', () => {
  it('is hidden for an ordinary two-party call', () => {
    expect(showConferenceCard(null)).toBe(false);
    expect(showConferenceCard(view(['connected']))).toBe(false);
  });

  it('is shown once somebody has been added', () => {
    expect(showConferenceCard(view(['connected', 'ringing']))).toBe(true);
  });

  it('is hidden once the room is no longer active', () => {
    expect(
      showConferenceCard(view(['connected', 'connected'], { active: false })),
    ).toBe(false);
  });
});
