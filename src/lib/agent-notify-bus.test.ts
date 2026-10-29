import { describe, expect, it, vi } from 'vitest';
import {
  agentNoticeOf,
  agentNoticeTitle,
  emitAgentNotice,
  onAgentNotice,
} from './agent-notify-bus';

const notice = {
  companyId: 9,
  companyName: 'Acme',
  agentId: 3,
  agentName: 'Bookkeeper',
  messageId: 501,
  kind: 'QUESTION',
  todoId: null,
  body: 'Which account?',
};

describe('agent-notify-bus', () => {
  it('delivers to every subscriber until it unsubscribes', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = onAgentNotice(a);
    const offB = onAgentNotice(b);
    emitAgentNotice(notice);
    offA();
    emitAgentNotice(notice);
    offB();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('keeps going when one subscriber throws', () => {
    const ok = vi.fn();
    const offBad = onAgentNotice(() => {
      throw new Error('boom');
    });
    const offOk = onAgentNotice(ok);
    emitAgentNotice(notice);
    offBad();
    offOk();
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('refuses a payload without its ids', () => {
    expect(agentNoticeOf(null)).toBeNull();
    expect(agentNoticeOf({ agentId: 3, body: 'x' })).toBeNull();
    expect(agentNoticeOf(notice)).toEqual(notice);
  });

  it('says who wrote, where, and whether they are waiting', () => {
    expect(agentNoticeTitle(notice)).toBe('🤖 Bookkeeper has a question · Acme');
    expect(agentNoticeTitle({ ...notice, kind: 'APPROVAL_REQUEST' })).toBe(
      '🤖 Bookkeeper asks for approval · Acme',
    );
    expect(agentNoticeTitle({ ...notice, kind: 'TASK_UPDATE' })).toBe(
      '🤖 Bookkeeper · Acme',
    );
  });
});
