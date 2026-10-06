import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { BackLink, ErrorBox, Field, StageHeading, SubmitButton } from './LoginUI';
import { TEXT_MUTED, TEAL } from './loginTheme';

/** Must match RESEND_GAP_MS on the server (auth/login-challenge.ts). */
const RESEND_GAP_S = 60;

/**
 * Admin sign-in, step two: the six-digit code emailed after a correct password.
 * Same custom dark styling as the rest of the login page (the documented exception
 * to the Tailwind rule).
 */
export function CodeStage({
  sentTo,
  code,
  loading,
  error,
  notice,
  onCodeChange,
  onSubmit,
  onResend,
  onBack,
}: {
  sentTo: string;
  code: string;
  loading: boolean;
  error: string;
  notice: string;
  onCodeChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onResend: () => Promise<boolean>;
  onBack: () => void;
}) {
  const [wait, setWait] = useState(RESEND_GAP_S);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function resend() {
    if (wait > 0) return;
    if (await onResend()) setWait(RESEND_GAP_S);
  }

  return (
    <>
      <BackLink onClick={onBack} />

      <StageHeading
        title="Check your email"
        subtitle={`We sent a 6-digit code to ${sentTo}`}
        marginBottom={32}
      />

      <form onSubmit={onSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Field label="Sign-in code">
          <input
            className="cyg-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            value={code}
            onChange={e => onCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            style={{ letterSpacing: '0.5em', fontSize: 20, textAlign: 'center' }}
          />
        </Field>

        {error && <ErrorBox message={error} />}
        {!error && notice && (
          <p style={{ color: TEAL, fontSize: 13, margin: 0 }}>{notice}</p>
        )}

        <SubmitButton loading={loading} loadingLabel="Verifying…">
          Verify <ArrowRight size={15} strokeWidth={2} />
        </SubmitButton>
      </form>

      <p style={{ textAlign: 'center', fontSize: 13, color: TEXT_MUTED, marginTop: 20 }}>
        Didn't get it?{' '}
        <button
          type="button"
          onClick={resend}
          disabled={wait > 0}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: wait > 0 ? TEXT_MUTED : TEAL,
            cursor: wait > 0 ? 'default' : 'pointer',
            fontSize: 13,
            textDecoration: wait > 0 ? 'none' : 'underline',
          }}
        >
          {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
        </button>
      </p>
    </>
  );
}
