import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { WebcamCapture } from '../ui/WebcamCapture';
import { useEnrollFace } from '../../hooks/useEnrollFace';
import type { PoseTarget } from '../../lib/faceQuality';

/**
 * The three angles Luxand is trained on. Requiring a real head turn is what
 * replaced the old server-side duplicate-photo check: the browser can tell which
 * way the head is facing, so it simply will not take photo 2 until the user has
 * actually turned — which is both instant and far more useful than rejecting all
 * three photos after the fact.
 */
const POSES: PoseTarget[] = ['straight', 'right', 'left'];

const INSTRUCTIONS = [
  'Look straight at the camera',
  'Turn slightly to your right',
  'Turn slightly to your left — try different lighting if possible',
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
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enroll = useEnrollFace();

  // Object URLs pin the whole JPEG in memory until revoked.
  useEffect(
    () => () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [previews],
  );

  function reset() {
    previews.forEach((url) => URL.revokeObjectURL(url));
    setPreviews([]);
    setBlobs([]);
    setStep(0);
    setSettling(false);
  }

  function handleCapture(blob: Blob) {
    const nextBlobs = [...blobs, blob];
    setBlobs(nextBlobs);
    setPreviews((p) => [...p, URL.createObjectURL(blob)]);

    if (nextBlobs.length < 3) {
      setSettling(true);
      setStep(nextBlobs.length);
      settleTimer.current = setTimeout(() => setSettling(false), POSE_SETTLE_MS);
      return;
    }

    setError('');
    enroll.mutate(
      { userId, blobs: nextBlobs as [Blob, Blob, Blob] },
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
    setStep(index);
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
