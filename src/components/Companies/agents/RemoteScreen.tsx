import {
  useCallback,
  useEffect,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { MonitorPlay } from 'lucide-react';
import { picturePointClamped } from '@/lib/picture-point';
import type { AgentBrowserStream, MouseButton } from '@/hooks/useAgentBrowserStream';
import { cn } from '@/lib/utils';

/** Two presses this close (ms, px) are a double (or triple) click. */
const MULTI_CLICK_MS = 400;
const MULTI_CLICK_PX = 5;
/** Wheel `deltaMode` 1 = lines: about this many pixels each. */
const LINE_PX = 16;

const BUTTONS: Record<number, MouseButton> = { 0: 'left', 1: 'middle', 2: 'right' };

/** On a Mac, Cmd is what Ctrl is on the agent's (Linux) browser. */
const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * step13 (2026-11-02): one tab of the agent's browser, as a picture — and, while this
 * viewer controls it, a real screen: the mouse moves on the page as it moves here (hover
 * menus open, the page's own cursor shows), a press-drag-release selects text or drags a
 * slider, the wheel / trackpad scrolls smoothly (batched per animation frame), and every
 * key goes down and up as typed, so arrows, Shift+arrows, Ctrl+A and held keys behave.
 * Paste sends the clipboard's text; Ctrl/Cmd+C copies what is selected on the page.
 */
export function RemoteScreen({
  pageId,
  stream,
  driving,
  hasFrame,
  onBrowser,
  className,
  label,
  onPick,
}: {
  pageId: number;
  stream: AgentBrowserStream;
  /** This viewer controls this tab. */
  driving: boolean;
  hasFrame: boolean;
  onBrowser: boolean;
  className?: string;
  label: string;
  /** Clicked while NOT driving (the split view: show this tab big). */
  onPick?: () => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const imgEl = useRef<HTMLImageElement | null>(null);
  const { input } = stream;
  const setFrame = stream.frameRef(pageId);
  const imgRef = useCallback(
    (el: HTMLImageElement | null) => {
      imgEl.current = el;
      setFrame(el);
    },
    [setFrame],
  );
  const move = useRef<{ x: number; y: number } | null>(null);
  const moveFrame = useRef<number | null>(null);
  const wheel = useRef({ dx: 0, dy: 0, x: 0.5, y: 0.5 });
  const wheelFrame = useRef<number | null>(null);
  const lastDown = useRef({ at: 0, x: 0, y: 0, count: 0 });
  const heldKeys = useRef(new Set<string>());
  const heldButtons = useRef(new Set<MouseButton>());
  // The newest callbacks for the native listeners below.
  const live = useRef({ driving, input, pageId });
  useEffect(() => {
    live.current = { driving, input, pageId };
  });

  // Typing goes to the page the moment control is taken.
  useEffect(() => {
    if (driving) boxRef.current?.focus();
  }, [driving]);

  /** A point on the screen → 0..1 of the page (clamped, so a drag can leave the box). */
  const point = (clientX: number, clientY: number) => {
    const img = imgEl.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    return picturePointClamped(
      { x: clientX - rect.left, y: clientY - rect.top },
      { width: rect.width, height: rect.height },
      { width: img.naturalWidth, height: img.naturalHeight },
    );
  };

  /** Let go of every key and button still held — the page must not think Shift is down. */
  const releaseAll = () => {
    const { input: send, pageId: id } = live.current;
    for (const key of heldKeys.current) send.key(id, 'up', key);
    heldKeys.current.clear();
    const at = move.current ?? { x: 0.5, y: 0.5 };
    for (const button of heldButtons.current) send.pointer(id, 'up', at.x, at.y, button);
    heldButtons.current.clear();
  };

  // Control handed back (or this tab closed): release what this viewer was holding.
  useEffect(() => {
    if (!driving) return;
    return () => releaseAll();
  }, [driving]);

  // The wheel needs a non-passive listener to keep the panel itself from scrolling.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      if (!live.current.driving) return;
      e.preventDefault();
      const scale =
        e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? box.clientHeight : 1;
      const p = point(e.clientX, e.clientY);
      wheel.current.dx += e.deltaX * scale;
      wheel.current.dy += e.deltaY * scale;
      if (p) {
        wheel.current.x = p.x;
        wheel.current.y = p.y;
      }
      if (wheelFrame.current === null) {
        wheelFrame.current = requestAnimationFrame(() => {
          wheelFrame.current = null;
          const { dx, dy, x, y } = wheel.current;
          wheel.current.dx = 0;
          wheel.current.dy = 0;
          if (dx || dy) live.current.input.wheel(live.current.pageId, x, y, dx, dy);
        });
      }
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(
    () => () => {
      if (moveFrame.current !== null) cancelAnimationFrame(moveFrame.current);
      if (wheelFrame.current !== null) cancelAnimationFrame(wheelFrame.current);
    },
    [],
  );

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!driving) return;
    const p = point(e.clientX, e.clientY);
    if (!p) return;
    move.current = p;
    // One move per animation frame — the newest position is all that matters.
    if (moveFrame.current === null) {
      moveFrame.current = requestAnimationFrame(() => {
        moveFrame.current = null;
        const at = move.current;
        if (at) input.pointer(pageId, 'move', at.x, at.y);
      });
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!driving) return;
    boxRef.current?.focus();
    const button = BUTTONS[e.button];
    const p = point(e.clientX, e.clientY);
    if (!button || !p) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const prev = lastDown.current;
    const near =
      Math.abs(e.clientX - prev.x) <= MULTI_CLICK_PX &&
      Math.abs(e.clientY - prev.y) <= MULTI_CLICK_PX;
    const count = Date.now() - prev.at <= MULTI_CLICK_MS && near ? Math.min(prev.count + 1, 3) : 1;
    lastDown.current = { at: Date.now(), x: e.clientX, y: e.clientY, count };
    heldButtons.current.add(button);
    move.current = p;
    input.pointer(pageId, 'down', p.x, p.y, button, count);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!driving) return;
    const button = BUTTONS[e.button];
    if (!button || !heldButtons.current.has(button)) return;
    heldButtons.current.delete(button);
    const p = point(e.clientX, e.clientY) ?? move.current ?? { x: 0.5, y: 0.5 };
    input.pointer(pageId, 'up', p.x, p.y, button, lastDown.current.count);
  };

  const keyName = (e: KeyboardEvent<HTMLDivElement>) =>
    IS_MAC && e.key === 'Meta' ? 'Control' : e.key;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!driving) return;
    const mod = IS_MAC ? e.metaKey : e.ctrlKey;
    const k = e.key.toLowerCase();
    // Ctrl/Cmd+V: the browser's own paste event carries the clipboard (below).
    if (mod && k === 'v') return;
    e.preventDefault();
    if (mod && (k === 'c' || k === 'x')) {
      input.copy(pageId);
      if (k === 'c') return;
    }
    const key = keyName(e);
    heldKeys.current.add(key);
    input.key(pageId, 'down', key);
  };

  const onKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!driving) return;
    const key = keyName(e);
    if (!heldKeys.current.has(key)) return;
    e.preventDefault();
    heldKeys.current.delete(key);
    input.key(pageId, 'up', key);
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (!driving) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    input.paste(pageId, text);
  };

  const cursor = driving ? (stream.cursors[pageId] ?? 'default') : undefined;

  return (
    <div
      ref={boxRef}
      tabIndex={driving ? 0 : -1}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={!driving ? onPick : undefined}
      onContextMenu={(e) => driving && e.preventDefault()}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onPaste={onPaste}
      onBlur={() => driving && releaseAll()}
      // The page's own cursor (a hand over a link) — a value only known at runtime.
      style={cursor ? { cursor } : undefined}
      className={cn(
        'relative aspect-[1280/900] w-full touch-none overflow-hidden rounded-md border bg-muted/40 outline-none',
        driving && 'ring-2 ring-amber-400',
        className,
      )}
    >
      <img
        ref={imgRef}
        alt={label}
        draggable={false}
        className={cn(
          'pointer-events-none absolute inset-0 size-full select-none object-contain',
          !(onBrowser && hasFrame) && 'invisible',
        )}
      />
      {!(onBrowser && hasFrame) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <MonitorPlay className="size-8" />
          {onBrowser ? 'Waiting for the first picture…' : 'Not open'}
        </div>
      )}
    </div>
  );
}
