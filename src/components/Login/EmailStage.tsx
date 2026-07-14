import { ArrowRight } from 'lucide-react';
import { ErrorBox, Field, StageHeading, SubmitButton } from './LoginUI';

export function EmailStage({
  email,
  error,
  onEmailChange,
  onSubmit,
  onAdminClick,
}: {
  email: string;
  error: string;
  onEmailChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onAdminClick: () => void;
}) {
  return (
    <>
      <div className="fu d1">
        <StageHeading
          title="Welcome back"
          subtitle="Enter your email to sign in with face recognition"
          titleSize={38}
          marginBottom={36}
        />
      </div>

      <form onSubmit={onSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="fu d2">
          <Field label="Email">
            <input
              className="cyg-input"
              type="email"
              value={email}
              onChange={e => onEmailChange(e.target.value)}
              placeholder="you@cygfinance.com"
              autoComplete="email"
              autoFocus
            />
          </Field>
        </div>

        {error && <ErrorBox message={error} />}

        <div className="fu d3">
          <SubmitButton>
            Continue <ArrowRight size={15} strokeWidth={2} />
          </SubmitButton>
        </div>
      </form>

      <div style={{ marginTop: 40, textAlign: 'center' }}>
        <button className="admin-link" onClick={onAdminClick}>
          Admin? Sign in with password
        </button>
      </div>
    </>
  );
}
