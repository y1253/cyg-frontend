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
