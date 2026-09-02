import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

/**
 * One overridable setting: a "Use default" checkbox, and either the inherited value shown
 * read-only or a live control bound to this company's own value.
 *
 * ── WHY A CHECKBOX AND NOT A SWITCH ─────────────────────────────────────────────
 * There is no `switch` or `radio-group` in `components/ui/`, and the codebase hand-rolls a
 * primitive only under protest (see the plain `<input type="radio">` in
 * PhoneNumberSection.tsx). A checkbox maps one-to-one onto the state that actually exists:
 * ticked = the stored value is NULL = inherit.
 *
 * Two behaviours that are easy to get wrong:
 *  - **Unticking seeds the field with the current default**, not with blank. An override
 *    should start from what callers are already hearing, so an admin edits a sentence
 *    rather than facing an empty box on a live client-facing line.
 *  - **Re-ticking sends `null`**, which is what clears the override server-side. Sending
 *    a value equal to the default instead would freeze this company at today's wording:
 *    a later change to the global default would silently not reach it.
 */
export function OverrideField<T>({
  label,
  hint,
  inherited,
  value,
  onChange,
  renderInherited,
  children,
}: {
  label: string;
  hint?: ReactNode;
  /** The value in force when this field inherits — shown greyed while "Use default" is on. */
  inherited: T;
  /** `null` means inherit. Anything else is this company's own value. */
  value: T | null;
  onChange: (next: T | null) => void;
  /** How to display the inherited value. Defaults to `String(inherited)`. */
  renderInherited?: (value: T) => ReactNode;
  /** The live control, rendered only while an override is in force. */
  children: (value: T, set: (next: T) => void) => ReactNode;
}) {
  const inheriting = value === null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-medium">{label}</Label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <Checkbox
            checked={inheriting}
            onCheckedChange={(checked) =>
              onChange(checked ? null : inherited)
            }
          />
          Use default
        </label>
      </div>

      {inheriting ? (
        <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/40 px-2.5 py-2">
          <Badge
            variant="outline"
            className="shrink-0 text-[10px] px-1.5 py-0 text-muted-foreground"
          >
            Inherited
          </Badge>
          <span className="text-sm text-muted-foreground break-words">
            {renderInherited ? renderInherited(inherited) : String(inherited)}
          </span>
        </div>
      ) : (
        children(value, onChange)
      )}

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * A two-option segmented control, for the boolean settings.
 *
 * The same hand-rolled shape as the country picker in `PhoneNumberSection.tsx:205-223`.
 * A checkbox inside an `OverrideField` whose header is already a checkbox reads terribly,
 * so booleans get this instead of the default `children` control.
 */
export function SegmentedChoice<T extends string | boolean>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}) {
  // w-fit, not just inline-flex: inside a flex-col the default align-items:stretch
  // would otherwise pull the group across the full card width.
  return (
    <div className="inline-flex w-fit rounded-lg border p-0.5 bg-background">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`px-3 py-1 text-sm rounded-md transition-colors disabled:opacity-50 ${
            value === option.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
