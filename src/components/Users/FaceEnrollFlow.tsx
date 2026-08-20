import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { WebcamCapture } from '../ui/WebcamCapture';
import { useEnrollFace } from '../../hooks/useEnrollFace';
import type { FaceBox } from '../../api/auth';
import type { FrameMetrics, PoseTarget } from '../../lib/faceQuality';

/**
 * The three angles Luxand is trained on. Requiring a real head turn is what
 * replaced the old server-side duplicate-photo check: the browser can tell which
 * way the head is facing, so it simply will not take photo 2 until the user has
 * actually turned — which is both instant and far more useful than rejecting all
 * three photos after the fact.
 */
const POSES: PoseTarget[] = ['straight', 'turn', 'turn-opposite'];

const INSTRUCTIONS = [
  'Look straight at the camera',
  'Turn slightly to your right',
  'Now turn the other way — to your left',
];

/**
 * Pause between shots. Without it the gate is still counting on the tail of the
 * previous pose and fires a near-identical second photo immediately, which is
 * exactly what the three-pose design exists to prevent.
 */
const POSE_SETTLE_MS = 900;

interface Props {
  userId: number;
  onSuccess: () => void;
  onSkip?: () => void;
  skipLabel?: string;
}

/**
 * The three-photo enrolment flow, shared by the create-user dialog and the user
 * detail page. It previously existed twice, and had already drifted: one copy
 * handled a failed enrolment and the other left the dialog silently stuck.
 */
export function FaceEnrollFlow({ userId, onSuccess, onSkip, skipLabel }: Props) {
  const [step, setStep] = useState(0);
  const [blobs, setBlobs] = useState<Blob[]>([]);
  // Index-aligned with `blobs`. Entries may be undefined: a manual capture taken
  // while the detector is unavailable has no box, and that photo simply goes to
  // the server uncropped.
  const [boxes, setBoxes] = useState<(FaceBox | undefined)[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [settling, setSettling] = useState(false);
  // Which way the second shot turned, so the third can require the other side.
  const [referenceYaw, setReferenceYaw] = useState<number | null>(null);
  const enroll = useEnrollFace();

  /**
   * The settle pause stops the gate firing a second, near-identical shot off the
   * tail of the previous pose.
   *
   * React owns the timer, keyed on `settling`, so it is started and cleared as one
   * unit. It used to be a bare ref set inside handleCapture, and an unrelated
   * cleanup keyed on [previews] cancelled it on the very next render — leaving
   * `settling` stuck true, the gate permanently paused, and enrolment frozen after
   * the first photo.
   */
  useEffect(() => {
    if (!settling) return;
    const timer = setTimeout(() => setSettling(false), POSE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [settling]);

  // Object URLs pin the whole JPEG in memory until revoked. Read through a ref on
  // unmount only: revoking on every change would kill URLs still on screen.
  const previewsRef = useRef<string[]>([]);
  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);
  useEffect(
    () => () => previewsRef.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  );

  function reset() {
    previews.forEach((url) => URL.revokeObjectURL(url));
    setPreviews([]);
    setBlobs([]);
    setBoxes([]);
    setStep(0);
    setSettling(false);
    setReferenceYaw(null);
  }

  function handleCapture(blob: Blob, metrics?: FrameMetrics) {
    const nextBlobs = [...blobs, blob];
    const nextBoxes = [...boxes, metrics?.box];
    setBlobs(nextBlobs);
    setBoxes(nextBoxes);
    setPreviews((p) => [...p, URL.createObjectURL(blob)]);

    // Remember which side the first turn went, so the last shot can demand the
    // other one. Direction is relative on purpose — see PoseTarget.
    if (nextBlobs.length === 2 && metrics) setReferenceYaw(metrics.yaw);

    if (nextBlobs.length < 3) {
      setSettling(true);
      setStep(nextBlobs.length);
      return;
    }

    setError('');
    enroll.mutate(
      { userId, blobs: nextBlobs as [Blob, Blob, Blob], boxes: nextBoxes },
      {
        onSuccess,
        onError: (err) => {
          setError(
            err instanceof Error ? err.message : 'Enrollment failed. Try again.',
          );
          reset();
        },
      },
    );
  }

  /** Drop this shot and everything after it, then re-shoot from there. */
  function retake(index: number) {
    previews.slice(index).forEach((url) => URL.revokeObjectURL(url));
    setPreviews((p) => p.slice(0, index));
    setBlobs((b) => b.slice(0, index));
    // Must be sliced alongside the blobs. Leaving this list long would shift every
    // later box onto the wrong photo — a silent mis-crop rather than an error.
    setBoxes((b) => b.slice(0, index));
    setStep(index);
    // Re-shooting the turn invalidates the recorded direction.
    if (index <= 1) setReferenceYaw(null);
    setError('');
  }

  if (enroll.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeOpacity="0.25"
          />
          <path
            d="M12 2a10 10 0 0 1 10 10"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        Enrolling face…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`flex-1 h-1.5 rounded-full transition-colors ${
              i < blobs.length
                ? 'bg-teal-500'
                : i === step
                  ? 'bg-teal-300'
                  : 'bg-muted'
            }`}
          />
        ))}
      </div>

      <div className="text-center">
        <p className="text-sm font-medium">Photo {Math.min(step + 1, 3)} of 3</p>
        <p className="text-sm text-muted-foreground">{INSTRUCTIONS[step]}</p>
      </div>

      <WebcamCapture
        onCapture={handleCapture}
        onError={setError}
        mode="auto"
        pose={POSES[step]}
        referenceYaw={referenceYaw}
        paused={settling}
        theme="light"
        label="Capture"
      />

      {previews.length > 0 && (
        <div className="flex items-center gap-2">
          {previews.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => retake(i)}
              title="Retake this photo"
              className="group relative h-14 w-14 overflow-hidden rounded-md border border-border"
            >
              <img
                src={url}
                alt={`Captured photo ${i + 1}`}
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
                <RotateCcw size={15} className="text-white" />
              </span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 text-center transition-colors"
        >
          {skipLabel ?? 'Skip for now'}
        </button>
      )}
    </div>
  );
}
