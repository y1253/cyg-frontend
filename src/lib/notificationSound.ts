// The new-message chime. Synthesised rather than shipped as an audio file: it keeps
// a binary out of the repo, keeps the PWA precache globs unchanged, and makes the
// tone tunable from these constants.
//
// Everything is scheduled against `ctx.currentTime`, never `setTimeout` — background
// tabs throttle timers to as little as once per minute, while the audio render thread
// keeps its own clock. That is what lets the chime fire on time in a hidden tab.

let ctx: AudioContext | null = null;

/**
 * Create/resume the AudioContext. MUST be called from a user gesture: a context
 * created outside one starts `suspended`, and browsers only let a gesture resume it.
 * Safe to call repeatedly.
 */
export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state !== 'running') void ctx.resume();
  } catch {
    // No Web Audio (very old browser, or blocked). Callers fall back to a silent
    // notification and let the OS make the sound.
    ctx = null;
  }
}

export function audioReady(): boolean {
  return ctx?.state === 'running';
}

// Soft two-note ascending bell: G5 → C6, a perfect fourth. `at` is the offset from
// the start of the chime, `peak` the envelope top before the master gain.
const NOTES = [
  { f: 784.0, at: 0.0, peak: 0.9 }, // G5
  { f: 1046.5, at: 0.11, peak: 0.8 }, // C6, 110ms later
];

const ATTACK = 0.008; // 8ms — fast enough to read as a bell strike, not a click
const DECAY = 0.3; // 300ms exponential tail
const FLOOR = 0.0001; // exponential ramps can never reach 0

/**
 * Play the chime. Returns false when it could not play, so the caller can post the
 * desktop notification un-silenced and let the OS supply its own sound instead.
 */
export function playMessageChime(volume = 0.22): boolean {
  if (!ctx) return false;
  if (ctx.state !== 'running') {
    // Lost the context (OS sleep, or never unlocked). Nudge it for next time.
    void ctx.resume();
    return false;
  }

  // 20ms of lead so the first ramp is never scheduled in the past.
  const t0 = ctx.currentTime + 0.02;

  const master = ctx.createGain();
  master.gain.value = volume;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 3800; // shave the harsh top end
  lowpass.Q.value = 0.5;
  master.connect(lowpass).connect(ctx.destination);

  for (const note of NOTES) {
    const t = t0 + note.at;

    const env = ctx.createGain();
    env.gain.setValueAtTime(FLOOR, t);
    env.gain.exponentialRampToValueAtTime(note.peak, t + ATTACK);
    env.gain.exponentialRampToValueAtTime(FLOOR, t + DECAY);
    env.connect(master);

    const fundamental = ctx.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.value = note.f;
    // A quiet, slightly detuned octave above turns a plain sine into something
    // bell-like without making it an organ.
    const partial = ctx.createOscillator();
    partial.type = 'sine';
    partial.frequency.value = note.f * 2;
    partial.detune.value = 4;
    const partialGain = ctx.createGain();
    partialGain.gain.value = 0.22;

    fundamental.connect(env);
    partial.connect(partialGain).connect(env);

    fundamental.start(t);
    partial.start(t);
    // One-shot nodes: stopped oscillators are disconnected and collected.
    fundamental.stop(t + DECAY + 0.04);
    partial.stop(t + DECAY + 0.04);
  }

  return true;
}

// ── Ringtone ────────────────────────────────────────────────────────────────
// A repeating two-tone ring for an incoming call. Unlike the chime this must be
// STOPPABLE, so the nodes are held at module scope rather than being fire-and-forget.
//
// Scheduling is on the audio clock (`ctx.currentTime`), never `setTimeout` — a
// backgrounded tab throttles timers to roughly once a minute, and a call arriving while
// the tab is in the background is exactly the case this exists for.

let ringNodes: { osc: OscillatorNode[]; gain: GainNode } | null = null;

/** North-American ring cadence: 440+480 Hz, 2s on / 4s off. */
const RING_HZ = [440, 480];
const RING_ON = 2;
const RING_CYCLE = 6;
/** Rings before giving up, so a missed call cannot ring forever. */
const RING_CYCLES = 10;

/**
 * Start ringing. Idempotent — a second call while already ringing is ignored, which
 * matters because a re-INVITE or React StrictMode's double-effect would otherwise
 * stack a second oscillator pair that `stopRinging` could not reach.
 */
export function startRinging(volume = 0.14): boolean {
  if (!ctx || ctx.state !== 'running') {
    void ctx?.resume();
    return false;
  }
  if (ringNodes) return true;

  const t0 = ctx.currentTime + 0.02;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.connect(ctx.destination);

  // Gate the whole cadence on the audio clock up front.
  for (let i = 0; i < RING_CYCLES; i++) {
    const on = t0 + i * RING_CYCLE;
    gain.gain.setValueAtTime(0, on);
    gain.gain.linearRampToValueAtTime(volume, on + 0.05);
    gain.gain.setValueAtTime(volume, on + RING_ON - 0.05);
    gain.gain.linearRampToValueAtTime(0, on + RING_ON);
  }

  const osc = RING_HZ.map((f) => {
    const o = ctx!.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(gain);
    o.start(t0);
    o.stop(t0 + RING_CYCLES * RING_CYCLE);
    return o;
  });

  ringNodes = { osc, gain };
  return true;
}

/** Stop ringing. Safe to call when not ringing. */
export function stopRinging(): void {
  if (!ringNodes) return;
  const { osc, gain } = ringNodes;
  ringNodes = null;
  try {
    // Ramp rather than cut, or the abrupt stop clicks.
    const now = ctx?.currentTime ?? 0;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.05);
    osc.forEach((o) => o.stop(now + 0.06));
  } catch {
    // Already stopped by its scheduled end. Nothing to do.
  }
}

// ── DTMF keypress feedback ──────────────────────────────────────────────────
// The tone the agent hears when they press a key on the in-call dial pad.
//
// LOCAL FEEDBACK ONLY. It goes to `ctx.destination`, i.e. the agent's own speakers, and
// has nothing to do with the digit reaching the far end — that rides the RTP stream as an
// RFC 4733 telephone-event, generated by the browser's RTCDTMFSender. The two paths never
// meet: the outgoing sender carries the microphone (or the hold-music) track, never this
// context, so the beep cannot leak into the call.
//
// It lives in this file, rather than beside the pad, because `ctx` is module-private and
// a second AudioContext is a real hazard — browsers cap how many a page may have.

/** Ramp at each edge. Long enough to kill the click, short enough to stay a square gate. */
const DTMF_EDGE = 0.005;

/**
 * Play one key's dual tone.
 *
 * Takes the two frequencies rather than a digit, so the key→frequency table stays in
 * `lib/dtmf.ts` where it is unit-tested and this file stays about audio.
 *
 * Deliberately unlike `playMessageChime`: a chime is a bell, so it uses an exponential
 * decay and a lowpass to shave its harsh partial. DTMF is a flat GATE, and its highest
 * component is 1477 Hz — filtering or decaying it stops it sounding like the thing it is
 * imitating. The linear on/off ramps here are `startRinging`'s shape, not the chime's.
 *
 * Fire-and-forget: rapid presses OVERLAP rather than cancelling. Cancelling would need a
 * module-scope handle like `ringNodes`, which this file already documents as the shape
 * that stacks unreachable oscillators — and two 160ms tones overlapping reads as a chord,
 * not as a bug. The volume sits below the chime's on purpose: the agent has to keep
 * hearing the IVR through it.
 */
export function playDtmfTone(
  low: number,
  high: number,
  ms: number,
  volume = 0.12,
): boolean {
  if (!ctx) return false;
  if (ctx.state !== 'running') {
    void ctx.resume();
    return false;
  }

  // The same 20ms of lead as the chime, so the first ramp is never scheduled in the past.
  const t0 = ctx.currentTime + 0.02;
  const end = t0 + ms / 1000;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + DTMF_EDGE);
  gain.gain.setValueAtTime(volume, end - DTMF_EDGE);
  gain.gain.linearRampToValueAtTime(0, end);
  gain.connect(ctx.destination);

  for (const f of [low, high]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(gain);
    o.start(t0);
    // One-shot: a stopped oscillator disconnects and is collected.
    o.stop(end + 0.04);
  }

  return true;
}
