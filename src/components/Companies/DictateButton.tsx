import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { transcribeDictation } from '@/api/ai';
import { useAiConfig } from '@/hooks/useAiConfig';
import {
  MAX_RECORDING_SEC,
  formatClock,
  micErrorMessage,
  pickRecorderMime,
  recordingFilename,
} from '@/lib/voice-recording';

/**
 * Speak into any composer and get text.
 *
 * ── WHY THIS IS NOT `VoiceRecorder` ───────────────────────────────────────────
 * That component was SEND-shaped: record, then a preview with Send and Discard, because
 * its output was a voice note the customer would hear. Dictation has no preview to offer
 * — the output is text, which lands in the box the user is already looking at and which
 * they can then edit like anything else they typed. Wiring a preview in front of that
 * would be a confirmation step for something entirely undoable.
 *
 * It reuses `voice-recording.ts` wholesale — container negotiation, the five-minute cap,
 * the clock, and the mic-error wording — which is the half of `VoiceRecorder` that was
 * always general.
 *
 * ⚠️ The microphone is released on stop, on cancel AND on unmount. A component that
 * leaves a track live leaves the browser's recording indicator on, which reads as the app
 * listening to somebody who thinks they have stopped.
 */
export function DictateButton({
  onText,
  disabled,
}: {
  /** Called with the transcript. The caller decides where in the draft it lands. */
  onText: (text: string) => void;
  disabled?: boolean;
}) {
  const { token } = useAuth();
  const { assist } = useAiConfig();
  const [phase, setPhase] = useState<'idle' | 'recording' | 'working'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const release = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
  };

  useEffect(() => release, []);

  const start = async () => {
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const mime = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunks.current, { type });
        release();
        void send(blob, recordingFilename(type));
      };
      recorder.current = rec;
      rec.start();
      setElapsed(0);
      setPhase('recording');
      timer.current = setInterval(() => {
        setElapsed((s) => {
          // The same cap the voice recorder used: past five minutes this is not
          // dictation, and OpenAI's own upload ceiling is not far beyond it.
          if (s + 1 >= MAX_RECORDING_SEC) rec.stop();
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      release();
      setPhase('idle');
      setError(micErrorMessage(err));
    }
  };

  const send = async (blob: Blob, filename: string) => {
    if (!token) return;
    setPhase('working');
    try {
      const { text } = await transcribeDictation(token, blob, filename);
      // An empty transcript is not an error — it is silence, and saying so beats
      // pasting nothing into the box and looking broken.
      if (text.trim()) onText(text.trim());
      else setError('Nothing was picked up. Try again a little closer to the mic.');
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'That recording could not be transcribed.',
      );
    } finally {
      setPhase('idle');
    }
  };

  // Switched off for the firm: render nothing rather than a button that 403s.
  if (!assist) return null;

  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={disabled || phase === 'working'}
        title={phase === 'recording' ? 'Stop and insert the text' : 'Dictate'}
        aria-label={phase === 'recording' ? 'Stop dictating' : 'Dictate'}
        onClick={() => {
          if (phase === 'recording') recorder.current?.stop();
          else if (phase === 'idle') void start();
        }}
        className={[
          'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
          phase === 'recording'
            ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
            : 'border-border text-muted-foreground hover:bg-muted',
          'disabled:cursor-not-allowed disabled:opacity-50',
        ].join(' ')}
      >
        {phase === 'working' ? (
          <Loader2 size={13} className="animate-spin" />
        ) : phase === 'recording' ? (
          <Square size={12} />
        ) : (
          <Mic size={13} />
        )}
        {phase === 'working'
          ? 'Transcribing…'
          : phase === 'recording'
            ? formatClock(elapsed)
            : 'Dictate'}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
