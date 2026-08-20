/**
 * Decides whether a camera frame is good enough to send to face recognition.
 *
 * The point is to stop sending bad frames at all. Previously the user pressed a
 * button whenever they liked, so blurry, dark and half-out-of-frame photos went to
 * the server, got rejected, and were retried — each round trip costing a second or
 * more. Everything here runs locally on the video stream, so a bad frame costs
 * nothing but a hint on screen.
 *
 * Pure by design: no React, no canvas ownership, no MediaPipe imports. The
 * thresholds are guesses until they are tuned against the real office webcams, and
 * pure functions are what make that tuning testable.
 */

/**
 * Which head position a capture requires.
 *
 * Direction is **relative**, not absolute: `turn` accepts either side and
 * `turn-opposite` simply requires the other side from whichever way the previous
 * shot went. Absolute left/right cannot be determined reliably here — the preview
 * is CSS-mirrored while the detector sees unmirrored pixels, and MediaPipe's eye
 * ordering is anatomical (the subject's left/right, not the image's). Making
 * nothing depend on absolute direction removes that failure mode rather than
 * guessing at it, and three distinct angles is the actual goal anyway.
 */
export type PoseTarget = 'any' | 'straight' | 'turn' | 'turn-opposite';

export type GateReason =
  | 'no-face'
  | 'multiple-faces'
  | 'too-small'
  | 'too-large'
  | 'off-center'
  | 'blurry'
  | 'too-dark'
  | 'too-bright'
  | 'wrong-pose';

/** A face box in pixels, matching MediaPipe's `boundingBox`. */
export interface BoundingBox {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/** A landmark normalised to 0..1 of the frame, matching MediaPipe's `keypoints`. */
export interface Keypoint {
  x: number;
  y: number;
}

export interface FaceCandidate {
  boundingBox: BoundingBox;
  keypoints: Keypoint[];
  score: number;
}

export interface FrameMetrics {
  faceCount: number;
  confidence: number;
  /** |centre − 0.5| on each axis, as a fraction of the frame. */
  centerOffsetX: number;
  centerOffsetY: number;
  /** Face box width as a fraction of frame width. */
  sizeRatio: number;
  sharpness: number;
  brightness: number;
  yaw: number;
  /**
   * The detected face box, normalised to 0..1 of the frame.
   *
   * This is uploaded with the photo so the server can crop to the face before
   * sending it on for recognition. Normalised rather than in pixels so that
   * nothing downstream — the composer, the API helper, the server — has to know
   * the frame dimensions or worry about whether they still match the JPEG.
   */
  box: { x: number; y: number; w: number; h: number };
  /**
   * `performance.now()` when this frame was judged. Lets a consumer ask whether
   * the reading is still current; see the manual capture button.
   */
  at: number;
}

export interface GateConfig {
  minConfidence: number;
  minSizeRatio: number;
  maxSizeRatio: number;
  maxCenterOffsetX: number;
  maxCenterOffsetY: number;
  minSharpness: number;
  minBrightness: number;
  maxBrightness: number;
  maxYawStraight: number;
  minYawTurned: number;
}

export const DEFAULT_GATE: GateConfig = {
  minConfidence: 0.6,
  minSizeRatio: 0.28,
  maxSizeRatio: 0.75,
  maxCenterOffsetX: 0.12,
  // Looser vertically: people sit at noticeably different heights relative to a
  // fixed monitor camera, and that is not a quality problem.
  maxCenterOffsetY: 0.14,
  // Variance-of-Laplacian on a 128px grayscale face crop. Needs tuning on real
  // hardware; the manual fallback exists so a too-strict value is never a dead end.
  minSharpness: 45,
  minBrightness: 55,
  maxBrightness: 215,
  maxYawStraight: 0.1,
  minYawTurned: 0.18,
};

/** Consecutive good frames required before firing. ~0.33s at 15fps. */
export const REQUIRED_STREAK = 5;

/** Inference cadence. 60fps detection would make the login page janky for nothing. */
export const DETECT_INTERVAL_MS = 66;

export const GATE_MESSAGES: Record<GateReason, string> = {
  'no-face': 'Looking for your face…',
  'multiple-faces': 'Only one person in frame, please',
  'too-small': 'Move closer',
  'too-large': 'Move back a little',
  'off-center': 'Center your face in the oval',
  blurry: 'Hold still',
  'too-dark': 'Too dark — find better light',
  'too-bright': 'Too bright — move away from the light',
  'wrong-pose': 'Turn your head to one side',
};

/** Pose-specific wording. Never names a side we cannot reliably identify. */
export function poseMessage(pose: PoseTarget): string {
  switch (pose) {
    case 'turn':
      return 'Turn your head to one side';
    case 'turn-opposite':
      return 'Now turn the other way';
    case 'straight':
      return 'Look straight at the camera';
    default:
      return GATE_MESSAGES['wrong-pose'];
  }
}

export function reasonMessage(reason: GateReason, pose: PoseTarget): string {
  return reason === 'wrong-pose' ? poseMessage(pose) : GATE_MESSAGES[reason];
}

/**
 * Head yaw, as the nose's offset from the eye midpoint divided by the distance
 * between the eyes.
 *
 * Dividing by the interocular distance is what makes this scale-invariant: a raw
 * pixel offset would change simply because the user leaned closer, and the gate
 * would drift with distance. Roughly 0 when facing forward, ±0.35–0.5 at ±30°.
 *
 * MediaPipe's BlazeFace emits 6 keypoints in a fixed order: eye, eye, nose tip,
 * mouth, ear tragion, ear tragion. The tragions are the least stable of the six and
 * disappear at exactly the angle being measured, so the nose/eye relation is used
 * instead.
 */
export function estimateYaw(keypoints: Keypoint[]): number {
  if (keypoints.length < 3) return 0;
  const [eyeA, eyeB, nose] = keypoints;
  const eyeMidX = (eyeA.x + eyeB.x) / 2;
  const eyeSpan = Math.abs(eyeB.x - eyeA.x);
  if (eyeSpan < 1e-6) return 0;
  return (nose.x - eyeMidX) / eyeSpan;
}

function poseSatisfied(
  yaw: number,
  pose: PoseTarget,
  cfg: GateConfig,
  referenceYaw: number | null,
): boolean {
  switch (pose) {
    case 'straight':
      return Math.abs(yaw) <= cfg.maxYawStraight;
    case 'turn':
      return Math.abs(yaw) >= cfg.minYawTurned;
    case 'turn-opposite':
      // Must be a real turn, and to the other side from the reference shot. With
      // no reference yet this degrades to a plain turn rather than blocking.
      if (Math.abs(yaw) < cfg.minYawTurned) return false;
      if (referenceYaw === null) return true;
      return Math.sign(yaw) !== Math.sign(referenceYaw);
    default:
      return true;
  }
}

/**
 * Variance of the Laplacian over a grayscale buffer — the standard cheap sharpness
 * measure. A blurred image has little high-frequency energy, so the second
 * derivative varies little.
 *
 * Callers must pass a crop of the **face**, not the whole frame: whole-frame
 * sharpness is dominated by background texture, so a bookshelf behind a
 * motion-blurred face scores beautifully, which is exactly backwards.
 */
export function varianceOfLaplacian(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const laplacian =
        gray[i - width] + gray[i - 1] - 4 * gray[i] + gray[i + 1] + gray[i + width];
      sum += laplacian;
      sumSq += laplacian * laplacian;
      n++;
    }
  }

  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Rec. 601 luma, the same weighting used for the sharpness buffer. */
export function toGrayscale(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    gray[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return gray;
}

export function meanLuma(gray: Uint8ClampedArray): number {
  if (gray.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  return sum / gray.length;
}

/**
 * Judge one frame.
 *
 * The order of the checks is the design, not an implementation detail. The user can
 * only act on one instruction at a time, so the first genuine problem wins — and
 * sharpness is evaluated **last** because a face that is too far away or too dark
 * also measures as blurry, and "Hold still" is useless advice when the real problem
 * is standing three metres from the camera.
 */
export function evaluateFrame(params: {
  faces: FaceCandidate[];
  frameWidth: number;
  frameHeight: number;
  sharpness: number;
  brightness: number;
  pose: PoseTarget;
  /** Yaw of the previous shot, for 'turn-opposite'. */
  referenceYaw?: number | null;
  config?: GateConfig;
  /** `performance.now()` of this frame; passed in to keep this function pure. */
  at?: number;
}): { ok: boolean; reason: GateReason | null; metrics: FrameMetrics | null } {
  const cfg = params.config ?? DEFAULT_GATE;
  const { faces, frameWidth, frameHeight } = params;

  const confident = faces.filter((f) => f.score >= cfg.minConfidence);

  if (confident.length === 0) {
    return { ok: false, reason: 'no-face', metrics: null };
  }
  // Nobody should be able to sign in as the person standing behind them.
  if (confident.length > 1) {
    return { ok: false, reason: 'multiple-faces', metrics: null };
  }

  const face = confident[0];
  const box = face.boundingBox;
  const yaw = estimateYaw(face.keypoints);

  const metrics: FrameMetrics = {
    faceCount: confident.length,
    confidence: face.score,
    centerOffsetX: Math.abs((box.originX + box.width / 2) / frameWidth - 0.5),
    centerOffsetY: Math.abs((box.originY + box.height / 2) / frameHeight - 0.5),
    sizeRatio: box.width / frameWidth,
    sharpness: params.sharpness,
    brightness: params.brightness,
    yaw,
    box: {
      x: box.originX / frameWidth,
      y: box.originY / frameHeight,
      w: box.width / frameWidth,
      h: box.height / frameHeight,
    },
    at: params.at ?? 0,
  };

  const fail = (reason: GateReason) => ({ ok: false, reason, metrics });

  if (metrics.brightness < cfg.minBrightness) return fail('too-dark');
  if (metrics.brightness > cfg.maxBrightness) return fail('too-bright');
  if (metrics.sizeRatio < cfg.minSizeRatio) return fail('too-small');
  if (metrics.sizeRatio > cfg.maxSizeRatio) return fail('too-large');
  if (metrics.centerOffsetX > cfg.maxCenterOffsetX) return fail('off-center');
  if (metrics.centerOffsetY > cfg.maxCenterOffsetY) return fail('off-center');
  if (!poseSatisfied(yaw, params.pose, cfg, params.referenceYaw ?? null))
    return fail('wrong-pose');
  if (metrics.sharpness < cfg.minSharpness) return fail('blurry');

  return { ok: true, reason: null, metrics };
}
