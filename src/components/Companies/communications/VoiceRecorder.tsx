import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Send, Square, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  MAX_RECORDING_SEC,
  formatClock,
  micErrorMessage,
  pickRecorderMime,
  recordingFilename,
} from '@/lib/voice-recording';

type Phase = 'idle' | 'recording' | 'preview';

/**
 * Record a voice note, listen back, send.
 *
 * The browser records whatever it can (webm in Chrome, mp4 in Safari); the server turns it
 * into Ogg/Opus, which is what WhatsApp shows as a voice message.
 *
 * ⚠️ The microphone is released on stop, cancel, discard AND unmount. Closing the thread
 * mid-recording would otherwise leave the browser's mic indicator on with nothing
 * recording — the kind of thing that makes people distrust the app.
 */
export function VoiceRecorder({
  disabled,
  sending,
  uploadProgress,
  onSend,
}: {
  disabled: boolean;
  sending: boolean;
  uploadProgress: number | null;
  /** Resolve once sent; the recorder resets. Reject to keep the preview for a retry. */
  onSend: (recording: Blob, filename: string) => Promise<unknown>;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const discardRef = useRef(false);

  const previewUrl = useMemo(
    () => (recording ? URL.createObjectURL(recording) : null),
    [recording],
  );
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const stop = () => {
    stopTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else releaseMic();
  };

  // Unmount: throw the recording away and let go of the microphone.
  useEffect(
    () => () => {
      discardRef.current = true;
      stopTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    },
    [],
  );

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record audio.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError(micErrorMessage(err));
      return;
    }
    streamRef.current = stream;

    const mime = pickRecorderMime((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    discardRef.current = false;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      releaseMic();
      if (discardRef.current) {
        setPhase('idle');
        return;
      }
      const type = recorder.mimeType || mime || 'audio/webm';
      setRecording(new Blob(chunksRef.current, { type }));
      setPhase('preview');
    };
    recorderRef.current = recorder;
    recorder.start(250);

    const startedAt = Date.now();
    setElapsed(0);
    setPhase('recording');
    timerRef.current = window.setInterval(() => {
      const sec = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(sec);
      if (sec >= MAX_RECORDING_SEC) stop();
    }, 250);
  };

  const cancel = () => {
    discardRef.current = true;
    stop();
  };

  const discard = () => {
    setRecording(null);
    setPhase('idle');
  };

  const send = () => {
    if (!recording) return;
    onSend(recording, recordingFilename(recording.type)).then(
      () => {
        setRecording(null);
        setPhase('idle');
      },
      () => {
        // Keep the preview so the user can retry; the parent shows the error.
      },
    );
  };

  if (phase === 'recording') {
    return (
      <div className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        <span className="text-xs font-medium tabular-nums text-red-700">
          {formatClock(elapsed)} / {formatClock(MAX_RECORDING_SEC)}
        </span>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={stop}>
          <Square size={12} className="fill-current" /> Stop
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={cancel} title="Cancel">
          <X size={13} />
        </Button>
      </div>
    );
  }

  if (phase === 'preview' && previewUrl) {
    return (
      <div className="flex w-full flex-col gap-2">
        <audio controls src={previewUrl} className="h-9 w-full" />
        <div className="flex items-center justify-end gap-2">
          {sending && uploadProgress !== null && (
            <span className="text-xs tabular-nums text-muted-foreground">
              Uploading {Math.round(uploadProgress * 100)}%
            </span>
          )}
          <Button size="sm" variant="outline" className="gap-1" disabled={sending} onClick={discard}>
            <Trash2 size={13} /> Discard
          </Button>
          <Button
            size="sm"
            className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={sending || disabled}
            onClick={send}
          >
            <Send size={13} />
            {sending ? 'Sending…' : 'Send voice message'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        className="gap-1"
        disabled={disabled}
        onClick={() => void start()}
        title="Record a voice message"
      >
        <Mic size={13} /> Record
      </Button>
      {error && <span className="max-w-xs text-right text-xs text-destructive">{error}</span>}
    </div>
  );
}
