import type { RealtimeEvent, RealtimeTopic } from '@/api/realtime';

/**
 * Which React Query keys a topic makes stale.
 *
 * ── WHY ONE TABLE ──────────────────────────────────────────────────────────────
 * The alternative is a handler per feature, and the failure mode there is silent: a key
 * gets renamed, one of the copies is not updated, and that surface simply keeps showing
 * the old number with nothing to indicate why. That has already happened once in this
 * codebase — `SoftphoneContext` invalidated `['active-call', id]` while the query was
 * registered as `['phone-active-call', id]`, so hanging up refreshed nothing at all and
 * the "On a call" banner sat there until its own 4s poll.
 *
 * ⚠️ Every key here must match a real `queryKey`. A typo is not a type error.
 */
export function keysFor(event: RealtimeEvent): unknown[][] {
  const id = event.companyId;
  const perCompany = (...keys: string[]) =>
    id === undefined ? [] : keys.map((k) => [k, id]);

  switch (event.topic) {
    // A call finished: the row's own state, both counts, and every badge derived
    // from them. `phone-ringing` too — a call that ended is not ringing.
    case 'call-ended':
      return [
        ...perCompany(
          'phone-timeline',
          'phone-counts',
          'phone-ringing',
          'phone-active-call',
        ),
        ['inbox-summary'],
        ['internal-calls'],
        ['internal-call-counts'],
      ];

    // Mid-call progress, or a call placed. The timeline only — nothing has been
    // read, completed or ended, so the badges cannot have moved.
    case 'phone':
      return perCompany('phone-timeline');

    case 'phone-state':
      return [...perCompany('phone-timeline', 'phone-counts'), ['inbox-summary']];

    case 'active-call':
      return perCompany('phone-active-call', 'phone-ringing');

    // The payload is consumed directly by the softphone (see `useRealtime`), but the
    // company's own views still need to know a call is ringing on the line.
    case 'ringing':
      return perCompany('phone-ringing', 'phone-active-call');

    // An inbound text or WhatsApp message is a NEW unread item, so it moves the bell
    // and the dashboard badge as well as the thread.
    case 'sms':
      return [
        ...perCompany('phone-timeline', 'phone-counts', 'sms-thread'),
        ['inbox-summary'],
      ];

    case 'whatsapp':
      return [
        ...perCompany(
          'whatsapp-timeline',
          'whatsapp-counts',
          'whatsapp-thread',
        ),
        ['inbox-summary'],
      ];

    // Account state, not messages: connected, disconnected, or a Generate step moved.
    case 'whatsapp-account':
      return perCompany('whatsapp-account');

    // Gmail and Outlook share these query keys — `useGmailEmails` is the hook both
    // providers run through, so this covers a mailbox of either kind. The open thread
    // too: a reply that lands in it is the commonest "new mail" of all.
    case 'email':
      return [
        ...perCompany(
          'gmail-emails',
          'gmail-email-thread',
          'gmail-unread-count',
          'gmail-uncompleted-count',
        ),
        ['inbox-summary'],
      ];

    // Google Chat and Teams — again one set of keys for both providers.
    case 'chat':
      return [
        ...perCompany(
          'gmail-chats',
          'gmail-chat-thread',
          'gmail-unread-count',
          'gmail-uncompleted-count',
        ),
        ['inbox-summary'],
      ];

    // A summary settled. The detail view's recordings query carries it, and the
    // timeline row shows its one-liner. Internal summaries arrive with no company.
    case 'call-summary':
      return id === undefined
        ? [['internal-call-recordings'], ['internal-calls']]
        : perCompany('call-recordings', 'phone-timeline');

    // Per-user, and not keyed by company: the workspace inbox is one list.
    case 'internal-message':
      return [
        ['internal-messages'],
        ['internal-uncompleted-count'],
        ['internal-unread-count'],
        ['internal-message-thread'],
        ['inbox-summary'],
      ];

    case 'internal-call':
      return [['internal-calls'], ['internal-call-counts'], ['inbox-summary']];

    case 'presence':
      return [['phone-presence']];

    // This user gained or lost a company (or changed role): the dashboard's list, and
    // the bell, whose scope is exactly "my companies".
    case 'assignments':
      return [['companies'], ['inbox-summary']];

    // Nothing to refresh: the event exists to wake the channel — the poll's next request
    // is refused (`fetchRealtime`), and the socket is closed with 4401.
    case 'session':
      return [];
  }

  // An unrecognised topic is a NEWER SERVER talking to an older bundle — this is an
  // installed PWA, so that is a real state, not a theoretical one. Refresh nothing
  // rather than guessing; the ordinary polls still cover it.
  return exhaustive(event.topic);
}

function exhaustive(topic: never): unknown[][] {
  void topic;
  return [];
}

/**
 * What to refresh after a `reset` — i.e. when the client was away long enough that the
 * server could no longer say what it missed — and after every RECONNECT, since nothing
 * was listening while the connection was down.
 *
 * Deliberately the whole communications surface rather than a replay: the point of a
 * reset is that the specific events are GONE, so anything narrower would be a guess.
 */
export const RESET_KEYS: unknown[][] = [
  ['inbox-summary'],
  ['phone-timeline'],
  ['phone-counts'],
  ['phone-active-call'],
  ['phone-ringing'],
  ['phone-presence'],
  ['gmail-emails'],
  ['gmail-email-thread'],
  ['gmail-chats'],
  ['gmail-chat-thread'],
  ['gmail-unread-count'],
  ['gmail-uncompleted-count'],
  ['whatsapp-timeline'],
  ['whatsapp-counts'],
  ['whatsapp-thread'],
  ['whatsapp-account'],
  ['sms-thread'],
  ['call-recordings'],
  ['internal-call-recordings'],
  ['companies'],
  ['internal-messages'],
  ['internal-message-thread'],
  ['internal-uncompleted-count'],
  ['internal-unread-count'],
  ['internal-calls'],
  ['internal-call-counts'],
];

/** Topics whose only job is to hand the softphone a call event. */
export function isCallEventTopic(topic: RealtimeTopic): boolean {
  return topic === 'ringing';
}
