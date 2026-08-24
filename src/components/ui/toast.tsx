import { useEffect } from 'react';
import { Mail, X } from 'lucide-react';

/**
 * One in-app alert. Created by NotificationContext's `notify()` funnel, so every
 * source that already chimes or raises a desktop notification gets one for free.
 */
export interface AppToast {
  id: number;
  title: string;
  body: string;
  onClick?: () => void;
}

/** Long enough to read and click, short enough not to pile up. */
const TOAST_MS = 8000;

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: AppToast;
  onDismiss: (id: number) => void;
}) {
  // Depends on the id, not the toast object: the parent re-renders on every new
  // toast, and depending on the object would restart this one's timer each time.
  // `onDismiss` is a stable useCallback, so listing it costs nothing.
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  const clickable = !!toast.onClick;

  return (
    <div
      className={`pointer-events-auto w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-background shadow-lg ring-1 ring-black/5 animate-in slide-in-from-bottom-2 fade-in ${
        clickable ? 'cursor-pointer hover:bg-muted/40' : ''
      }`}
      role={clickable ? 'button' : 'status'}
      tabIndex={clickable ? 0 : undefined}
      onClick={
        clickable
          ? () => {
              toast.onClick?.();
              onDismiss(toast.id);
            }
          : undefined
      }
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toast.onClick?.();
                onDismiss(toast.id);
              }
            }
          : undefined
      }
    >
      <div className="flex items-start gap-3 p-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600">
          <Mail size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{toast.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{toast.body}</p>
        </div>
        <button
          type="button"
          title="Dismiss"
          // The card itself is clickable, so the close button must not also trigger it.
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(toast.id);
          }}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

/**
 * Fixed bottom-right stack, newest on top.
 *
 * `pointer-events-none` on the container with `pointer-events-auto` on each card
 * keeps the empty column from swallowing clicks on the page beneath it.
 */
export function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: AppToast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
