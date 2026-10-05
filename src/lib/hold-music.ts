/**
 * Hold music, played from THIS browser into the live call.
 *
 * The caller hears music because we swap the microphone track on the outgoing RTP stream
 * for one generated here — the same trick mute uses, one step further. Nothing about how
 * the call is routed changes, which is why hold works identically on inbound and outbound
 * calls and needs no cooperation from the provider.
 *
 * WebAudio is what turns the file into a track a peer connection will accept:
 *   fetch -> decodeAudioData -> AudioBufferSourceNode(loop) -> MediaStreamDestination
 *
 * ⚠️ It used to be an `<audio loop>` element feeding a MediaElementSource, and that is why
 * hold went SILENT. The element is subject to the autoplay policy — its `play()` runs after
 * two awaited HTTP requests, by which point the browser no longer counts the Hold click as
 * a user gesture — and it streams the file through Range/206 requests. Any refusal threw,
 * was swallowed, and the caller got silence with nothing in the console. A buffer source
 * has no autoplay policy of its own: all it needs is a RUNNING context, and
 * `primeHoldAudio()` gets one inside the click.
 *
 * Nothing is connected to `ctx.destination`, so the agent does not hear it locally — only
 * the far end does.
 */
export interface HoldMusic {
  track: MediaStreamTrack;
  stop: () => void;
}

/**
 * ONE AudioContext for every hold, created lazily and never closed.
 *
 * ⚠️ It used to be one context per held call. Browsers cap how many a page may have — six
 * or so in Chrome — and call waiting lets an agent park several callers at once, so the
 * per-call version would start returning `null` partway down the list. That failure is
 * graceful and therefore invisible: the caller falls through to a SILENT hold, and the only
 * symptom is a customer who says we hung up on them.
 *
 * Each HoldMusic still owns its own source node and destination — it must, since each
 * feeds a different peer connection and has to stop independently. Only the context is
 * shared, which is why `stop()` below never closes it.
 */
let sharedCtx: AudioContext | null = null;

function holdContext(): AudioContext | null {
  if (sharedCtx && sharedCtx.state !== 'closed') return sharedCtx;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  sharedCtx = new Ctor();
  return sharedCtx;
}

/**
 * Create and resume the hold context INSIDE the user's click.
 *
 * ⚠️ Must be called synchronously from the click handler, before any await — the same rule
 * `unlockAudio()` follows at every dial site. A context created or resumed after the click
 * has yielded to a promise may stay `suspended`, and a suspended context produces a track
 * full of silence.
 */
export function primeHoldAudio(): void {
  try {
    const ctx = holdContext();
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  } catch {
    /* best-effort; startHoldMusic tries again */
  }
}

/** Decoded tracks, keyed by URL minus its token, so a second hold costs no download. */
const buffers = new Map<string, Promise<AudioBuffer>>();

/** A stuck promise must not strand the hold: past this we give up and hold silently. */
const HOLD_STEP_TIMEOUT_MS = 8_000;

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${what} timed out`)),
      HOLD_STEP_TIMEOUT_MS,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

function cacheKey(url: string): string {
  return url.replace(/([?&])token=[^&]*/, '$1');
}

function loadBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const key = cacheKey(url);
  const cached = buffers.get(key);
  if (cached) return cached;
  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`hold track fetch failed: HTTP ${res.status}`);
    const bytes = await res.arrayBuffer();
    return ctx.decodeAudioData(bytes);
  })();
  buffers.set(key, p);
  // A failure must not be cached — the next hold should try again.
  p.catch(() => buffers.delete(key));
  return p;
}

/**
 * Build a looping music track, or return null if anything refuses.
 *
 * Never throws: hold must still work when this fails. A null result means the caller falls
 * back to silence, which is a worse hold but a working one — and it is LOGGED, because a
 * silent failure here is exactly how hold music stopped working without anybody knowing.
 */
export async function startHoldMusic(url: string): Promise<HoldMusic | null> {
  try {
    const ctx = holdContext();
    if (!ctx) {
      console.warn('[hold-music] WebAudio is not available in this browser');
      return null;
    }
    if (ctx.state === 'suspended') {
      await withTimeout(ctx.resume(), 'AudioContext.resume');
    }

    const buffer = await withTimeout(loadBuffer(ctx, url), 'loading the hold track');

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const dest = ctx.createMediaStreamDestination();
    source.connect(dest);
    source.start();

    const track = dest.stream.getAudioTracks()[0];
    if (!track) {
      source.stop();
      console.warn('[hold-music] the destination produced no audio track');
      return null;
    }

    return {
      track,
      stop: () => {
        // Every step must happen even if one throws. The context is deliberately NOT
        // closed: it is shared with every other held call, and a closed AudioContext
        // cannot be reopened.
        try {
          source.stop();
        } catch {
          /* ignore */
        }
        try {
          source.disconnect();
        } catch {
          /* ignore */
        }
        try {
          track.stop();
        } catch {
          /* ignore */
        }
        try {
          dest.disconnect();
        } catch {
          /* ignore */
        }
      },
    };
  } catch (err) {
    console.warn('[hold-music] falling back to a silent hold:', err);
    return null;
  }
}
