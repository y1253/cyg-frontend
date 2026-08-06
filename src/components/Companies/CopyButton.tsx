import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * A tiny inline "copy this value" icon button.
 *
 * A component rather than a `lib/` helper because the confirmation flash is
 * per-button state — a bare copy() function would leave every call site to
 * reinvent it. There is no toast system in this app, so the icon itself is the
 * feedback: it becomes a checkmark for a moment.
 */
export function CopyButton({
  value,
  label,
  size = 13,
}: {
  value: string;
  /** Describes the field, e.g. "Copy username" — used for title + aria-label. */
  label: string;
  size?: number;
}) {
  const [copied, setCopied] = useState(false);

  // Cleared on its own timer, cancelled on unmount so a row deleted mid-flash
  // doesn't set state on a dead component.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Denied (insecure origin, blocked permission) — leave the icon alone
      // rather than claiming a copy that never happened.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copied' : label}
      aria-label={label}
      className="shrink-0 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check size={size} className="text-teal-600" /> : <Copy size={size} />}
    </button>
  );
}
