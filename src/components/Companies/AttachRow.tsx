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
  children,
}: {
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  /** Handed the raw FileList — the caller runs `mergeAttachments` and sets the notice. */
  onPick: (picked: FileList | null) => void;
  notice: string | null;
  /**
   * "Drive" / "OneDrive" — which service oversized files get hosted on, or `null`
   * for internal messages, which keep every attachment on our own disk.
   */
  cloudLabel: string | null;
  /** Form-specific warnings (forward's "not forwarded…", the body-budget notice). */
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
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
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip size={14} /> Attach
      </Button>
      {notice && <p className="text-xs text-amber-600">{notice}</p>}
      {children}
      <AttachmentChips files={files} setFiles={setFiles} cloudLabel={cloudLabel} />
    </div>
  );
}
