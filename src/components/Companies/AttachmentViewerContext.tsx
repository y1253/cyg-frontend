import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Download, FileText, ImageIcon, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// A file opened in the full-screen viewer. `url` is captured at open time and never
// re-read from the message list, so the preview survives a background refetch that
// hands the same file a brand-new Gmail attachment id.
export interface ViewerItem {
  url: string;
  /**
   * Same bytes as `url` but served `Content-Disposition: attachment`, so the
   * viewer can hand the file over without the user closing it to hunt for the
   * tile's hover button. Optional: a body-embedded image may only have the one
   * URL, and the browser still saves it, just inline-dispositioned.
   */
  downloadUrl?: string;
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

/** "PDF", "PNG", … for the badge — the extension, else the mime subtype. */
function typeLabel(item: ViewerItem): string {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(item.filename)?.[1];
  return (ext ?? item.mimeType.split('/')[1] ?? item.kind).toUpperCase();
}

// Holds the open attachment for the whole app and renders the viewer as a shadcn
// Dialog. The state deliberately lives ABOVE every message list: the lightbox used to
// be local state inside AttachmentPreview, so the 15s thread poll (which churns
// Gmail's attachment ids, and with them React's keys) remounted the component and
// silently closed the preview after a poll cycle or two. Up here, nothing short of an
// explicit user action can close it.
//
// step2.md (2026-11-10): the close X used to be pinned to the SCREEN's top-right
// corner — exactly where the header's "Sign out" sits — and the overlay unmounted on
// the click, so a double click or a touch ghost-click signed people out. The controls
// now live in a toolbar INSIDE the panel, and the Dialog's close animation keeps the
// backdrop up long enough to swallow a second click.
export function AttachmentViewerProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ViewerItem | null>(null);
  // The last file opened, kept after close so the panel still shows it while the
  // Dialog's close animation runs (instead of collapsing to an empty box).
  const [shown, setShown] = useState<ViewerItem | null>(null);

  const open = useCallback((next: ViewerItem) => {
    setItem(next);
    setShown(next);
  }, []);
  const close = useCallback(() => setItem(null), []);

  const value = useMemo(() => ({ item, open, close }), [item, open, close]);
  const Icon = shown?.kind === 'pdf' ? FileText : ImageIcon;

  return (
    <AttachmentViewerCtx.Provider value={value}>
      {children}
      <Dialog open={item !== null} onOpenChange={(o) => !o && close()}>
        <DialogPortal>
          <DialogOverlay className="bg-black/70" />
          <DialogPrimitive.Popup
            data-slot="dialog-content"
            className="fixed top-1/2 left-1/2 z-50 flex max-h-[94dvh] w-[min(96vw,64rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-popover text-sm text-popover-foreground shadow-2xl ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            {shown && (
              <>
                <div className="flex shrink-0 items-center gap-2 border-b bg-background/95 px-3 py-2">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <DialogTitle className="min-w-0 flex-1 truncate text-sm" title={shown.filename}>
                    {shown.filename}
                  </DialogTitle>
                  <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
                    {typeLabel(shown)}
                  </Badge>
                  <a
                    href={shown.downloadUrl ?? shown.url}
                    download={shown.filename}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Download ${shown.filename}`}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
                  >
                    <Download />
                    <span className="hidden sm:inline">Download</span>
                  </a>
                  <DialogClose
                    render={<Button variant="ghost" size="icon-sm" aria-label="Close preview" />}
                  >
                    <X />
                  </DialogClose>
                </div>
                <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-muted/40 p-3">
                  {shown.kind === 'pdf' ? (
                    <iframe
                      src={shown.url}
                      title={shown.filename}
                      className="h-[80dvh] w-full rounded-md bg-white ring-1 ring-border"
                    />
                  ) : (
                    <img
                      src={shown.url}
                      alt={shown.filename}
                      className="max-h-[80dvh] max-w-full rounded-md object-contain shadow-sm"
                    />
                  )}
                </div>
              </>
            )}
          </DialogPrimitive.Popup>
        </DialogPortal>
      </Dialog>
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
