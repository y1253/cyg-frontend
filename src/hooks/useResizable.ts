import { useLayoutEffect, useRef } from 'react';
import {
  clampSize,
  COMPOSER_HEADER,
  type ComposerPos,
  type ComposerSize,
} from '@/components/Companies/composer-layout';

/**
 * Drag-to-resize from the window's top-left corner.
 *
 * Sibling of `useDraggable` and deliberately built the same way: pointer events so
 * mouse, touch and pen are one path; the new size written straight to the DOM while
 * the pointer is down and committed to React state once, on release — a setState per
 * frame would re-render every open composer on every mouse move.
 *
 * Top-left because a parked window sits against the bottom-right of the screen, so
 * that is the only corner facing into the page. The corner being dragged moves and
 * the opposite one stays put, which is what makes the gesture feel like grabbing the
 * window rather than nudging it.
 *
 * Anchoring is normalised on pointer-down: a parked window is right/bottom anchored,
 * so it is frozen to left/top first (exactly as the drag hook does) and everything
 * after that is one code path. That also means a resize *un-parks* the window — it
 * commits a position as well as a size, and so stops competing for a slot in the
 * bottom row, where its new width would otherwise overlap its neighbour.
 */
export function useResizable({
  rootRef,
  bodyRef,
  onCommit,
}: {
  rootRef: React.RefObject<HTMLDivElement | null>;
  /** The region below the title bar — the part that actually carries a height. */
  bodyRef: React.RefObject<HTMLDivElement | null>;
  onCommit: (size: ComposerSize, pos: ComposerPos) => void;
}) {
  const live = useRef<{
    pointerId: number;
    /** The corner that must not move. */
    right: number;
    bottom: number;
    /** Where inside the grip the pointer went down. */
    dx: number;
    dy: number;
    /** Title-bar height, measured rather than assumed. */
    headerH: number;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const write = (
    x: number,
    y: number,
    w: number,
    bodyH: number,
  ) => {
    const el = rootRef.current;
    const body = bodyRef.current;
    if (!el) return;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.width = `${w}px`;
    if (body) body.style.height = `${bodyH}px`;
  };

  // No deps, on purpose — the same reason as in `useDraggable`. A render caused by
  // some other window (a send progressing, another composer opening) re-applies this
  // one's React style and would otherwise snap it back mid-gesture.
  useLayoutEffect(() => {
    const d = live.current;
    if (d) write(d.x, d.y, d.w, d.h);
  });

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const bodyR = bodyRef.current?.getBoundingClientRect();
    // Measured, because the title bar grows when it carries a "from" line.
    const headerH = bodyR ? Math.round(r.height - bodyR.height) : COMPOSER_HEADER;
    live.current = {
      pointerId: e.pointerId,
      right: r.right,
      bottom: r.bottom,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      headerH,
      x: r.left,
      y: r.top,
      w: r.width,
      h: Math.max(0, r.height - headerH),
    };
    // Freeze where it already is before swapping anchors, or a parked window jumps
    // the moment right/bottom give way to left/top.
    write(r.left, r.top, r.width, Math.max(0, r.height - headerH));
    e.currentTarget.setPointerCapture(e.pointerId);
    // The window root raises on pointer-down; nothing else should act on this one.
    e.stopPropagation();
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = live.current;
    if (!d || e.pointerId !== d.pointerId) return;

    // Where the dragged corner wants to be, and the size that implies against the
    // fixed opposite corner.
    const wantX = e.clientX - d.dx;
    const wantY = e.clientY - d.dy;
    const size = clampSize(
      { w: d.right - wantX, h: d.bottom - wantY - d.headerH },
      window.innerWidth,
      window.innerHeight,
    );

    // Re-derive the corner from the *clamped* size, so hitting a limit pins the
    // window instead of letting it drift on while the size stops changing.
    const x = Math.max(0, d.right - size.w);
    const y = Math.max(0, d.bottom - size.h - d.headerH);

    d.x = x;
    d.y = y;
    d.w = size.w;
    d.h = size.h;
    write(x, y, size.w, size.h);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const d = live.current;
    if (!d || e.pointerId !== d.pointerId) return;
    live.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    onCommit({ w: d.w, h: d.h }, { x: d.x, y: d.y });
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };
}
