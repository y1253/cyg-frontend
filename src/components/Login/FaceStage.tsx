import type { FrameMetrics } from '../../lib/faceQuality';
import { WebcamCapture } from '../ui/WebcamCapture';
import { TEAL, TEXT_MUTED } from './loginTheme';
import { BackLink, ErrorBox, Spinner, StageHeading } from './LoginUI';

export function FaceStage({
  email,
  loading,
  error,
  exhausted,
  onBack,
  onCapture,
  onError,
  onRetry,
}: {
  email: string;
  loading: boolean;
  error: string;
  /** Auto-capture has given up after repeated failures; wait for a deliberate retry. */
  exhausted: boolean;
  onBack: () => void;
  onCapture: (blob: Blob, metrics?: FrameMetrics) => void;
  onError: (message: string) => void;
  onRetry: () => void;
}) {
  return (
    <>
      <BackLink onClick={onBack} />

      <StageHeading
        title="Face Recognition"
        subtitle={
          <>
            Signing in as <span style={{ color: TEAL }}>{email}</span>
          </>
        }
        subtitleSize={13}
      />

      {/*
        The camera stays mounted while the request is in flight. Unmounting it
        tore down the MediaStream and re-acquired it on every failure, which cost
        about a second per retry and is most of why a failed face login used to
        feel so much worse than a successful one.
      */}
      <WebcamCapture
        onCapture={onCapture}
        onError={onError}
        label="Scan Face & Sign In"
        mode="auto"
        pose="any"
        paused={loading || exhausted}
        theme="login"
      />

      {loading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            marginTop: 14,
            color: TEXT_MUTED,
            fontSize: 14,
          }}
        >
          <Spinner size={18} color={TEAL} />
          Verifying face…
        </div>
      )}

      {error && <ErrorBox message={error} marginTop={16} />}

      {exhausted && !loading && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            width: '100%',
            marginTop: 14,
            background: 'transparent',
            border: `1px solid ${TEAL}`,
            color: TEAL,
            borderRadius: 9,
            padding: '12px 20px',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      )}
    </>
  );
}
