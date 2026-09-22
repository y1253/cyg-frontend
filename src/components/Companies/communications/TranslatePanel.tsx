import { Languages, Loader2 } from 'lucide-react';
import { useAiConfig } from '@/hooks/useAiConfig';

/**
 * One received message, in English, shown UNDER the original.
 *
 * ⚠️ Additive, never a replacement. The original stays exactly as the customer wrote it,
 * because a mistranslated amount or date that quietly took its place would be
 * unrecoverable and — worse — invisible, with nobody in a position to notice.
 *
 * Teal + `Sparkles`-family styling, the pairing `CallSummaryPanel` establishes as this
 * app's visual identity for "a model wrote this", so a reader can tell generated text
 * from a person's without reading a label.
 */
export function TranslateControl({
  id,
  text,
  translation,
  busy,
  error,
  shown,
  onToggle,
}: {
  id: string;
  text: string;
  translation: string | null;
  busy: boolean;
  error: string | null;
  shown: boolean;
  onToggle: (id: string, text: string) => void;
}) {
  const { assist } = useAiConfig();
  // Switched off for the firm: no control at all, rather than one that 403s.
  if (!assist) return null;
  // Nothing to translate.
  if (!text.trim()) return null;

  const sameAsOriginal =
    translation !== null && translation.trim() === text.trim();

  return (
    <div className="mt-1 flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void onToggle(id, text)}
        className="inline-flex w-fit items-center gap-1 text-[10px] font-medium text-teal-700 underline-offset-2 hover:underline"
      >
        {busy ? <Loader2 size={11} className="animate-spin" /> : <Languages size={11} />}
        {shown ? 'Hide translation' : 'Translate'}
      </button>

      {shown && error && (
        <span className="text-[10px] text-destructive">{error}</span>
      )}

      {shown && !error && translation !== null && (
        <div className="rounded-md border border-teal-200 bg-teal-50/60 px-2 py-1.5">
          {sameAsOriginal ? (
            // The model returns already-English text unchanged, which is how this is
            // detected — showing a duplicate of what is already on screen would read as
            // a bug.
            <span className="text-[11px] italic text-muted-foreground">
              Already in English.
            </span>
          ) : (
            <>
              <span className="mb-0.5 block text-[10px] font-medium text-teal-700">
                English
              </span>
              <span className="whitespace-pre-wrap break-words text-xs text-foreground">
                {translation}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
