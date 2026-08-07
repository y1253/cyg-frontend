import { useEffect } from 'react';
import { DockedComposer } from './DockedComposer';
import type { ComposerActions, Draft } from '@/context/ComposerContext';

/**
 * The one container every open composer lives in.
 *
 * It is a transparent full-viewport overlay, not a flex row: a window can be dragged
 * anywhere, so each one positions itself absolutely and the stack only decides which
 * slot the parked ones take.
 *
 * The single `.map()` under a single parent is load-bearing. Splitting the visible
 * and hidden windows into two containers — or wrapping one branch in an extra div —
 * would change their fibers' parent and remount them, destroying exactly the state
 * this design exists to preserve.
 */
export function ComposerStack({
  drafts,
  currentPath,
  topId,
  notice,
  actions,
}: {
  drafts: Draft[];
  currentPath: string | null;
  topId: string | null;
  notice: string | null;
  actions: ComposerActions;
}) {
  const { reflow } = actions;

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (t) clearTimeout(t);
      t = setTimeout(reflow, 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener('resize', onResize);
    };
  }, [reflow]);

  // On screen only on the page it was opened from — except while it is sending, so a
  // long upload keeps its progress bar and any error in sight. Off the authenticated
  // shell (`currentPath === null`) nothing shows at all, which is what keeps a
  // mid-send window from following the user onto the login page.
  const isVisible = (d: Draft) =>
    currentPath !== null && (d.ownerPath === currentPath || d.sending);

  // Slot numbering covers only the parked windows: a dragged one is wherever the user
  // put it and must not leave a gap in the row.
  const slots = new Map<string, number>();
  let slot = 0;
  for (const d of drafts) {
    if (isVisible(d) && d.pos === null) slots.set(d.id, slot++);
  }

  return (
    // No `overflow-*` here, ever: RecipientAutocomplete's dropdown is `absolute
    // top-full` rather than portaled, so a clipping or scrolling ancestor eats it.
    <div className="pointer-events-none fixed inset-0 z-40">
      {notice ? (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-white shadow-lg">
          {notice}
        </div>
      ) : null}
      {drafts.map((draft, i) => (
        <DockedComposer
          key={draft.id}
          draft={draft}
          hidden={!isVisible(draft)}
          slot={slots.get(draft.id) ?? 0}
          // Raising happens through z-index rather than by reordering the array:
          // reordering keeps state but performs real DOM moves, which blur the
          // focused editor and reset scroll positions.
          zIndex={draft.id === topId ? 100 : 10 + i}
          actions={actions}
        />
      ))}
    </div>
  );
}
