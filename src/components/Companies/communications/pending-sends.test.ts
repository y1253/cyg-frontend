import { describe, expect, it } from 'vitest';
import {
  PENDING_PREFIX,
  isPendingId,
  mergePending,
  newPendingId,
  outboxLabel,
} from './pending-sends';

describe('pending ids', () => {
  /**
   * The namespaces the mark/complete routes validate are `swsms:` and `wa:`. A row that
   * is not on the server yet must never carry an id that looks like one they could act
   * on.
   */
  it('are their own namespace, not the inbox ones', () => {
    const id = newPendingId();
    expect(isPendingId(id)).toBe(true);
    expect(id.startsWith(PENDING_PREFIX)).toBe(true);
    expect(id.startsWith('swsms:')).toBe(false);
    expect(id.startsWith('wa:')).toBe(false);
  });

  it('does not mistake a real id for a pending one', () => {
    expect(isPendingId('swsms:abc')).toBe(false);
    expect(isPendingId('wa:42')).toBe(false);
  });

  it('mints a fresh id each time', () => {
    expect(newPendingId()).not.toBe(newPendingId());
  });
});

describe('mergePending', () => {
  const at = (s: string) => ({ at: s });

  it('places an in-flight message after the server rows it follows', () => {
    const server = [
      { id: 'swsms:1', ...at('2026-09-22T10:00:00Z') },
      { id: 'swsms:2', ...at('2026-09-22T10:01:00Z') },
    ];
    const pending = [{ id: 'pending:x', ...at('2026-09-22T10:02:00Z') }];
    expect(mergePending(server, pending).map((m) => m.id)).toEqual([
      'swsms:1',
      'swsms:2',
      'pending:x',
    ]);
  });

  /**
   * WhatsApp timestamps arrive in whole seconds, so a burst shares one `at` — without
   * the id tie-break the order would be arbitrary and could change between renders.
   */
  it('breaks a same-timestamp tie on id, stably', () => {
    const same = '2026-09-22T10:00:00Z';
    const server = [
      { id: 'wa:2', ...at(same) },
      { id: 'wa:1', ...at(same) },
    ];
    expect(mergePending(server, []).map((m) => m.id)).toEqual(['wa:1', 'wa:2']);
  });

  it('is the server list unchanged when nothing is in flight', () => {
    const server = [{ id: 'swsms:1', ...at('2026-09-22T10:00:00Z') }];
    expect(mergePending(server, [])).toEqual(server);
  });
});

describe('outboxLabel', () => {
  it('names each queue state the way the thread and the inbox both show it', () => {
    expect(outboxLabel('MATCHING')).toBe('Preparing…');
    expect(outboxLabel('SENDING')).toBe('Preparing…');
    expect(outboxLabel('AWAITING_TEMPLATE')).toBe('Waiting for WhatsApp approval…');
    expect(outboxLabel('FAILED')).toBe('Not sent');
  });

  it('a queued inbox row is a pending id, so no mark/complete action can reach it', () => {
    expect(isPendingId('pending:outbox:7')).toBe(true);
  });
});
