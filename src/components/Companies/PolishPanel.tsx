import { Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DraftPolish } from '@/hooks/useDraftPolish';

interface PolishPanelProps {
  polish: DraftPolish;
  /** Conversation context handed to the model so it keeps the thread's tone. */
  context: string;
  /** Called with the accepted polished TEXT; the caller converts it to HTML. */
  onAccept: (polished: string) => void;
}

interface PolishButtonProps {
  polish: DraftPolish;
  /** The user's own prose, signature/quote already stripped by splitSignature. */
  draftPlain: string;
  context: string;
}

/**
 * "Polish with AI" button plus the preview card (Accept / Re-polish / Discard).
 * Visual parity with the Communications tab's inline version, extracted so
 * compose, reply and forward all share one implementation.
 */
export function PolishPanel({ polish, context, onAccept }: PolishPanelProps) {
  return (
    <>
      {polish.preview !== null && (
        <div className="rounded-md border border-teal-200 bg-teal-50/60 p-3 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700">
            <Sparkles size={13} /> AI-polished version
          </div>
          <p className="text-sm whitespace-pre-wrap text-foreground">
            {polish.preview}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (polish.preview !== null) onAccept(polish.preview);
                polish.reset();
              }}
              className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
            >
              <Check size={13} /> Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={polish.isPending}
              onClick={() => polish.rePolish(context)}
            >
              {polish.isPending ? 'Polishing…' : 'Re-polish'}
            </Button>
            <Button size="sm" variant="outline" onClick={polish.reset}>
              Discard
            </Button>
          </div>
        </div>
      )}
      {polish.isError && (
        <p className="text-xs text-destructive">
          {polish.error?.message ?? 'Failed to polish message'}
        </p>
      )}
    </>
  );
}

/** The trigger button — hidden once a preview is showing (which offers Re-polish). */
export function PolishButton({
  polish,
  draftPlain,
  context,
}: PolishButtonProps) {
  if (polish.preview !== null) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-1"
      disabled={polish.isPending || !draftPlain.trim()}
      onClick={() => polish.run(draftPlain, context)}
    >
      <Sparkles size={14} />
      {polish.isPending ? 'Polishing…' : 'Polish with AI'}
    </Button>
  );
}
