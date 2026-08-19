/**
 * Loads the MediaPipe face detector, once, for the whole app.
 *
 * The model and its WASM runtime are served from our own origin (see
 * `public/mediapipe/`) rather than a CDN. Face login is the *first* screen of an
 * installable app, and a feature whose whole selling point is being faster than
 * typing a password should not be able to break because a third-party CDN is
 * unreachable from the office network.
 *
 * Everything here is best-effort. If the model will not load, callers fall back to
 * the manual capture button, which is exactly the behaviour that existed before.
 */
import type { FaceDetector } from '@mediapipe/tasks-vision';

/** Resolved against BASE_URL so this survives any future Vite `base` change. */
const MP_BASE = `${import.meta.env.BASE_URL}mediapipe`;

/** Beyond this, assume it is never arriving and let the caller degrade. */
const LOAD_TIMEOUT_MS = 6000;

let detectorPromise: Promise<FaceDetector> | null = null;
let inUse = false;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('face detector load timed out')),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

async function create(): Promise<FaceDetector> {
  // Dynamic import: the package is ~1MB of JS, and static-importing it would put
  // it in the main bundle and delay first paint of the very screen this is meant
  // to make feel fast.
  const { FaceDetector: Detector, FilesetResolver } = await import(
    '@mediapipe/tasks-vision'
  );

  const vision = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);

  const options = {
    baseOptions: {
      modelAssetPath: `${MP_BASE}/blaze_face_short_range.tflite`,
      delegate: 'GPU' as const,
    },
    runningMode: 'VIDEO' as const,
    // Deliberately permissive at the model level. The app-level accept threshold
    // is higher (DEFAULT_GATE.minConfidence): we want to *know* a weak face is
    // there so we can say "move closer", rather than have it vanish into no-face.
    minDetectionConfidence: 0.5,
  };

  try {
    return await Detector.createFromOptions(vision, options);
  } catch {
    // GPU init fails on some virtualised and locked-down machines. One 128px
    // detection at 15fps is well within CPU budget.
    return await Detector.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'CPU' as const },
    });
  }
}

export function getFaceDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = withTimeout(create(), LOAD_TIMEOUT_MS).catch(
      (err: unknown) => {
        // Do not let one transient failure poison the singleton forever — clear it
        // so the next mount gets a fresh attempt.
        detectorPromise = null;
        throw err instanceof Error ? err : new Error(String(err));
      },
    );
  }
  return detectorPromise;
}

/**
 * Start loading early, ignoring the result.
 *
 * Called when the email stage mounts so the model is warm by the time the camera
 * opens one stage later, which hides the download behind the user typing.
 */
export function warmup(): void {
  void getFaceDetector().catch(() => undefined);
}

/**
 * Claim the shared detector.
 *
 * A `runningMode: 'VIDEO'` detector requires monotonically increasing timestamps,
 * so two components calling `detectForVideo` on one instance will throw. Only one
 * camera is ever on screen today; this makes that assumption explicit, and a second
 * consumer degrades to manual capture instead of breaking both.
 */
export function acquire(): boolean {
  if (inUse) return false;
  inUse = true;
  return true;
}

export function release(): void {
  inUse = false;
}
