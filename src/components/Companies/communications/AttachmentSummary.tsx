import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { summarizeEmailAttachment } from '@/api/ai';
import { useAiConfig } from '@/hooks/useAiConfig';

/**
 * "What does this attachment say?" — for a PDF, a scan or a photo of a document.
 *
 * ── ON DEMAND, AND ONLY ON DEMAND ─────────────────────────────────────────────
 * Summarising every attachment as it arrives would bill for every statement nobody
 * opens, and would send every client document to OpenAI whether or not anybody needed
 * it read. The same argument `PHONE_SUMMARIZE_CALLS` is default-OFF for. So this is a
 * button, pressed once, by somebody who has decided it is worth it.
 *
 * Teal + `Sparkles`, the pairing `CallSummaryPanel` establishes for "a model wrote this".
 */
export function AttachmentSummary({
  companyId,
  messageId,
  attachmentId,
  filename,
  size,
}: {
  companyId: number;
  messageId: string;
  attachmentId: string;
  filename: string;
  size: number | null;
}) {
  const { token } = useAuth();
  const { assist } = useAiConfig();
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Switched off for the firm: no control, rather than one that fails when pressed.
  if (!assist) return null;

  const run = async () => {
    if (!token || busy || summary) return;
    setBusy(true);
    setError(null);
    try {
      const res = await summarizeEmailAttachment(
        token,
        companyId,
        messageId,
        attachmentId,
        { filename, size: size ?? 0 },
      );
      setSummary(res.summary);
    } catch (err) {
      // The server refuses an unreadable type with a sentence naming what CAN be read,
      // which is the whole point of refusing up front rather than failing inside a
      // decoder — so it is shown verbatim.
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'That attachment could not be summarised.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1 flex flex-col gap-1">
      {!summary && (
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex w-fit items-center gap-1 text-[10px] font-medium text-teal-700 underline-offset-2 hover:underline disabled:opacity-60"
        >
          {busy ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Sparkles size={11} />
          )}
          {busy ? 'Reading…' : 'Summarise'}
        </button>
      )}
      {error && <span className="text-[10px] text-destructive">{error}</span>}
      {summary && (
        <div className="rounded-md border border-teal-200 bg-teal-50/60 px-2 py-1.5">
          <span className="mb-0.5 flex items-center gap-1 text-[10px] font-medium text-teal-700">
            <Sparkles size={10} /> AI summary
          </span>
          <span className="whitespace-pre-wrap text-xs text-foreground">
            {summary}
          </span>
          <span className="mt-1 block text-[10px] text-muted-foreground">
            Generated from the file — open it before relying on this.
          </span>
        </div>
      )}
    </div>
  );
}
