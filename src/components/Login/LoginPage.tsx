import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, faceLogin } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import { AdminStage } from './AdminStage';
import { BrandPanel } from './BrandPanel';
import { EmailStage } from './EmailStage';
import { FaceStage } from './FaceStage';
import { LoginStyles } from './LoginStyles';
import { VerifiedStage } from './VerifiedStage';
import { NAVY_MID, TEXT_PRIMARY } from './loginTheme';

type Stage = 'email' | 'face' | 'admin' | 'verified';

export function LoginPage() {
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifiedName, setVerifiedName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser, setToken } = useAuth();
  const navigate = useNavigate();

  function validateEmail(val: string) {
    if (!val.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) return 'Please enter a valid email address';
    return '';
  }

  function handleEmailContinue(e: React.FormEvent) {
    e.preventDefault();
    const err = validateEmail(email);
    if (err) { setError(err); return; }
    setError('');
    setStage('face');
  }

  async function handleFaceCapture(blob: Blob) {
    setLoading(true);
    setError('');
    try {
      const data = await faceLogin(email, blob);
      setToken(data.access_token);
      setUser(data.user);
      setVerifiedName(data.user.name);
      setStage('verified');
      setTimeout(() => navigate('/dashboard'), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Face not recognized. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdminSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateEmail(email);
    if (err) { setError(err); return; }
    if (!password) { setError('Password is required'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await login(email, password);
      setToken(data.access_token);
      setUser(data.user);
      navigate('/dashboard');
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  // Editing a field clears a stale validation/auth error.
  function changeEmail(value: string) {
    setEmail(value);
    if (error) setError('');
  }

  function changePassword(value: string) {
    setPassword(value);
    if (error) setError('');
  }

  function goToStage(next: Stage) {
    setError('');
    setStage(next);
  }

  return (
    <>
      <LoginStyles />

      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          fontFamily: "'DM Sans', sans-serif",
          background: NAVY_MID,
        }}
      >
        <BrandPanel />

        {/* ──────────────────── RIGHT FORM PANEL ──────────────────── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '48px 32px', position: 'relative',
        }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: 320, height: 320, background: 'radial-gradient(circle at top right, rgba(59,191,180,0.055) 0%, transparent 65%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: 240, height: 240, background: 'radial-gradient(circle at bottom left, rgba(30,64,96,0.5) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <div className="fu lg:hidden" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 36 }}>
            <img src="/cyg-favicon.png" alt="CYG Finance" style={{ width: 48, height: 48, marginBottom: 12 }} />
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: TEXT_PRIMARY }}>CYG Finance</span>
          </div>

          <div style={{ width: '100%', maxWidth: 380, position: 'relative', zIndex: 1 }}>

            {stage === 'email' && (
              <EmailStage
                email={email}
                error={error}
                onEmailChange={changeEmail}
                onSubmit={handleEmailContinue}
                onAdminClick={() => goToStage('admin')}
              />
            )}

            {stage === 'face' && (
              <FaceStage
                email={email}
                loading={loading}
                error={error}
                onBack={() => goToStage('email')}
                onCapture={handleFaceCapture}
                onError={setError}
              />
            )}

            {stage === 'admin' && (
              <AdminStage
                email={email}
                password={password}
                showPassword={showPassword}
                loading={loading}
                error={error}
                onEmailChange={changeEmail}
                onPasswordChange={changePassword}
                onTogglePassword={() => setShowPassword(v => !v)}
                onSubmit={handleAdminSubmit}
                onBack={() => goToStage('email')}
              />
            )}

            {stage === 'verified' && <VerifiedStage name={verifiedName} />}

            <p className="fu d6" style={{ textAlign: 'center', color: 'rgba(94,122,150,0.55)', fontSize: 11.5, marginTop: 44, letterSpacing: '0.04em' }}>
              CYG Finance · Bookkeeping Management Platform
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
