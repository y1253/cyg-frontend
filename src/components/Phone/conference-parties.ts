import type { ConferenceStatus, PartyState } from '@/api/phone';

/**
 * What the conference card renders, derived from the server's view.
 *
 * Pure, and separate from the component, because this is where the client's test culture
 * lives — `unread-feed.test.ts`, `kind-filter.test.ts`. The rules about which control is
 * offered are small, easy to get subtly wrong, and impossible to check by looking at a
 * screenshot of a call that is not happening.
 */

export interface PartyRow {
  id: string;
  label: string;
  state: PartyState;
  /** Wording under the name. */
  status: string;
  /** Can this person be parked or released right now? */
  canHold: boolean;
  /** Is this person currently parked? Drives the button's icon and colour. */
  held: boolean;
  /** Can they be removed? */
  canDrop: boolean;
}

const STATUS: Record<PartyState, string> = {
  ringing: 'Ringing…',
  connected: 'On the call',
  held: 'On hold',
  gone: 'Left the call',
};

/**
 * One row per person, in the order the server lists them.
 *
 * A `gone` party keeps its row rather than disappearing: somebody who hung up ten seconds
 * ago is information the agent wants, and silently removing a row mid-call reads as a
 * glitch. Its controls are off, because there is nobody left to act on.
 */
export function partyRows(view: ConferenceStatus): PartyRow[] {
  return view.parties.map((p) => ({
    id: p.id,
    label: p.label,
    state: p.state,
    status: STATUS[p.state],
    // A ringing party has not joined the room, so there is no participant to hold.
    canHold: p.state === 'connected' || p.state === 'held',
    held: p.state === 'held',
    canDrop: p.state !== 'gone',
  }));
}

/** Everybody still on the call — what the controls below are counted against. */
export function presentParties(view: ConferenceStatus): PartyRow[] {
  return partyRows(view).filter((p) => p.state !== 'gone');
}

/**
 * Is the Swap shortcut worth showing?
 *
 * Only with exactly two people to swap BETWEEN, and only once both have actually joined:
 * swapping to somebody whose phone is still ringing would put the agent in silence. With
 * three or more, "swap" has no unambiguous meaning and the per-party hold buttons are the
 * honest control. The server enforces the same rule — this only decides what is offered.
 */
export function canSwap(view: ConferenceStatus): boolean {
  const present = presentParties(view);
  return (
    present.length === 2 && present.every((p) => p.state !== 'ringing')
  );
}

/** Merge is only meaningful while somebody is parked. */
export function canMerge(view: ConferenceStatus): boolean {
  return presentParties(view).some((p) => p.held);
}

/**
 * What the Hold button says.
 *
 * In a conference it is a whole-room control: park everyone, or bring everyone back.
 * Per-person holds live on the rows.
 */
export function holdAllLabel(view: ConferenceStatus): string {
  return canMerge(view) ? 'Merge all' : 'Hold all';
}

/**
 * Should the conference card be rendered at all?
 *
 * A conference with nobody but the original peer left is just an ordinary two-party call
 * again, and showing a one-row "conference" card over it is noise. The call itself is
 * unaffected either way — this is presentation only.
 */
export function showConferenceCard(view: ConferenceStatus | null): boolean {
  if (!view || !view.active) return false;
  return view.parties.length > 1;
}
