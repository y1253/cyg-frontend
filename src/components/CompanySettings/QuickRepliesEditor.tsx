import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Mirrors the server's `MAX_QUICK_REPLIES` / `MAX_QUICK_REPLY_CHARS`. */
export const MAX_QUICK_REPLIES = 6;
export const MAX_QUICK_REPLY_CHARS = 160;

/**
 * The canned texts offered instead of answering a ringing call.
 *
 * ── WHY A PLAIN LIST AND NOT `MessageField` ───────────────────────────────────
 * The caller-facing messages next to this are read aloud and can run to a paragraph, so
 * they get a textarea with placeholder chips and a spoken preview. These are TEXT
 * MESSAGES chosen on a ringing phone: one line each, read in about a second, and billed
 * by the 160-character segment. A one-line input is the honest control for that, and the
 * character counter is the part that matters.
 *
 * `{company name}` still works — they run through the same `renderMessage` — but it is
 * deliberately not pushed here: the customer dialled that number, so naming the company
 * back at them spends characters without adding anything.
 */
export function QuickRepliesEditor({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const set = (i: number, text: string) =>
    onChange(value.map((v, j) => (j === i ? text : v)));

  return (
    <div className="flex flex-col gap-2">
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No quick replies. Without any, a ringing call offers only Answer and Decline.
        </p>
      )}
      {value.map((text, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Input
              value={text}
              disabled={disabled}
              maxLength={MAX_QUICK_REPLY_CHARS}
              onChange={(e) => set(i, e.target.value)}
              placeholder="I'll call you right back."
            />
            <span
              className={[
                'text-[10px]',
                text.length > MAX_QUICK_REPLY_CHARS - 20
                  ? 'text-amber-600'
                  : 'text-muted-foreground',
              ].join(' ')}
            >
              {text.length}/{MAX_QUICK_REPLY_CHARS} · one text message
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            aria-label="Remove this reply"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <X size={13} />
          </Button>
        </div>
      ))}
      {value.length < MAX_QUICK_REPLIES && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-fit gap-1"
          disabled={disabled}
          onClick={() => onChange([...value, ''])}
        >
          <Plus size={13} /> Add a reply
        </Button>
      )}
    </div>
  );
}
