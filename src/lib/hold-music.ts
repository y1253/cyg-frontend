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
export async function startHoldMusic(url: string): Promise<HoldMusic | null> {
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;

    const ctx = new Ctor();
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
      void ctx.close();
      return null;
    }

    return {
      track,
      stop: () => {
        // Order matters only in that everything must happen even if one step throws —
        // a leaked AudioContext per call is a real leak, and browsers cap how many exist.
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
        void ctx.close().catch(() => undefined);
      },
    };
  } catch {
    return null;
  }
}
