import { WebcamCapture } from '../ui/WebcamCapture';
import { TEAL, TEXT_MUTED } from './loginTheme';
import { BackLink, ErrorBox, Spinner, StageHeading } from './LoginUI';

export function FaceStage({
  email,
  loading,
  error,
  onBack,
  onCapture,
  onError,
}: {
  email: string;
  loading: boolean;
  error: string;
  onBack: () => void;
  onCapture: (blob: Blob) => void;
  onError: (message: string) => void;
}) {
  return (
    <>
      <BackLink onClick={onBack} />

      <StageHeading
        title="Face Recognition"
        subtitle={<>Signing in as <span style={{ color: TEAL }}>{email}</span></>}
        subtitleSize={13}
      />

      {loading ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          padding: '32px 0', color: TEXT_MUTED, fontSize: 14,
        }}>
          <Spinner size={32} color={TEAL} />
          Verifying face…
        </div>
      ) : (
        <WebcamCapture
          onCapture={onCapture}
          label="Scan Face & Sign In"
          onError={onError}
        />
      )}

      {error && <ErrorBox message={error} marginTop={16} />}
    </>
  );
}
