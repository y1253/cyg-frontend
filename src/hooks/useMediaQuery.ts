import { useSyncExternalStore } from 'react';

/**
 * Is this media query matching right now?
 *
 * ── WHY A JS HOOK AT ALL, IN A TAILWIND CODEBASE ───────────────────────────────
 * Breakpoints belong in CSS, and everywhere else in this app they are `sm:` / `md:`
 * classes. This exists for the cases a class cannot reach:
 *
 *  - the docked composer's position is an INLINE style written by the drag and resize
 *    hooks, and an inline style beats any class, so `md:` cannot undo it;
 *  - the drag and resize handlers themselves should not be attached at all on a phone,
 *    which is a question about behaviour rather than appearance.
 *
 * Reach for a class first. Use this only when the answer changes what the component
 * DOES, not merely how it looks.
 *
 * `useSyncExternalStore` rather than `useState` + an effect: the first render already
 * has the right answer, so a composer does not mount docked and then jump to full
 * screen. It also gives React a correct store to read during hydration.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      // Guarded because this is also called from vitest's node environment, where
      // `matchMedia` does not exist.
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () =>
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia(query).matches
        : false,
    // Server snapshot: assume the desktop layout, which is what this app has always
    // rendered. There is no SSR here, so this only guards the vitest environment.
    () => false,
  );
}

/**
 * Below Tailwind's `md` (768px) — the breakpoint at which the sidebar becomes a drawer.
 *
 * Spelled once, here, so a component cannot pick a different number than the CSS does.
 */
export function useIsPhone(): boolean {
  return useMediaQuery('(max-width: 767px)');
}
