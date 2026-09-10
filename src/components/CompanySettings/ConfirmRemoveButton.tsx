import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The two-step delete confirm: a trash icon that becomes Remove / Cancel in place.
 *
 * Extracted so the logo library row and the per-company logo tile share ONE copy. They ask
 * the same question about the same kind of thing, and a second drifting copy of a
 * destructive confirm is the sort of divergence nobody notices until one of them stops
 * confirming.
 *
 * The confirming state is OWNED BY THE CALLER (`confirming` + `onConfirmingChange`) rather
 * than held internally, because a list must be able to collapse whichever row is open when
 * another one is clicked — two rows both offering "Remove" is exactly the ambiguity the
 * confirm exists to remove.
 */
export function ConfirmRemoveButton({
  label,
  confirming,
  onConfirmingChange,
  onRemove,
  className,
  iconSize = 14,
}: {
  /** What is being removed, e.g. the logo's name — used for the accessible label. */
  label: string;
  confirming: boolean;
  onConfirmingChange: (confirming: boolean) => void;
  onRemove: () => void;
  className?: string;
  iconSize?: number;
}) {
  if (confirming) {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => {
            onRemove();
            onConfirmingChange(false);
          }}
        >
          Remove
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onConfirmingChange(false)}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Remove ${label}`}
      onClick={() => onConfirmingChange(true)}
      className={cn(
        'rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600',
        className,
      )}
    >
      <Trash2 size={iconSize} />
    </button>
  );
}
