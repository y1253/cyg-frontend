import { useCallback, useRef, useState } from 'react';

/**
 * Drag-and-drop and paste-to-attach for a composer.
 *
 * Both gestures land in the same place the paperclip button does, so the file
 * limits, de-duping and the notice text stay in one implementation
 * (`mergeAttachments`).
 */

/**
 * Does this transfer actually carry files?
 *
 * Dragging selected text or a hyperlink also fires the drag events, but with
 * `types` of `text/plain` / `text/uri-list` and an empty `files` list. Checking
 * up front is what stops the drop overlay appearing for a text drag.
 */
export function hasFiles(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  // `types` is a DOMStringList on older engines, so no `.includes`.
  return Array.from(dt.types ?? []).includes('Files');
}

/** The files on a drop or paste, or an empty list if there are none. */
export function extractFiles(dt: DataTransfer | null | undefined): File[] {
  if (!dt?.files) return [];
  return Array.from(dt.files);
}

export function useFileDrop({
  onFiles,
  enabled = true,
}: {
  onFiles: (files: File[]) => void;
  /** Off for surfaces that don't take dropped files, so the overlay never shows. */
  enabled?: boolean;
}) {
  const [isOver, setIsOver] = useState(false);
  // dragenter/dragleave fire for every child element the pointer crosses, so a
  // boolean flickers off the moment the cursor moves over the editor. Counting
  // enters against leaves is the standard fix.
  const depth = useRef(0);

  const reset = useCallback(() => {
    depth.current = 0;
    setIsOver(false);
  }, []);

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!enabled || !hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      depth.current += 1;
      setIsOver(true);
    },
    [enabled],
  );

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!enabled || !hasFiles(e.dataTransfer)) return;
      // Without preventDefault here the browser refuses the drop entirely, and
      // the default action would open the file in the tab.
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [enabled],
  );

  const onDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!enabled || !hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      depth.current -= 1;
      if (depth.current <= 0) reset();
    },
    [enabled, reset],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!enabled || !hasFiles(e.dataTransfer)) return;
      // The message body is a contentEditable: without this the file is inserted
      // into the document (or navigated to) instead of attached.
      e.preventDefault();
      reset();
      const files = extractFiles(e.dataTransfer);
      if (files.length > 0) onFiles(files);
    },
    [enabled, onFiles, reset],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!enabled) return;
      const files = extractFiles(e.clipboardData);
      // Only take over when the clipboard actually holds files. Calling
      // preventDefault on an ordinary text or HTML paste would break typing into
      // the editor, which has no paste handler of its own.
      if (files.length === 0) return;
      e.preventDefault();
      onFiles(files);
    },
    [enabled, onFiles],
  );

  return {
    isOver: enabled && isOver,
    /** Spread onto the element that should accept drops. */
    handlers: { onDragEnter, onDragOver, onDragLeave, onDrop, onPaste },
  };
}
