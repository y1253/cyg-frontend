import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { transcribeDictation } from '@/api/ai';
import { useAiConfig } from '@/hooks/useAiConfig';
import {
  MAX_RECORDING_SEC,
  MIN_RECORDING_MS,
  formatClock,
  micErrorMessage,
  pickRecorderMime,
  recordingFilename,
} from '@/lib/voice-recording';
import {
  startLiveTranscription,
  type LiveTranscriber,
} from '@/lib/speech-recognition';

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
 *
 * ── THE TWO ENGINES, AND WHY BOTH ─────────────────────────────────────────────
 * The live strip is the browser's Web Speech API; the text that is actually COMMITTED is
 * still the server's, from the same upload this component always made. They cover each
 * other's failure: the server's model can answer a short clip with captioned-video
 * boilerplate (which `isHallucinatedTranscript` turns into an empty answer), and the
 * browser's engine is absent in Firefox and dies with the network. Whichever one produced
 * words is the one that wins — see `send`.
 *
 * ⚠️ `onText` is still called EXACTLY ONCE, at the end, with the whole transcript. That
 * one-shot, append-only contract is what lets all twenty call sites stay untouched, and
 * it is why the live text goes in a strip of our own rather than into the composer:
 * `RichTextEditor` refuses DOM writes while it has focus, and `DockedComposer` autosaves
 * its draft to the provider on a 2s debounce.
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
  const { assist, dictationLive } = useAiConfig();
  const [phase, setPhase] = useState<'idle' | 'recording' | 'working'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [liveText, setLiveText] = useState('');

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const live = useRef<LiveTranscriber | null>(null);
  /**
   * Wall clock, not the tick count. A throttled background tab fires the interval far
   * less than once a second, so counting ticks made the five-minute cap mean "five
   * minutes of foreground" — and gave no honest duration for the `MIN_RECORDING_MS` guard.
   */
  const startedAt = useRef(0);
  /** The live text as of stop, read in `send` without waiting for a re-render. */
  const liveTextRef = useRef('');

  const release = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    live.current?.stop();
    live.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
  };

  useEffect(() => release, []);

  const start = async () => {
    setError(null);
    setLiveText('');
    liveTextRef.current = '';
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        // Dictation is one voice close to a laptop mic in a shared office. These are the
        // browser's own cleanup stages and they cost nothing to ask for; a cleaner signal
        // is the cheapest hallucination guard there is.
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
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
        const heldFor = Date.now() - startedAt.current;
        release();
        void send(blob, recordingFilename(type), heldFor);
      };
      recorder.current = rec;
      rec.start();
      startedAt.current = Date.now();
      setElapsed(0);
      setPhase('recording');

      // Advisory, and deliberately started AFTER the recorder: the upload is the real
      // output, so nothing here may be allowed to prevent it.
      if (dictationLive) {
        live.current = startLiveTranscription((text) => {
          liveTextRef.current = text;
          setLiveText(text);
        });
      }

      timer.current = setInterval(() => {
        const secs = Math.floor((Date.now() - startedAt.current) / 1000);
        setElapsed(secs);
        // The same cap the voice recorder used: past five minutes this is not
        // dictation, and OpenAI's own upload ceiling is not far beyond it.
        if (secs >= MAX_RECORDING_SEC) rec.stop();
      }, 250);
    } catch (err) {
      release();
      setPhase('idle');
      setError(micErrorMessage(err));
    }
  };

  const send = async (blob: Blob, filename: string, heldFor: number) => {
    if (!token) return;

    /**
     * ⚠️ Not a tidiness rule. A sub-second, near-silent clip is the likeliest input to
     * make a speech model answer with boilerplate, so it is never uploaded — saying what
     * happened beats paying to transcribe noise and pasting whatever comes back.
     */
    if (heldFor < MIN_RECORDING_MS) {
      setPhase('idle');
      setLiveText('');
      setError('That was too short — hold it while you speak.');
      return;
    }

    setPhase('working');
    const heard = liveTextRef.current.trim();
    try {
      const { text } = await transcribeDictation(token, blob, filename);
      const final = text.trim();
      // The server's answer wins. An empty one means silence — or a transcript its
      // hygiene filter stripped as invented — and in that case anything the browser
      // heard is strictly better than nothing.
      if (final) onText(final);
      else if (heard) onText(heard);
      else
        setError('Nothing was picked up. Try again a little closer to the mic.');
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'That recording could not be transcribed.',
      );
      // Still commit what the browser heard. The request failed; the user's sentence
      // should not be thrown away with it.
      if (heard) onText(heard);
    } finally {
      setPhase('idle');
      setLiveText('');
      liveTextRef.current = '';
    }
  };

  // Switched off for the firm: render nothing rather than a button that 403s.
  if (!assist) return null;

  const recording = phase === 'recording';

  return (
    <span className="flex flex-col items-start gap-1">
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={disabled || phase === 'working'}
          title={recording ? 'Stop and insert the text' : 'Dictate'}
          aria-label={recording ? 'Stop dictating' : 'Dictate'}
          onClick={() => {
            if (recording) recorder.current?.stop();
            else if (phase === 'idle') void start();
          }}
          className={[
            'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
            recording
              ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
              : 'border-border text-muted-foreground hover:bg-muted',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
        >
          {phase === 'working' ? (
            <Loader2 size={13} className="animate-spin" />
          ) : recording ? (
            <Square size={12} />
          ) : (
            <Mic size={13} />
          )}
          {phase === 'working'
            ? 'Transcribing…'
            : recording
              ? formatClock(elapsed)
              : 'Dictate'}
        </button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </span>

      {/*
        The live strip. Only while recording, and only once there is something to show, so
        a browser without Web Speech (Firefox) is simply this component as it always was.
        `max-h` + scroll because it sits above the composer's own buttons and a long
        dictation must not push Send off the screen.
      */}
      {recording && liveText && (
        <span
          aria-live="polite"
          className="flex max-h-20 w-full min-w-0 items-start gap-1.5 overflow-y-auto rounded-md border border-red-200 bg-red-50/60 px-2 py-1 text-xs text-muted-foreground"
        >
          <span
            aria-hidden
            className="mt-1 size-1.5 shrink-0 animate-pulse rounded-full bg-red-500"
          />
          <span className="min-w-0 break-words">{liveText}</span>
        </span>
      )}
    </span>
  );
}
