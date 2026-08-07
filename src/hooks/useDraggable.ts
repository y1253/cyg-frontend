import { useLayoutEffect, useRef } from 'react';
import { clampPos, type ComposerPos } from '@/components/Companies/composer-layout';

/** The four offsets React writes into the window's inline style. Both anchors are
 *  always spelled — `'auto'` where unused — so an imperative write during a drag and
 *  a later React render touch exactly the same properties and can't leave a stale
 *  `right` fighting a fresh `left`. */
export interface DragStyle {
  left: number | 'auto';
  top: number | 'auto';
  right: number | 'auto';
  bottom: number | 'auto';
}

/**
 * Drag-to-move for a panel, by pointer events so mouse, touch and pen are one path.
 *
 * The position is written straight to the DOM while the pointer is down and
 * committed to React state once, on release: a setState per frame would re-render
 * every open composer on every mouse move.
 */
export function useDraggable({
  ref,
  style,
  minimized,
  onCommit,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  /** What React would render right now — used to put the panel back if the pointer
   *  went down but never actually moved. */
  style: DragStyle;
  minimized: boolean;
  onCommit: (pos: ComposerPos) => void;
}) {
  const live = useRef<{
    pointerId: number;
    dx: number;
    dy: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  // Set on release and consumed by the click that follows, so a drag ending on the
  // title bar doesn't also fire the title bar's minimize toggle.
  const moved = useRef(false);
  const styleRef = useRef(style);

  const write = (el: HTMLElement, x: number, y: number) => {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  };

  const restore = (el: HTMLElement) => {
    const s = styleRef.current;
    const px = (v: number | 'auto') => (typeof v === 'number' ? `${v}px` : 'auto');
    el.style.left = px(s.left);
    el.style.top = px(s.top);
    el.style.right = px(s.right);
    el.style.bottom = px(s.bottom);
  };

  // Runs after every render, with no deps on purpose. It keeps the fallback style in
  // step with the props, and re-asserts a drag in progress: a render caused by some
  // *other* window — a send progressing, another composer opening — re-applies this
  // one's React style and would otherwise yank it back mid-drag.
  useLayoutEffect(() => {
    styleRef.current = style;
    const d = live.current;
    if (d && ref.current) write(ref.current, d.x, d.y);
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // The minimize and close buttons sit in the drag handle and must keep working.
    if ((e.target as HTMLElement).closest('button')) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    live.current = {
      pointerId: e.pointerId,
      dx: e.clientX - r.left,
      dy: e.clientY - r.top,
      x: r.left,
      y: r.top,
      moved: false,
    };
    // Freeze it where it already is before swapping anchors, or a parked window
    // jumps the moment right/bottom give way to left/top.
    write(el, r.left, r.top);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = live.current;
    const el = ref.current;
    if (!d || !el || e.pointerId !== d.pointerId) return;
    const next = clampPos(
      { x: e.clientX - d.dx, y: e.clientY - d.dy },
      minimized,
      window.innerWidth,
      window.innerHeight,
    );
    if (!d.moved && Math.abs(next.x - d.x) + Math.abs(next.y - d.y) > 4) d.moved = true;
    d.x = next.x;
    d.y = next.y;
    write(el, next.x, next.y);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = live.current;
    if (!d || e.pointerId !== d.pointerId) return;
    live.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (d.moved) {
      moved.current = true;
      onCommit({ x: d.x, y: d.y });
    } else if (ref.current) {
      // Never moved: hand the inline style back to React's values.
      restore(ref.current);
    }
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (!moved.current) return;
    moved.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onClickCapture,
  };
}
