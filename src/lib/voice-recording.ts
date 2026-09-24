/**
 * Pure helpers for recording a voice note in the browser. Unit-tested.
 */

/**
 * Tried in order. The container goes to OpenAI exactly as the browser produced it — webm,
 * ogg and mp4 are all accepted formats — so this only has to find SOMETHING the browser
 * can record: Firefox gives ogg, Chrome webm, Safari mp4.
 *
 * (It used to say the server transcoded all of this to Ogg/Opus. That was true of the
 * WhatsApp voice-note path, which has since been removed; these helpers are dictation's
 * now, and nothing re-encodes a dictation.)
 */
export const RECORDER_MIME_CANDIDATES = [
  'audio/ogg;codecs=opus',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
];

/** Stops automatically — a forgotten recording must not run until the 16 MB cap. */
export const MAX_RECORDING_SEC = 5 * 60;

/**
 * Shorter than this and the clip is not uploaded at all.
 *
 * ⚠️ This is a hallucination guard, not a tidiness rule. A sub-second, mostly-silent clip
 * is the single likeliest input to make a speech model answer with captioned-video
 * boilerplate — the reported "Thank you for watching" — so refusing to send one is both
 * cheaper and more honest than transcribing it and hoping. The server's
 * `isHallucinatedTranscript` is the backstop for everything that does get sent.
 */
export const MIN_RECORDING_MS = 700;

/** The first supported candidate, or null to let the browser pick its default. */
export function pickRecorderMime(isSupported: ((mime: string) => boolean) | null): string | null {
  if (!isSupported) return null;
  return RECORDER_MIME_CANDIDATES.find((mime) => isSupported(mime)) ?? null;
}

/** An upload filename whose extension matches the recorded container. */
export function recordingFilename(mime: string | null | undefined): string {
  const base = (mime ?? '').split(';')[0].trim().toLowerCase();
  if (base === 'audio/ogg') return 'voice-message.ogg';
  if (base === 'audio/mp4') return 'voice-message.m4a';
  return 'voice-message.webm';
}

/** `65` -> `1:05`. */
export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** getUserMedia's DOMException names, in words somebody can act on. */
export function micErrorMessage(err: unknown): string {
  const name = err instanceof Error || (err && typeof err === 'object' && 'name' in err)
    ? String((err as { name?: unknown }).name)
    : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access is blocked. Allow it in the browser to record a voice message.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found.';
    case 'NotReadableError':
      return 'The microphone is in use by another app.';
    default:
      return 'Could not start recording.';
  }
}
