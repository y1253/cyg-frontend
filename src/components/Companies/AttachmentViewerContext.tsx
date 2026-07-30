import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// A file opened in the full-screen viewer. `url` is captured at open time and never
// re-read from the message list, so the preview survives a background refetch that
// hands the same file a brand-new Gmail attachment id.
export interface ViewerItem {
  url: string;
  mimeType: string;
  filename: string;
  kind: 'image' | 'pdf';
}

interface AttachmentViewerValue {
  item: ViewerItem | null;
  open: (item: ViewerItem) => void;
  close: () => void;
}

const AttachmentViewerCtx = createContext<AttachmentViewerValue | null>(null);

// Holds the open attachment for the whole app and renders the overlay through a
// portal on <body>. The state deliberately lives ABOVE every message list: the
// lightbox used to be local state inside AttachmentPreview, so the 15s thread poll
// (which churns Gmail's attachment ids, and with them React's keys) remounted the
// component and silently closed the preview after a poll cycle or two. Up here,
// nothing short of an explicit user action can close it.
export function AttachmentViewerProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ViewerItem | null>(null);

  const open = useCallback((next: ViewerItem) => setItem(next), []);
  const close = useCallback(() => setItem(null), []);

  // Close on Escape.
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, close]);

  const value = useMemo(() => ({ item, open, close }), [item, open, close]);

  return (
    <AttachmentViewerCtx.Provider value={value}>
      {children}
      {item
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
              onClick={close}
            >
              <button
                type="button"
                onClick={close}
                aria-label="Close preview"
                className="absolute right-4 top-4 inline-flex items-center justify-center rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </button>
              {item.kind === 'pdf' ? (
                <iframe
                  src={item.url}
                  title={item.filename}
                  onClick={(e) => e.stopPropagation()}
                  className="h-[90vh] w-full max-w-5xl rounded-md bg-white"
                />
              ) : (
                <img
                  src={item.url}
                  alt={item.filename}
                  onClick={(e) => e.stopPropagation()}
                  className="max-h-[90vh] max-w-full rounded-md object-contain"
                />
              )}
            </div>,
            document.body,
          )
        : null}
    </AttachmentViewerCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAttachmentViewer(): AttachmentViewerValue {
  const ctx = useContext(AttachmentViewerCtx);
  if (!ctx) {
    throw new Error('useAttachmentViewer must be used within an AttachmentViewerProvider');
  }
  return ctx;
}
