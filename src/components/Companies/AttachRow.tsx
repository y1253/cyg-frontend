import { useRef, type ReactNode } from 'react';
import { Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AttachmentChips } from './ComposerBits';

/**
 * The attachment block every composer carries: a hidden file input, the Attach
 * button that triggers it, whatever notices apply, and the picked-file chips.
 *
 * This was written four separate times — twice inline in CommunicationsTab, once
 * as `renderAttachRow` in InternalMessagesTab (which re-implemented the chip list
 * rather than using AttachmentChips) and once inline in DockedComposer.
 *
 * The upload bar is deliberately NOT here: the call sites disagree about where it
 * belongs relative to these chips, and it is driven by the send mutation rather
 * than by the file list. Callers render `<UploadProgressBar>` themselves.
 *
 * The input ref is owned here rather than passed in — no call site did anything
 * with it beyond `.click()`, which the Attach button already does.
 */
export function AttachRow({
  files,
  setFiles,
  onPick,
  notice,
  cloudLabel,
  accept,
  children,
  disabledReason,
}: {
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  /**
   * Handed the picked files — the caller runs `mergeAttachments` and sets the notice.
   *
   * The union is what lets ONE handler serve the picker (a `FileList`) and a paste or a
   * drop (a plain array). Every caller already normalises with `Array.from`, so there is
   * no second shape to keep in step — which is the point: a composer where paste and
   * pick take different routes is a composer where only one of them enforces the limits.
   */
  onPick: (picked: FileList | File[] | null) => void;
  notice: string | null;
  /**
   * "Drive" / "OneDrive" — which service oversized files get hosted on, or `null`
   * for internal messages, which keep every attachment on our own disk.
   */
  cloudLabel: string | null;
  // (see `disabledReason` below)
  /**
   * The file picker's filter, e.g. `image/png,image/jpeg`.
   *
   * A CONVENIENCE, never the gate: a drag, a paste, and anything the OS dialog is talked
   * into all bypass it, so the caller still filters in `onPick` and the server still
   * refuses. Omitted means "any file", which is what WhatsApp wants.
   */
  accept?: string;
  /** Form-specific warnings (forward's "not forwarded…", the body-budget notice). */
  children?: ReactNode;
  /**
   * Attaching is not possible RIGHT NOW, with the reason.
   *
   * ⚠️ Rendered disabled rather than not rendered at all, and that is the whole point of
   * the prop. A control that is absent reads as a missing FEATURE — "there is no option of
   * attaching" — while a control that is present and greyed with a reason reads as "not
   * yet", which is the truth wherever this is used.
   */
  disabledReason?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => {
          onPick(e.target.files);
          // Clear so picking the same file twice still fires onChange.
          e.target.value = '';
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-fit gap-1"
        disabled={!!disabledReason}
        title={disabledReason ?? undefined}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip size={14} /> Attach
      </Button>
      {disabledReason && (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      )}
      {notice && <p className="text-xs text-amber-600">{notice}</p>}
      {children}
      <AttachmentChips files={files} setFiles={setFiles} cloudLabel={cloudLabel} />
    </div>
  );
}
