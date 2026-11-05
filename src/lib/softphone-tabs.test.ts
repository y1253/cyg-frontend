import { describe, expect, it, vi } from 'vitest';
import {
  RelayClient,
  isToneTab,
  parseTabMessage,
  tabsSupported,
  type TabMessage,
} from './softphone-tabs';

describe('parseTabMessage', () => {
  it('accepts every well-formed message', () => {
    expect(parseTabMessage({ t: 'hello', from: 'a' })).toEqual({ t: 'hello', from: 'a' });
    expect(
      parseTabMessage({ t: 'snapshot', from: 'a', state: { calls: [] }, tone: 'ring', tabRinging: true }),
    ).toEqual({ t: 'snapshot', from: 'a', state: { calls: [] }, tone: 'ring', tabRinging: true });
    expect(
      parseTabMessage({ t: 'action', from: 'a', id: '1', name: 'answer', args: [] }),
    ).toEqual({ t: 'action', from: 'a', id: '1', name: 'answer', args: [] });
    expect(parseTabMessage({ t: 'result', to: 'a', id: '1', ok: false, error: 'x' })).toMatchObject({
      ok: false,
      error: 'x',
    });
  });

  it('refuses anything malformed — the channel is same-origin, not trusted code', () => {
    expect(parseTabMessage(null)).toBeNull();
    expect(parseTabMessage({ t: 'nope' })).toBeNull();
    expect(parseTabMessage({ t: 'hello' })).toBeNull();
    expect(parseTabMessage({ t: 'snapshot', from: 'a', state: null })).toBeNull();
    expect(parseTabMessage({ t: 'action', from: 'a', id: '1', name: 'x', args: 'no' })).toBeNull();
    expect(parseTabMessage({ t: 'result', to: 'a', id: '1' })).toBeNull();
  });

  it('an unknown tone is no tone', () => {
    const m = parseTabMessage({ t: 'snapshot', from: 'a', state: {}, tone: 'siren' });
    expect(m).toMatchObject({ tone: null, tabRinging: false });
  });
});

describe('tabsSupported', () => {
  it('needs both Web Locks and BroadcastChannel', () => {
    const locks = { request: () => undefined };
    expect(tabsSupported({ locks }, true)).toBe(true);
    expect(tabsSupported({ locks }, false)).toBe(false);
    expect(tabsSupported({}, true)).toBe(false);
    expect(tabsSupported({ locks: {} }, true)).toBe(false);
  });
});

describe('isToneTab', () => {
  it('the last-focused tab rings', () => {
    expect(isToneTab({ me: 'a', owner: 'a', isHolder: false })).toBe(true);
    expect(isToneTab({ me: 'b', owner: 'a', isHolder: true })).toBe(false);
  });
  it('with no owner recorded the holder rings', () => {
    expect(isToneTab({ me: 'a', owner: null, isHolder: true })).toBe(true);
    expect(isToneTab({ me: 'b', owner: null, isHolder: false })).toBe(false);
  });
});

describe('RelayClient', () => {
  it('sends fire-and-forget actions', () => {
    const post = vi.fn();
    new RelayClient('me', post).send('answer', []);
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ t: 'action', from: 'me', name: 'answer', args: [] }),
    );
  });

  it('resolves and rejects from the holder’s results, and ignores other tabs’', async () => {
    const sent: TabMessage[] = [];
    const relay = new RelayClient('me', (m) => sent.push(m));
    const ok = relay.call('blindTransfer', [7]);
    const bad = relay.call('addCall', [{ userId: 3 }]);
    const [a, b] = sent as Extract<TabMessage, { t: 'action' }>[];
    relay.onResult({ t: 'result', to: 'other', id: a.id, ok: false });
    relay.onResult({ t: 'result', to: 'me', id: a.id, ok: true, value: 1 });
    relay.onResult({ t: 'result', to: 'me', id: b.id, ok: false, error: 'busy' });
    await expect(ok).resolves.toBe(1);
    await expect(bad).rejects.toThrow('busy');
  });

  it('times out when the holder never answers', async () => {
    vi.useFakeTimers();
    const relay = new RelayClient('me', () => undefined, 1000);
    const p = relay.call('swapParties', []);
    vi.advanceTimersByTime(1001);
    await expect(p).rejects.toThrow(/did not answer/);
    vi.useRealTimers();
  });

  it('fails everything pending when the holder goes', async () => {
    const relay = new RelayClient('me', () => undefined);
    const p = relay.call('mergeParties', []);
    relay.failAll('gone');
    await expect(p).rejects.toThrow('gone');
  });
});
