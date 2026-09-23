import { Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAiConfig } from '@/hooks/useAiConfig';
import type { DraftPolish } from '@/hooks/useDraftPolish';

/**
 * A length budget for the polished reply, for the channels where length costs something.
 *
 * `hard` is the difference that matters. A text over 160 characters is *legal* — it just
 * costs another segment — so going over warns and still allows Accept. A WhatsApp caption
 * over 1024 is refused by Meta, so accepting it would produce a send that fails later,
 * away from the thing that caused it; there, Accept is blocked.
 */
export interface PolishBudget {
  maxChars: number;
  /** True when the provider refuses anything longer, rather than just charging more. */
  hard: boolean;
  /** What to call it in the warning, e.g. "one text message". */
  label: string;
  /** Whether the user has asked to keep within it. Unticked sends no limit at all. */
  enabled: boolean;
}

interface PolishPanelProps {
  polish: DraftPolish;
  /** Conversation context handed to the model so it keeps the thread's tone. */
  context: string;
  /** Called with the accepted polished TEXT; the caller converts it to HTML. */
  onAccept: (polished: string) => void;
  /** Only for the length-billed channels; omitted for email and chat. */
  budget?: PolishBudget;
}

interface PolishButtonProps {
  polish: DraftPolish;
  /** The user's own prose, signature/quote already stripped by splitSignature. */
  draftPlain: string;
  context: string;
  budget?: PolishBudget;
  /** Rendered beside the button — the "keep it short" toggle, where there is one. */
  children?: React.ReactNode;
}

/** The limit actually sent with the request: none unless the user ticked the toggle. */
const requested = (budget?: PolishBudget): number | undefined =>
  budget?.enabled ? budget.maxChars : undefined;

/**
 * "Polish with AI" button plus the preview card (Accept / Re-polish / Discard).
 * Visual parity with the Communications tab's inline version, extracted so
 * compose, reply and forward all share one implementation.
 */
export function PolishPanel({
  polish,
  context,
  onAccept,
  budget,
}: PolishPanelProps) {
  const { assist } = useAiConfig();
  // Same guard as the button below — see its comment. Without it here too, a preview
  // already on screen would survive the flag being switched off.
  if (!assist) return null;

  // ⚠️ Measured against the budget whether or not the toggle is on: the toggle decides
  // what we ASK for, this decides what we got. A hard limit is exceeded just as badly by
  // a reply nobody asked to be short.
  const over =
    budget && polish.preview !== null && polish.preview.length > budget.maxChars
      ? polish.preview.length
      : null;

  return (
    <>
      {polish.preview !== null && (
        <div className="rounded-md border border-teal-200 bg-teal-50/60 p-3 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700">
            <Sparkles size={13} /> AI-polished version
            {budget && (
              <span
                className={
                  over ? 'ml-auto text-destructive' : 'ml-auto text-teal-700/70'
                }
              >
                {polish.preview.length} / {budget.maxChars}
              </span>
            )}
          </div>
          <p className="text-sm whitespace-pre-wrap text-foreground">
            {polish.preview}
          </p>
          {over !== null && budget && (
            <p className="text-xs text-destructive">
              {budget.hard
                ? `Too long to send — ${over} characters, and ${budget.label} allows ${budget.maxChars}. Re-polish, or edit it down yourself.`
                : `Longer than ${budget.label} (${over} characters), so it will be billed as more than one. Accept anyway, or re-polish.`}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              // Blocked ONLY for a hard provider limit. Over-length on SMS is the user's
              // call to make — it costs more, it does not fail.
              disabled={over !== null && budget?.hard}
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
              onClick={() => polish.rePolish(context, requested(budget))}
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

/**
 * The "keep it short" toggle that rides beside the polish button.
 *
 * A CHOICE rather than something applied automatically: a text is billed per
 * 160-character segment, so shortening is usually what you want — but somebody who
 * deliberately wants a longer message should be able to have one. Default-on where
 * length costs money, one click to turn off.
 *
 * Hidden with the rest of the AI controls when assistance is off, and while a preview is
 * up — at that point the decision has already been made and `Re-polish` re-uses it.
 */
export function PolishBudgetToggle({
  polish,
  budget,
  onChange,
  disabled,
}: {
  polish: DraftPolish;
  budget: PolishBudget;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  const { assist } = useAiConfig();
  if (!assist || polish.preview !== null) return null;
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
      <Checkbox
        checked={budget.enabled}
        disabled={disabled || polish.isPending}
        onCheckedChange={(checked) => onChange(checked === true)}
      />
      Keep to {budget.label}
    </label>
  );
}

/** The trigger button — hidden once a preview is showing (which offers Re-polish). */
export function PolishButton({
  polish,
  draftPlain,
  context,
  budget,
  children,
}: PolishButtonProps) {
  const { assist } = useAiConfig();
  /**
   * ⚠️ Hidden when AI assistance is off, like every other AI control
   * (`DictateButton`, `TranslatePanel`, `AttachmentSummary`, `VoiceTranscript`).
   *
   * Polish predates the flag and was the one that did not check it, so with
   * `AI_ASSIST=0` the microphone vanished from a composer while "Polish with AI" stayed
   * and kept spending. In the text composers the two sit side by side, which is where
   * that stopped being invisible. `POST /ai/polish-reply` now refuses on the same flag,
   * so the two halves agree rather than the UI merely hiding a working route.
   */
  if (!assist) return null;
  if (polish.preview !== null) return null;
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1"
        disabled={polish.isPending || !draftPlain.trim()}
        onClick={() => polish.run(draftPlain, context, requested(budget))}
      >
        <Sparkles size={14} />
        {polish.isPending ? 'Polishing…' : 'Polish with AI'}
      </Button>
      {children}
    </>
  );
}
