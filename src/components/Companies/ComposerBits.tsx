import { Paperclip, X } from 'lucide-react';
import { attachmentsToLink, formatBytes } from './message-utils';

/**
 * The picked-file list and the upload bar, shared by every composer: the docked
 * compose window and the Communications tab's inline reply / forward panels.
 *
 * These were closures inside CommunicationsTab, which was fine while all three
 * composers lived in that one component. The docked composer lives above the
 * router, so they had to become real components rather than be duplicated.
 */

export function AttachmentChips({
  files,
  setFiles,
  /** "Drive" or "OneDrive" — which service oversized files get hosted on. */
  cloudLabel,
}: {
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  cloudLabel: string;
}) {
  if (files.length === 0) return null;
  // Files the server will host on Drive/OneDrive instead of attaching are flagged
  // before sending — `attachmentsToLink` mirrors the server's split.
  const linked = attachmentsToLink(files);
  const total = files.reduce((sum, f) => sum + f.size, 0);
  return (
    <div className="flex flex-col gap-1.5">
      {files.map((f, i) => (
        <div
          key={`${f.name}:${f.size}:${i}`}
          className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs"
        >
          <Paperclip size={12} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
          {linked.has(f) && (
            <span className="shrink-0 rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 ring-1 ring-teal-200">
              sent as {cloudLabel} link
            </span>
          )}
          {f.size > 0 && (
            <span className="shrink-0 text-muted-foreground">{formatBytes(f.size)}</span>
          )}
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            title="Remove attachment"
            onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
          >
            <X size={13} />
          </button>
        </div>
      ))}
      {files.length > 1 && (
        <p className="text-xs text-muted-foreground">{formatBytes(total)} total</p>
      )}
    </div>
  );
}

/** Attachments run to 250 MB, so a bare "Sending…" leaves the user guessing. */
export function UploadProgressBar({ progress }: { progress: number | null }) {
  if (progress === null) return null;
  const percent = Math.round(progress * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-teal-500 transition-all duration-150"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {percent}%
      </span>
    </div>
  );
}
