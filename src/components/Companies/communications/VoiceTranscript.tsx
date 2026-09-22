import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { transcribeWhatsAppVoice, type WhatsAppItem } from '@/api/whatsapp';
import { useAiConfig } from '@/hooks/useAiConfig';

/**
 * What a client said in a voice note, as text.
 *
 * ── ON DEMAND, AND THEN KEPT ──────────────────────────────────────────────────
 * Transcribing every voice note as it arrives would bill for every one nobody plays, and
 * would ship every client's recorded voice to OpenAI whether or not anybody needed it
 * read — the larger version of the decision `PHONE_SUMMARIZE_CALLS` is default-OFF for.
 * So it is a button. The server stores the result, so the second person to read the
 * thread pays nothing.
 *
 * Its own flag (`AI_TRANSCRIBE_INBOUND`) on top of the master switch, because this is the
 * one feature here that creates a stored verbatim record of somebody's speech.
 */
export function VoiceTranscript({
  companyId,
  message,
}: {
  companyId: number;
  message: WhatsAppItem;
}) {
  const { token } = useAuth();
  const { assist, transcribeInbound } = useAiConfig();
  const [text, setText] = useState<string | null>(message.transcript ?? null);
  const [status, setStatus] = useState<string | null>(
    message.transcriptStatus ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!assist || !transcribeInbound) return null;
  if (!message.isVoice) return null;

  const run = async () => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await transcribeWhatsAppVoice(
        token,
        companyId,
        message.messageId,
      );
      setText(res.transcript);
      setStatus(res.status);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'That voice note could not be transcribed.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1 flex flex-col gap-1">
      {text === null && status !== 'skipped' && (
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex w-fit items-center gap-1 text-[10px] font-medium text-teal-700 underline-offset-2 hover:underline disabled:opacity-60"
        >
          {busy ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <FileText size={11} />
          )}
          {busy ? 'Listening…' : 'Show transcript'}
        </button>
      )}
      {error && <span className="text-[10px] text-destructive">{error}</span>}
      {/* `skipped` is what a throat-clear or two seconds of silence produces. Saying so
          beats an empty panel, and beats a confident sentence invented out of noise —
          the reason the shared `MIN_TRANSCRIPT_CHARS` floor exists at all. */}
      {status === 'skipped' && (
        <span className="text-[10px] italic text-muted-foreground">
          Nothing clear enough to transcribe.
        </span>
      )}
      {text && (
        <div className="rounded-md border border-teal-200 bg-teal-50/60 px-2 py-1.5">
          <span className="mb-0.5 block text-[10px] font-medium text-teal-700">
            Transcript
          </span>
          <span className="whitespace-pre-wrap break-words text-xs text-foreground">
            {text}
          </span>
        </div>
      )}
    </div>
  );
}
