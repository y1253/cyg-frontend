/**
 * ONE browser tab holds the phone (step2.md, 2026-11-05).
 *
 * Every tab used to register the softphone on the shared SIP credential, so every tab got
 * every INVITE, rang, ran its own ringtone and asked `/pending-calls` four times per call.
 * Now the tab holding the Web Lock `cyg-softphone` is the only one with a SIP UserAgent;
 * the others MIRROR its call state over a `BroadcastChannel` and RELAY their button
 * presses to it. The overlay therefore looks and works the same in every tab — only the
 * audio (and the microphone) lives in the holder.
 *
 * Rules that keep it safe:
 *  - The lock is never stolen. The holder keeps it until the tab closes or signs out, so a
 *    live call can never be moved out from under the agent. The next tab in the lock's
 *    queue takes over when the holder goes.
 *  - No Web Locks or no BroadcastChannel → every tab is `solo` = the old behaviour.
 *  - The RINGTONE plays in the tab the user last focused (`TONE_OWNER_KEY`), which is the
 *    tab with a user gesture behind it; with no owner recorded the holder plays it.
 *
 * Everything here is pure or a thin wrapper, so the protocol is testable without a browser.
 */

export const SOFTPHONE_LOCK = 'cyg-softphone';
export const SOFTPHONE_CHANNEL = 'cyg-softphone';
/** localStorage: the id of the tab that should play the ringtone. */
export const TONE_OWNER_KEY = 'cyg-softphone-tone-tab';

export type TabRole = 'solo' | 'holder' | 'follower';
export type ToneKind = 'ring' | 'waiting' | null;

export type TabMessage =
  /** A follower opened and wants the current state. */
  | { t: 'hello'; from: string }
  /** The holder's state after every change. */
  | {
      t: 'snapshot';
      from: string;
      state: unknown;
      tone: ToneKind;
      tabRinging: boolean;
    }
  /** The holder is letting the phone go (sign-out / tab closing). */
  | { t: 'gone'; from: string }
  /** A follower pressed a button. */
  | { t: 'action'; from: string; id: string; name: string; args: unknown[] }
  /** The holder's answer to an action that returns a promise. */
  | { t: 'result'; to: string; id: string; ok: boolean; value?: unknown; error?: string };

const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Narrow a channel message without trusting it. */
export function parseTabMessage(raw: unknown): TabMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  switch (m.t) {
    case 'hello':
    case 'gone':
      return str(m.from) ? { t: m.t, from: m.from } : null;
    case 'snapshot':
      if (!str(m.from) || !m.state || typeof m.state !== 'object') return null;
      return {
        t: 'snapshot',
        from: m.from,
        state: m.state,
        tone: m.tone === 'ring' || m.tone === 'waiting' ? m.tone : null,
        tabRinging: m.tabRinging === true,
      };
    case 'action':
      if (!str(m.from) || !str(m.id) || !str(m.name) || !Array.isArray(m.args)) {
        return null;
      }
      return { t: 'action', from: m.from, id: m.id, name: m.name, args: m.args };
    case 'result':
      if (!str(m.to) || !str(m.id) || typeof m.ok !== 'boolean') return null;
      return {
        t: 'result',
        to: m.to,
        id: m.id,
        ok: m.ok,
        value: m.value,
        error: typeof m.error === 'string' ? m.error : undefined,
      };
    default:
      return null;
  }
}

/** Can this browser run one-tab-holds-the-phone at all? */
export function tabsSupported(
  nav: { locks?: unknown } | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator,
  hasChannel: boolean = typeof BroadcastChannel !== 'undefined',
): boolean {
  const locks = nav?.locks as { request?: unknown } | undefined;
  return hasChannel && typeof locks?.request === 'function';
}

/** Should THIS tab play the ringtone / call-waiting pips? */
export function isToneTab(opts: {
  me: string;
  owner: string | null;
  isHolder: boolean;
}): boolean {
  return opts.owner ? opts.owner === opts.me : opts.isHolder;
}

/**
 * The actions whose result the caller awaits. Everything else is fire-and-forget, which
 * is what those buttons already were.
 */
export const ASYNC_ACTIONS = new Set([
  'blindTransfer',
  'addCall',
  'holdParty',
  'swapParties',
  'mergeParties',
  'dropParty',
]);

/** Pseudo-actions that carry a relayed `DialHandle`'s callbacks. */
export const DIAL_PLACED = '__dialPlaced';
export const DIAL_DONE = '__dialDone';
/** Pseudo-action: a notification's Answer / Decline landed in a follower. */
export const SW_ACTION = '__swAction';

/** A follower's side of the relay: send an action, await its result when it has one. */
export class RelayClient {
  private seq = 0;
  private pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  private readonly me: string;
  private readonly post: (msg: TabMessage) => void;
  private readonly timeoutMs: number;

  constructor(me: string, post: (msg: TabMessage) => void, timeoutMs = 30_000) {
    this.me = me;
    this.post = post;
    this.timeoutMs = timeoutMs;
  }

  /** Fire and forget. */
  send(name: string, args: unknown[]): void {
    this.post({ t: 'action', from: this.me, id: this.nextId(), name, args });
  }

  /** Send and await the holder's answer. Rejects on a holder error or no answer. */
  call(name: string, args: unknown[]): Promise<unknown> {
    const id = this.nextId();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('The phone tab did not answer — try again from that tab.'));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.post({ t: 'action', from: this.me, id, name, args });
    });
  }

  /** Feed every `result` message here. */
  onResult(msg: Extract<TabMessage, { t: 'result' }>): void {
    if (msg.to !== this.me) return;
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.value);
    else p.reject(new Error(msg.error || 'The phone tab could not do that.'));
  }

  /** The holder went away: nothing pending will be answered. */
  failAll(reason: string): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
      this.pending.delete(id);
    }
  }

  private nextId(): string {
    return `${this.me}:${++this.seq}`;
  }
}

/** Mint a tab id. Not security-sensitive — it only names a tab on a same-origin channel. */
export function newTabId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
