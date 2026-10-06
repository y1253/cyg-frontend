/**
 * Is the realtime channel delivering events right now — over either transport?
 *
 * ── WHAT IT DRIVES ─────────────────────────────────────────────────────────────
 * Every `refetchInterval` in the app. While the channel is up, the server TELLS the
 * browser when something changed, so the polls drop to a 5-minute backstop
 * (`BACKSTOP_MS`); the moment it drops, they return to their normal rates — exactly the
 * arrangement the channel used to sit beside, so an outage degrades to how the app has
 * always behaved rather than to a stale screen.
 *
 * A module store rather than context, for the reason `unreadFeedDismiss.ts` gives: two
 * dozen hooks read it, and none of them should need a provider in scope to do so.
 */

import { useSyncExternalStore } from 'react';

/**
 * How often a poll still runs while the channel is up. Not zero: it is the backstop for
 * a publish site somebody forgot, which would otherwise leave a surface stale until the
 * user navigated away.
 */
export const BACKSTOP_MS = 5 * 60_000;

let connected = false;
const listeners = new Set<() => void>();

export function setRealtimeConnected(value: boolean): void {
  if (connected === value) return;
  connected = value;
  for (const l of listeners) l();
}

export function isRealtimeConnected(): boolean {
  return connected;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRealtimeConnected(): boolean {
  return useSyncExternalStore(subscribe, isRealtimeConnected, () => false);
}

/** The poll interval to use: `normalMs` while the channel is down, the backstop while up. */
export function backstopMs(normalMs: number, isConnected: boolean): number {
  return isConnected ? Math.max(normalMs, BACKSTOP_MS) : normalMs;
}

/** `backstopMs` for a hook: re-renders (and so re-arms the poll) when the channel flips. */
export function useBackstop(normalMs: number): number {
  return backstopMs(normalMs, useRealtimeConnected());
}
