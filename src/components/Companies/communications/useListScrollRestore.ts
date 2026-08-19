import { useLayoutEffect, useRef } from 'react';

/**
 * Keeps the INBOX LIST's scroll offset across opening and closing a message, so
 * returning from a message lands on the row it was opened from instead of at the
 * top.
 *
 * ⚠️ This must live in the component that OUTLIVES the list — the list unmounts
 * while a detail view is open, which is precisely what it has to survive.
 *
 * The list scrolls the page container (CompanyDetailPage's `contentRef`), which
 * survives the switch to a detail view — but the detail view is `h-full`, so the
 * container has nothing to overflow and the browser clamps its scrollTop to 0. The
 * offset is therefore already lost by the time Back runs, and has to be captured in
 * the open handlers instead.
 */
export function useListScrollRestore({
  active,
  listOpen,
}: {
  active: boolean;
  /** True when the list — not a detail view — is the thing on screen. */
  listOpen: boolean;
}) {
  // Root of the inbox list view. It is not itself a scroller — it exists to reach
  // that container, and because it unmounts while a detail view is open it doubles
  // as a "list is showing" guard.
  const listRootRef = useRef<HTMLDivElement>(null);
  const listScrollTop = useRef(0);
  const restoreListScroll = useRef(false); // armed on open, consumed on the way back

  // Class-name coupling, same as the infinite-scroll observer root: the tab renders
  // inside a `display: contents` wrapper, so `closest` walks up to the page's scroll
  // container. It resolves to null while a detail view is open (the list root is
  // unmounted) — which is the guard that stops in-thread navigation from overwriting
  // the saved offset with a clamped 0.
  const saveListScroll = () => {
    const el = listRootRef.current?.closest('.overflow-y-auto') as HTMLElement | null | undefined;
    if (!el) return;
    listScrollTop.current = el.scrollTop;
    restoreListScroll.current = true;
  };

  useLayoutEffect(() => {
    if (!active || !listOpen) return;
    if (!restoreListScroll.current) return; // only after a message was opened, not on every re-render
    const el = listRootRef.current?.closest('.overflow-y-auto') as HTMLElement | null | undefined;
    if (!el) return;
    el.scrollTop = listScrollTop.current;
    restoreListScroll.current = false;
  }, [active, listOpen]);

  return { listRootRef, saveListScroll };
}
