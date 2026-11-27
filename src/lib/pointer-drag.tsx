import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

/**
 * 2026-11-27: drag-and-drop on pointer events (mouse, pen, touch) for the Rules tab. The
 * native HTML5 drag never worked there for the user, and cannot be checked by automation;
 * this one is plain pointer events, so it behaves the same in every browser and on a phone.
 *
 * Press on a handle (`start(item, label)`), move more than 5 px and a label follows the
 * pointer; the element under it with `data-drop-key` is the target (`over`); release drops,
 * Escape cancels. `refuse(item, key)` says why a target takes nothing (null = it does).
 */
export function usePointerDrag<T>(opts: {
  refuse: (item: T, key: string) => string | null;
  onDrop: (item: T, key: string) => void;
}) {
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  const [drag, setDrag] = useState<{
    item: T;
    label: string;
    x: number;
    y: number;
    over: string | null;
  } | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  const keyAt = (x: number, y: number): string | null =>
    (document.elementFromPoint(x, y)?.closest('[data-drop-key]') as HTMLElement | null)
      ?.dataset.dropKey ?? null;

  const start = (item: T, label: string) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    let active = false;
    const move = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      active = true;
      ev.preventDefault();
      setDrag({ item, label, x: ev.clientX, y: ev.clientY, over: keyAt(ev.clientX, ev.clientY) });
    };
    const up = (ev: PointerEvent) => {
      cleanup();
      setDrag(null);
      if (!active) return;
      const key = keyAt(ev.clientX, ev.clientY);
      if (key && !optsRef.current.refuse(item, key)) optsRef.current.onDrop(item, key);
    };
    const keydown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      cleanup();
      setDrag(null);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', keydown);
      cleanupRef.current = null;
    };
    const cancel = () => {
      cleanup();
      setDrag(null);
    };
    cleanupRef.current?.();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', keydown);
    cleanupRef.current = cleanup;
  };

  const refusal = drag?.over ? opts.refuse(drag.item, drag.over) : null;

  /** The floating label that follows the pointer while dragging. */
  const ghost = drag
    ? createPortal(
        <div
          className="pointer-events-none fixed z-[100] max-w-xs truncate rounded-md border bg-background px-2 py-1 text-xs font-medium shadow-lg"
          style={{ left: drag.x + 14, top: drag.y + 10 }}
        >
          {drag.label}
          {refusal && <div className="font-normal text-destructive">{refusal}</div>}
        </div>,
        document.body,
      )
    : null;

  return { drag, start, refusal, ghost };
}
