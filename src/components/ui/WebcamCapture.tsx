import { useCallback, useEffect, useRef, useState } from 'react';
import { AMBER, TEAL } from '../../lib/brand';
import { reasonMessage, type PoseTarget } from '../../lib/faceQuality';
import { useFaceCaptureGate } from '../../hooks/useFaceCaptureGate';

/** How long to wait before offering a manual shutter as an escape hatch. */
const MANUAL_FALLBACK_MS = 8000;

interface Props {
  onCapture: (blob: Blob) => void;
  onError?: (msg: string) => void;
  /** Label for the manual button. */
  label?: string;
  autoStart?: boolean;
  /** 'auto' waits for a good frame and fires by itself; 'manual' needs a click. */
  mode?: 'manual' | 'auto';
  /** Which head position to require before firing, in auto mode. */
  pose?: PoseTarget;
  /** Freeze the gate without tearing down the camera. */
  paused?: boolean;
  /** Dark login page vs light admin dialog. */
  theme?: 'login' | 'light';
  mirrored?: boolean;
}

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access denied. Allow camera access in your browser settings, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera found on this device.';
    case 'NotReadableError':
      // By far the most likely failure in an office, and the one a generic
      // "denied" message sends people to entirely the wrong place for.
      return 'Camera is in use by another app (Zoom, Teams…). Close it and try again.';
    default:
      return 'Could not start the camera. Try again.';
  }
}

export function WebcamCapture({
  onCapture,
  onError,
  label = 'Capture',
  autoStart = true,
  mode = 'auto',
  pose = 'any',
  paused = false,
  theme = 'login',
  mirrored = true,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const capturingRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [flash, setFlash] = useState(false);
  const [showManual, setShowManual] = useState(mode === 'manual');

  const start = useCallback(() => {
    setError(null);
    setReady(false);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!autoStart) return;
    let cancelled = false;
    // Capture the node now: by cleanup time the ref may already point elsewhere.
    const video = videoRef.current;

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: 'user',
          // 720p rather than 480p: at the gate's minimum face size this yields a
          // ~360px face instead of ~180px, which is thin for reliable matching.
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (!video) return;
        video.srcObject = stream;
        // Wait for metadata: until it arrives videoWidth is 0, and capturing then
        // silently produces a black frame at the fallback dimensions.
        video.onloadedmetadata = () => {
          void video.play().catch(() => undefined);
          if (!cancelled) setReady(true);
        };
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = cameraErrorMessage(err);
        setError(message);
        onError?.(message);
      });

    return () => {
      cancelled = true;
      // Null the srcObject before stopping tracks, or Chrome can leave the camera
      // indicator lit after unmount.
      if (video) video.srcObject = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, attempt]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    // toBlob is async; without this latch a double-click (or an auto-fire racing a
    // click) sends two requests.
    if (capturingRef.current) return;
    capturingRef.current = true;

    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    // Drawn from the unmirrored video element, so the CSS mirror below is purely
    // cosmetic and never reaches the uploaded pixels.
    canvas.getContext('2d')?.drawImage(video, 0, 0);

    setFlash(true);
    setTimeout(() => setFlash(false), 240);

    canvas.toBlob(
      (blob) => {
        capturingRef.current = false;
        if (blob) onCapture(blob);
      },
      'image/jpeg',
      0.92,
    );
  }, [onCapture]);

  const gateEnabled = mode === 'auto' && ready && !paused && !error;
  const gate = useFaceCaptureGate({
    videoRef,
    enabled: gateEnabled,
    pose,
    onCapture: capture,
  });

  // Offer the shutter if the gate cannot run, or is simply taking too long. This
  // is the universal escape hatch: too-strict thresholds, unusual lighting,
  // unusual faces, and whatever else was not anticipated.
  useEffect(() => {
    if (mode === 'manual' || gate.status === 'unsupported') {
      setShowManual(true);
      return;
    }
    setShowManual(false);
    const timer = setTimeout(() => setShowManual(true), MANUAL_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [mode, gate.status, pose]);

  const dark = theme === 'login';

  if (error) {
    return (
      <div
        style={{
          padding: 16,
          borderRadius: 8,
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          color: dark ? '#FCA5A5' : '#B91C1C',
          fontSize: 13,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {error}
        <button
          type="button"
          onClick={start}
          style={{
            alignSelf: 'center',
            background: 'transparent',
            border: `1px solid ${TEAL}`,
            color: TEAL,
            borderRadius: 8,
            padding: '7px 16px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  const guidance =
    gate.status === 'loading'
      ? 'Starting face detection…'
      : gate.status === 'unsupported'
        ? 'Automatic capture unavailable — use the button below'
        : paused
          ? null
          : gate.reason
            ? reasonMessage(gate.reason, pose)
            : gate.streak > 0
              ? 'Hold still…'
              : null;

  // No face yet -> neutral, face present but gated -> amber, streak building -> teal.
  const ovalColor =
    gate.reason === null && gate.streak > 0
      ? TEAL
      : gate.reason && gate.reason !== 'no-face'
        ? AMBER
        : 'rgba(255,255,255,0.28)';

  const RADIUS = 46;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          borderRadius: 10,
          overflow: 'hidden',
          background: '#000',
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            display: 'block',
            borderRadius: 10,
            // Mirrored so turning your head feels natural; an unmirrored self-view
            // makes centring feel inverted and fights the left/right guidance.
            transform: mirrored ? 'scaleX(-1)' : undefined,
            opacity: paused ? 0.45 : 1,
            transition: 'opacity 0.2s',
          }}
        />

        {ready && mode === 'auto' && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          >
            <ellipse
              cx="50"
              cy="50"
              rx="32"
              ry="42"
              fill="none"
              stroke={ovalColor}
              strokeWidth="0.7"
              vectorEffect="non-scaling-stroke"
              style={{ transition: 'stroke 0.25s' }}
            />
          </svg>
        )}

        {ready && mode === 'auto' && gate.progress > 0 && (
          <svg
            viewBox="0 0 100 100"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              transform: 'rotate(-90deg)',
            }}
          >
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              stroke={TEAL}
              strokeWidth="1.6"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - gate.progress)}
              style={{ transition: 'stroke-dashoffset 0.1s linear' }}
            />
          </svg>
        )}

        {ready && mode === 'manual' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              borderRadius: 10,
              border: `2px solid ${TEAL}`,
              boxShadow: 'inset 0 0 20px rgba(59,191,180,0.1)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: 2,
                background: `linear-gradient(90deg, transparent, ${TEAL}, transparent)`,
                animation: 'face-scan-line 2s ease-in-out infinite',
                top: '50%',
              }}
            />
          </div>
        )}

        {flash && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: '#fff',
              animation: 'face-capture-flash 240ms ease-out',
            }}
          />
        )}

        {!ready && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 13,
            }}
          >
            Starting camera…
          </div>
        )}

        {guidance && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 10,
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                background: 'rgba(11,28,44,0.72)',
                color: '#EDF2F7',
                fontSize: 12.5,
                padding: '5px 12px',
                borderRadius: 999,
                backdropFilter: 'blur(4px)',
              }}
            >
              {guidance}
            </span>
          </div>
        )}
      </div>

      {showManual && (
        <button
          type="button"
          disabled={!ready || paused}
          onClick={capture}
          style={{
            width: '100%',
            background: ready && !paused ? TEAL : 'rgba(59,191,180,0.3)',
            color: '#0B1C2C',
            border: 'none',
            borderRadius: 9,
            padding: '13px 20px',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            fontWeight: 500,
            cursor: ready && !paused ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s, transform 0.12s',
          }}
        >
          {mode === 'auto' ? 'Capture now' : label}
        </button>
      )}
    </div>
  );
}
