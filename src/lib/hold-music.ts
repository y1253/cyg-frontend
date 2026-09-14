/**
 * Hold music, played from THIS browser into the live call.
 *
 * The caller hears music because we swap the microphone track on the outgoing RTP stream
 * for one generated here — the same trick mute uses, one step further. Nothing about how
 * the call is routed changes, which is why hold works identically on inbound and outbound
 * calls and needs no cooperation from the provider.
 *
 * WebAudio is what turns an <audio> element into a track a peer connection will accept:
 *   <audio loop> -> MediaElementSource -> MediaStreamDestination -> stream.getAudioTracks()
 *
 * The element is never attached to the document and its output is never connected to
 * `ctx.destination`, so the agent does not hear it locally — only the far end does.
 */
export interface HoldMusic {
  track: MediaStreamTrack;
  stop: () => void;
}

/**
 * Build a looping music track, or return null if the browser refuses.
 *
 * Never throws: hold must still work when this fails. A null result means the caller falls
 * back to silence, which is a worse hold but a working one.
 */
/**
 * ONE AudioContext for every hold, created lazily and never closed.
 *
 * ⚠️ It used to be one context per held call. Browsers cap how many a page may have — six
 * or so in Chrome — and call waiting lets an agent park several callers at once, so the
 * per-call version would start returning `null` partway down the list. That failure is
 * graceful and therefore invisible: the caller falls through to a SILENT hold, and the only
 * symptom is a customer who says we hung up on them.
 *
 * Each HoldMusic still owns its own <audio>, source node and destination — it must, since
 * each feeds a different peer connection and has to stop independently. Only the context is
 * shared, which is why `stop()` below no longer closes it.
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

export async function startHoldMusic(url: string): Promise<HoldMusic | null> {
  try {
    const ctx = holdContext();
    if (!ctx) return null;
    // Safari starts contexts suspended even inside a gesture.
    if (ctx.state === 'suspended') await ctx.resume();

    const el = new Audio(url);
    el.loop = true;
    // Same-origin, so no crossOrigin attribute — setting one would make the fetch a CORS
    // request and taint the element, and WebAudio refuses to read a tainted source.
    el.preload = 'auto';

    const source = ctx.createMediaElementSource(el);
    const dest = ctx.createMediaStreamDestination();
    source.connect(dest);

    await el.play();

    const track = dest.stream.getAudioTracks()[0];
    if (!track) {
      el.pause();
      return null;
    }

    return {
      track,
      stop: () => {
        // Order matters only in that everything must happen even if one step throws. The
        // context is deliberately NOT closed: it is shared with every other held call, and
        // a closed AudioContext cannot be reopened.
        try {
          el.pause();
          el.src = '';
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
  } catch {
    return null;
  }
}
