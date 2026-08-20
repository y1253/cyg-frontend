import { useCallback, useEffect, useRef, useState } from 'react';
import { acquire, getFaceDetector, release } from '../lib/faceDetector';
import {
  DEFAULT_GATE,
  DETECT_INTERVAL_MS,
  evaluateFrame,
  meanLuma,
  REQUIRED_STREAK,
  toGrayscale,
  varianceOfLaplacian,
  type FaceCandidate,
  type FrameMetrics,
  type GateConfig,
  type GateReason,
  type PoseTarget,
} from '../lib/faceQuality';

/** Size of the square the face crop is scaled into before measuring sharpness. */
const CROP_SIZE = 128;

/** How much wider than the detected box to crop, so hair and chin are included. */
const CROP_EXPAND = 1.15;

/** Rolling detection cost above which we conclude the device cannot keep up. */
const SLOW_DEVICE_MS = 150;
const SLOW_DEVICE_SAMPLES = 45;

export interface FaceCaptureGate {
  status: 'loading' | 'ready' | 'unsupported';
  reason: GateReason | null;
  streak: number;
  /** 0..1, how much of the required good-frame streak has been achieved. */
  progress: number;
  metrics: FrameMetrics | null;
}

interface GateState {
  /** Which (enabled, pose) combination produced these values. */
  stamp: string;
  reason: GateReason | null;
  streak: number;
  metrics: FrameMetrics | null;
}

const EMPTY: Omit<GateState, 'stamp'> = {
  reason: null,
  streak: 0,
  metrics: null,
};

/**
 * Watches a live video element and fires exactly once when the picture is good
 * enough to send.
 *
 * The streak requirement is what makes this work: a single frame that happens to
 * look sharp mid-movement cannot trigger a capture, only a third of a second of
 * sustained good framing can. That is the difference between "took a photo" and
 * "took a photo worth sending".
 */
export function useFaceCaptureGate(opts: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  pose?: PoseTarget;
  /** Receives the metrics of the frame that actually fired. */
  onCapture: (metrics: FrameMetrics) => void;
  referenceYaw?: number | null;
  requiredStreak?: number;
  config?: GateConfig;
}): FaceCaptureGate {
  const {
    videoRef,
    enabled,
    pose = 'any',
    onCapture,
    referenceYaw = null,
    requiredStreak = REQUIRED_STREAK,
    config = DEFAULT_GATE,
  } = opts;

  const [status, setStatus] = useState<FaceCaptureGate['status']>('loading');
  const [state, setState] = useState<GateState>({ stamp: '', ...EMPTY });

  // Refs, not state: these change every frame and must not trigger re-renders.
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streakRef = useRef(0);
  const firedRef = useRef(false);
  const lastDetectRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const perfRef = useRef({ total: 0, count: 0 });

  // Keep the latest callback without restarting the loop when the parent
  // re-renders with a new closure.
  const onCaptureRef = useRef(onCapture);
  useEffect(() => {
    onCaptureRef.current = onCapture;
  }, [onCapture]);

  /**
   * Which run the readings belong to.
   *
   * Comparing this during render, rather than resetting state from an effect, is
   * what keeps a finished streak from flashing on screen for one frame after the
   * pose changes — and avoids a cascading render besides.
   */
  const stamp = `${String(enabled)}|${pose}|${String(referenceYaw)}`;
  const current = state.stamp === stamp ? state : { stamp, ...EMPTY };

  /** Reused across every frame; allocating one per frame would thrash the GC. */
  const getCanvas = useCallback(() => {
    if (!canvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = CROP_SIZE;
      canvas.height = CROP_SIZE;
      canvasRef.current = canvas;
    }
    return canvasRef.current;
  }, []);

  /**
   * Measure sharpness and brightness of the face itself.
   *
   * Cropping to the face matters: whole-frame sharpness is dominated by background
   * texture, so a bookshelf behind a motion-blurred face would score well.
   */
  const measure = useCallback(
    (video: HTMLVideoElement, box: FaceCandidate['boundingBox']) => {
      const canvas = getCanvas();
      // willReadFrequently keeps the canvas CPU-backed; without it Chrome keeps it
      // on the GPU and every getImageData stalls on a readback.
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return { sharpness: 0, brightness: 0 };

      const cx = box.originX + box.width / 2;
      const cy = box.originY + box.height / 2;
      const w = Math.min(box.width * CROP_EXPAND, video.videoWidth);
      const h = Math.min(box.height * CROP_EXPAND, video.videoHeight);
      const sx = Math.max(0, Math.min(cx - w / 2, video.videoWidth - w));
      const sy = Math.max(0, Math.min(cy - h / 2, video.videoHeight - h));

      ctx.drawImage(video, sx, sy, w, h, 0, 0, CROP_SIZE, CROP_SIZE);
      const { data } = ctx.getImageData(0, 0, CROP_SIZE, CROP_SIZE);
      const gray = toGrayscale(data);

      return {
        sharpness: varianceOfLaplacian(gray, CROP_SIZE, CROP_SIZE),
        brightness: meanLuma(gray),
      };
    },
    [getCanvas],
  );

  useEffect(() => {
    streakRef.current = 0;
    firedRef.current = false;
    perfRef.current = { total: 0, count: 0 };

    if (!enabled) return;

    let cancelled = false;
    let holdsLock = false;

    const stop = () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (holdsLock) {
        release();
        holdsLock = false;
      }
    };

    void (async () => {
      if (!acquire()) {
        setStatus('unsupported');
        return;
      }
      holdsLock = true;

      let detector;
      try {
        detector = await getFaceDetector();
      } catch {
        // Model unavailable: the caller shows the manual button instead. Release
        // first -- holding the single-consumer lock here would make every later
        // mount report 'unsupported' for the rest of the session.
        release();
        holdsLock = false;
        if (!cancelled) setStatus('unsupported');
        return;
      }
      if (cancelled) {
        if (holdsLock) {
          release();
          holdsLock = false;
        }
        return;
      }
      setStatus('ready');

      const tick = () => {
        if (cancelled) return;
        rafRef.current = requestAnimationFrame(tick);

        const now = performance.now();
        if (now - lastDetectRef.current < DETECT_INTERVAL_MS) return;
        lastDetectRef.current = now;

        const video = videoRef.current;
        // videoWidth is 0 until metadata arrives; detecting before then throws.
        if (!video || video.readyState < 2 || video.videoWidth === 0) return;
        if (firedRef.current) return;

        // detectForVideo rejects a non-increasing timestamp, and two calls inside
        // the same millisecond would otherwise kill the loop.
        const timestamp = Math.max(Math.round(now), lastTimestampRef.current + 1);
        lastTimestampRef.current = timestamp;

        const startedAt = performance.now();
        let faces: FaceCandidate[];
        try {
          const result = detector.detectForVideo(video, timestamp);
          faces = result.detections.map((d) => ({
            boundingBox: {
              originX: d.boundingBox?.originX ?? 0,
              originY: d.boundingBox?.originY ?? 0,
              width: d.boundingBox?.width ?? 0,
              height: d.boundingBox?.height ?? 0,
            },
            keypoints: d.keypoints ?? [],
            score: d.categories?.[0]?.score ?? 0,
          }));
        } catch {
          return;
        }

        // A device that cannot run the gate deserves the manual button, not a
        // progress ring that never fills.
        const perf = perfRef.current;
        perf.total += performance.now() - startedAt;
        perf.count += 1;
        if (perf.count >= SLOW_DEVICE_SAMPLES) {
          if (perf.total / perf.count > SLOW_DEVICE_MS) {
            setStatus('unsupported');
            stop();
            return;
          }
          perf.total = 0;
          perf.count = 0;
        }

        const box = faces[0]?.boundingBox;
        const { sharpness, brightness } = box
          ? measure(video, box)
          : { sharpness: 0, brightness: 0 };

        const verdict = evaluateFrame({
          faces,
          frameWidth: video.videoWidth,
          frameHeight: video.videoHeight,
          sharpness,
          brightness,
          pose,
          referenceYaw,
          config,
          at: now,
        });

        if (verdict.ok) {
          streakRef.current += 1;
        } else {
          // Hard reset. Letting a streak survive one bad frame would defeat the
          // entire purpose of requiring a streak.
          streakRef.current = 0;
        }

        setState({
          stamp,
          reason: verdict.reason,
          streak: streakRef.current,
          metrics: verdict.metrics,
        });

        if (streakRef.current >= requiredStreak && verdict.metrics) {
          firedRef.current = true;
          // Pass the firing frame's own metrics, not the state copy, which lags a
          // render behind.
          onCaptureRef.current(verdict.metrics);
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    })();

    return stop;
  }, [
    enabled,
    pose,
    stamp,
    referenceYaw,
    requiredStreak,
    config,
    videoRef,
    measure,
  ]);

  return {
    status,
    reason: current.reason,
    streak: current.streak,
    progress: Math.min(1, current.streak / requiredStreak),
    metrics: current.metrics,
  };
}
