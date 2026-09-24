/**
 * The live half of dictation: text on screen while the user is still talking.
 *
 * ── WHY THE BROWSER AND NOT OUR OWN SERVER ────────────────────────────────────
 * OpenAI's `/v1/audio/transcriptions` cannot do this. Its `stream: true` streams the
 * OUTPUT of an already-complete file; live audio needs the Realtime WebSocket API, which
 * would mean a socket proxy, an nginx upgrade block and a new dependency — for a preview
 * that is thrown away the moment the authoritative transcript lands.
 *
 * So the preview is the browser's own Web Speech API: free, instant, and no transport at
 * all. `DictateButton` still records and uploads exactly as before, and what it commits
 * into the composer is still the server's answer. This only decides what is on screen for
 * the few seconds in between.
 *
 * ⚠️ It is ADVISORY and must stay that way. Three reasons it can silently produce
 * nothing, none of which may surface as an error:
 *   - Firefox does not implement it at all, so `start` returns null;
 *   - it opens its OWN microphone capture alongside `MediaRecorder`'s, and a second
 *     consumer can be refused;
 *   - Chrome routes the audio to GOOGLE, so it fails with the network.
 * An error banner here would tell somebody dictation had failed when the recording is
 * running perfectly well. Hence `AI_DICTATION_LIVE` is its own flag, and hence every
 * handler below swallows.
 *
 * ⚠️ It takes ONE `lang` and cannot auto-detect, while `transcribeAudio` deliberately
 * sends no language hint because staff here mix French and English inside a sentence. The
 * preview is therefore single-language and the committed transcript is not — acceptable
 * only because the preview is never the thing that gets sent.
 */

/**
 * Minimal shapes for an API `lib.dom` does not declare.
 *
 * Named so they cannot collide with anything TypeScript may add later, and holding only
 * the handful of members used here — the same approach `ai.service.ts` takes to the
 * OpenAI response bodies.
 */
interface LiveResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: { readonly transcript: string } | undefined;
}

interface LiveResultEvent {
  readonly results: ArrayLike<LiveResult>;
}

interface LiveRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: LiveResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => LiveRecognition;

/**
 * Chrome ends a session on its own silence timeout even with `continuous`, so the wrapper
 * restarts it. The counter is what stops an engine that is failing immediately — a
 * revoked permission, say — from spinning restarts for the length of the recording.
 */
const MAX_RESTARTS = 60;

/** Space-join two fragments without producing a leading or doubled space. */
export function appendSegment(committed: string, addition: string): string {
  const a = committed.trim();
  const b = addition.trim();
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`;
}

/**
 * Flatten one session's results — finalised segments plus the interim tail — into a line.
 *
 * Pure, and exported only so it can be tested without a browser: it is the one piece of
 * this module with logic worth pinning, and `SpeechRecognition` cannot be instantiated in
 * a test environment.
 */
export function joinResults(results: ArrayLike<LiveResult>): string {
  let out = '';
  for (let i = 0; i < results.length; i += 1) {
    const alternative = results[i]?.[0];
    if (alternative) out = appendSegment(out, alternative.transcript);
  }
  return out;
}

/** The constructor, under either name, or null where the browser has neither. */
function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Whether a live preview is possible at all in this browser. */
export function liveTranscriptionSupported(): boolean {
  return recognitionCtor() !== null;
}

export interface LiveTranscriber {
  /** Detach every handler and release the recogniser's own microphone capture. */
  stop(): void;
}

/**
 * Begin a live preview, or return null if this browser cannot give one.
 *
 * `onText` receives the whole transcript so far on every update, not a delta — the caller
 * renders it directly, so there is nothing for it to accumulate and nothing to get out of
 * step when a session restarts.
 */
export function startLiveTranscription(
  onText: (text: string) => void,
): LiveTranscriber | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;

  let recognition: LiveRecognition;
  try {
    recognition = new Ctor();
  } catch {
    return null;
  }

  // Text from sessions that have already ended. A restart hands back a fresh results
  // list, so without this every silence gap would wipe what the user had just said.
  let committed = '';
  // The current session's text, kept so `onend` can fold it into `committed` before the
  // results list is replaced.
  let sessionText = '';
  let restarts = 0;
  let active = true;

  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang =
    typeof navigator !== 'undefined' && navigator.language
      ? navigator.language
      : 'en-US';

  recognition.onresult = (event) => {
    if (!active) return;
    sessionText = joinResults(event.results);
    onText(appendSegment(committed, sessionText));
  };

  // Swallowed on purpose — see the ⚠️ at the top of this file.
  recognition.onerror = () => undefined;

  recognition.onend = () => {
    if (!active) return;
    // Fold this session's text away BEFORE restarting: the new session starts with an
    // empty results list, so anything not committed here is lost at the first silence.
    committed = appendSegment(committed, sessionText);
    sessionText = '';
    if (restarts >= MAX_RESTARTS) return;
    restarts += 1;
    try {
      recognition.start();
    } catch {
      active = false;
    }
  };

  try {
    recognition.start();
  } catch {
    return null;
  }

  return {
    stop() {
      active = false;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        // Already stopped, or never started. Nothing to release.
      }
    },
  };
}
