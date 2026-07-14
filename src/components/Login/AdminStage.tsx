import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { BackLink, ErrorBox, Field, StageHeading, SubmitButton } from './LoginUI';

export function AdminStage({
  email,
  password,
  showPassword,
  loading,
  error,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  onSubmit,
  onBack,
}: {
  email: string;
  password: string;
  showPassword: boolean;
  loading: boolean;
  error: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}) {
  return (
    <>
      <BackLink onClick={onBack} />

      <StageHeading
        title="Admin Sign In"
        subtitle="Administrator access only"
        marginBottom={32}
      />

      <form onSubmit={onSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Field label="Email">
          <input
            className="cyg-input"
            type="email"
            value={email}
            onChange={e => onEmailChange(e.target.value)}
            placeholder="admin@cygfinance.com"
            autoComplete="email"
          />
        </Field>

        <Field label="Password">
          <div style={{ position: 'relative' }}>
            <input
              className="cyg-input cyg-input-pw"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => onPasswordChange(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <button type="button" className="pw-eye" onClick={onTogglePassword} tabIndex={-1}>
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>

        {error && <ErrorBox message={error} />}

        <SubmitButton loading={loading} loadingLabel="Signing in…">
          Sign In <ArrowRight size={15} strokeWidth={2} />
        </SubmitButton>
      </form>
    </>
  );
}
