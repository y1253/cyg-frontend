import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** How long after the jump the anchor is held in place while the thread settles. */
export const HOLD_MS = 4000;

/**
 * Should a resize of the thread re-pin the anchor?
 *
 * Only inside the hold window, only for the anchor the hold was armed for, and never once
 * the user has moved the view themselves — taking the page back from somebody who is
 * scrolling is worse than the bug this fixes.
 */
export function shouldRepin(s: {
  elapsedMs: number;
  userInteracted: boolean;
  armedFor: string | null;
  anchorId: string;
}): boolean {
  return (
    s.armedFor !== null &&
    s.armedFor === s.anchorId &&
    !s.userInteracted &&
    s.elapsedMs >= 0 &&
    s.elapsedMs < HOLD_MS
  );
}

const USER_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/**
 * Keep the anchor message in view while the thread above it is still growing.
 *
 * ── WHY THE SINGLE JUMP IS NOT ENOUGH ─────────────────────────────────────────
 * The thread views jump to the anchor ONCE (`scrolledFor`), and that latch is deliberate:
 * it stops a sent reply from yanking the view back up. But pictures and videos above the
 * anchor finish loading AFTER the jump and grow from nothing to their full height, pushing
 * the anchor out of view — the reported "WhatsApp opens at the top instead of the message
 * I clicked". So for `HOLD_MS` after the jump, every size change of the message list
 * re-pins the anchor, until the user touches the page.
 *
 * `arm(anchorId)` is called by the view right where it makes its one jump.
 */
export function useHoldAnchorInView(
  anchorRef: RefObject<HTMLElement | null>,
  listRef: RefObject<HTMLElement | null>,
  anchorId: string,
): (armedFor: string) => void {
  const stop = useRef<(() => void) | null>(null);
  const anchorIdRef = useRef(anchorId);
  useEffect(() => {
    anchorIdRef.current = anchorId;
  }, [anchorId]);

  // Unmount ends any hold in flight.
  useEffect(() => () => stop.current?.(), []);

  return useCallback(
    (armedFor: string) => {
      stop.current?.();
      const list = listRef.current;
      if (!list || typeof ResizeObserver === 'undefined') return;

      const startedAt = Date.now();
      let userInteracted = false;
      const onUser = () => {
        userInteracted = true;
        stop.current?.();
      };

      const observer = new ResizeObserver(() => {
        if (
          !shouldRepin({
            elapsedMs: Date.now() - startedAt,
            userInteracted,
            armedFor,
            anchorId: anchorIdRef.current,
          })
        ) {
          stop.current?.();
          return;
        }
        anchorRef.current?.scrollIntoView({ block: 'end' });
      });
      observer.observe(list);
      for (const e of USER_EVENTS) {
        window.addEventListener(e, onUser, { capture: true, passive: true });
      }
      const timer = window.setTimeout(() => stop.current?.(), HOLD_MS);

      stop.current = () => {
        observer.disconnect();
        for (const e of USER_EVENTS) {
          window.removeEventListener(e, onUser, { capture: true });
        }
        window.clearTimeout(timer);
        stop.current = null;
      };
    },
    [anchorRef, listRef],
  );
}
