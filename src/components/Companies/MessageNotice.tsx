import type { ReactNode } from 'react';

/**
 * One inline status strip above a message list — "re-connect this mailbox", "Chat
 * isn't enabled", "new email received", "that change didn't save".
 *
 * The Communications tab had eight of these written out longhand, differing only
 * in palette, icon and whether they carry an action on the right. Everything
 * except the palette is a prop.
 */
export type NoticeTone = 'amber' | 'muted' | 'teal' | 'destructive';

const TONES: Record<NoticeTone, string> = {
  amber: 'bg-amber-50 border-amber-200 text-amber-800',
  muted: 'bg-muted/40 border-border text-muted-foreground',
  teal: 'bg-teal-50 border-teal-200 text-teal-800',
  destructive: 'bg-red-50 border-red-200 text-destructive',
};

export function MessageNotice({
  tone,
  icon,
  action,
  children,
}: {
  tone: NoticeTone;
  /** Rendered before the text. Give it `shrink-0` so a long message can't squash it. */
  icon?: ReactNode;
  /** Right-aligned control — a Re-connect / Retry button, or a dismiss ×. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        'flex items-center gap-2 px-3 py-2 rounded-md border text-sm',
        action ? 'justify-between' : '',
        TONES[tone],
      ].join(' ')}
    >
      {/* icon + text stay one flex group so `justify-between` pushes the action to
          the far edge rather than spacing all three children apart. */}
      <span className="flex items-center gap-2">
        {icon}
        {children}
      </span>
      {action}
    </div>
  );
}
