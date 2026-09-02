import { useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import type { Placeholder } from '@/api/phoneSettings';
import { renderPreview } from '@/lib/message-preview';

/** Cap matching the server's `@MaxLength(1000)`, so the limit is visible before a 400. */
const MAX_LENGTH = 1000;

/**
 * One caller-facing message: a textarea, insertable placeholder chips, and a live preview
 * of what a caller would actually hear.
 *
 * The chips come from the SERVER's `placeholders` array rather than a local constant, so
 * a token offered here is always one `renderMessage` understands. A chip that inserts an
 * unrecognised token would print literally on a live call — the renderer deliberately
 * leaves unknown tokens verbatim so an admin's typo is audible rather than silent.
 */
export function MessageField({
  value,
  onChange,
  placeholders,
  preview,
  disabled,
  rows = 3,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholders: Placeholder[];
  /** Sample values to substitute for the preview line. */
  preview: Record<string, string>;
  disabled?: boolean;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  /** Insert at the caret, not at the end — an admin is usually mid-sentence. */
  const insert = (token: string) => {
    const el = ref.current;
    if (!el) {
      onChange(value + token);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next.slice(0, MAX_LENGTH));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        ref={ref}
        rows={rows}
        value={value}
        disabled={disabled}
        maxLength={MAX_LENGTH}
        onChange={(e) => onChange(e.target.value)}
      />

      <div className="flex flex-wrap items-center gap-1.5">
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
        <span className="ml-auto text-[11px] text-muted-foreground">
          {value.length}/{MAX_LENGTH}
        </span>
      </div>

      <p className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground italic">
        Caller hears: “{renderPreview(value, placeholders, preview)}”
      </p>
    </div>
  );
}
