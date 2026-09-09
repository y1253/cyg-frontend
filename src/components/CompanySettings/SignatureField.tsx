import { useRef } from 'react';
import { RichTextEditor } from '@/components/Companies/RichTextEditor';
import type { Placeholder } from '@/api/emailSignature';

/**
 * The signature template: a rich-text editor, insertable placeholder chips, and a live
 * preview of what staff will actually see seeded into a composer.
 *
 * The editor is the SAME `RichTextEditor` the email composer uses, deliberately: the
 * signature is a fragment of an email body, so it should be authored with the tools that
 * produce one. An admin never sees an angle bracket.
 *
 * The chips come from the SERVER's `placeholders` array rather than a local constant, so a
 * token offered here is always one `renderSignature` understands. A chip that inserted an
 * unrecognised token would print literally in every outgoing email — the renderer
 * deliberately leaves unknown tokens verbatim so an admin's typo is visible rather than
 * silent.
 */
export function SignatureField({
  value,
  onChange,
  placeholders,
  previewHtml,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholders: Placeholder[];
  /** Server-rendered preview. `null` while one is in flight. */
  previewHtml: string | null;
  disabled?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  /**
   * Insert at the caret, not at the end — an admin is usually mid-sentence.
   *
   * `MessageField`'s `selectionStart` arithmetic does not transfer: this is a
   * `contentEditable`, not a `<textarea>`, so the caret lives in a Selection. `execCommand`
   * is what `RichTextEditor` already uses for every one of its own toolbar buttons, so the
   * undo stack and the `onChange` it fires afterwards both behave the same way.
   */
  const insert = (token: string) => {
    const root = wrapRef.current?.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    );
    if (!root) {
      onChange(value + token);
      return;
    }
    root.focus();
    const selection = window.getSelection();
    // A focus that did not land inside the editor (first click on a chip, say) leaves the
    // selection wherever it was, and inserting there would write into another element.
    const inside =
      selection &&
      selection.rangeCount > 0 &&
      root.contains(selection.getRangeAt(0).commonAncestorContainer);
    if (!inside) {
      const range = document.createRange();
      range.selectNodeContents(root);
      range.collapse(false); // to the end
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    document.execCommand('insertText', false, token);
    onChange(root.innerHTML);
  };

  return (
    <div className="flex flex-col gap-2">
      <div ref={wrapRef}>
        <RichTextEditor
          html={value}
          onChange={onChange}
          mode="email"
          minHeight={140}
          maxHeight={320}
          placeholder="Your signature…"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[11px] text-muted-foreground mr-1">Insert:</span>
        {placeholders.map((placeholder) => (
          <button
            key={placeholder.token}
            type="button"
            disabled={disabled}
            onClick={() => insert(placeholder.token)}
            title={`Insert ${placeholder.label}`}
            className="rounded-md border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {placeholder.token}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Preview
        </span>
        <div className="rounded-md border bg-muted/20 p-3 text-sm">
          {previewHtml === null ? (
            <span className="text-xs text-muted-foreground italic">
              Rendering…
            </span>
          ) : previewHtml ? (
            // Server-rendered: the template was sanitised on save and every substituted
            // value is escaped by renderSignature, so this is the same markup that will be
            // seeded into a composer.
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          ) : (
            <span className="text-xs text-muted-foreground italic">
              No signature — emails will be sent unsigned.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
