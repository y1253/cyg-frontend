import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  LoginError,
  faceLogin,
  isCodeRequired,
  login,
  resendLoginCode,
  verifyLoginCode,
  type LoginResponse,
} from '../../api/auth';
import { takeSignedOutNotice } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { AdminStage } from './AdminStage';
import { CodeStage } from './CodeStage';
import { BrandPanel } from './BrandPanel';
import { EmailStage } from './EmailStage';
import type { FrameMetrics } from '../../lib/faceQuality';
import { FaceStage } from './FaceStage';
import { LoginStyles } from './LoginStyles';
import { VerifiedStage } from './VerifiedStage';
import { NAVY_MID, TEXT_PRIMARY } from './loginTheme';
import { warmup } from '../../lib/faceDetector';

type Stage = 'email' | 'face' | 'admin' | 'code' | 'verified';

export function LoginPage() {
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifiedName, setVerifiedName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState<{ id: string; sentTo: string } | null>(null);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [faceAttempts, setFaceAttempts] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setUser, setToken } = useAuth();
  const navigate = useNavigate();

  // A device whose session was ended server-side (an admin signed it out) lands here
  // with a reason; say so, rather than leaving them to wonder why they were bounced.
  useEffect(() => {
    if (takeSignedOutNotice()) {
      setError('You were signed out. Your session was ended from another device or by an admin.');
    }
  }, []);

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
    setFaceAttempts(0);
    // Start fetching the detection model now, so the download hides behind the
    // stage transition instead of stalling the camera.
    warmup();
    setStage('face');
  }

  /**
   * The camera now fires by itself, so a failing login would otherwise retry
   * forever against a paid API. Three consecutive attempts, then stop and wait for
   * a deliberate retry or the password route.
   */
  const MAX_FACE_ATTEMPTS = 3;
  const RETRY_COOLDOWN_MS = 2000;

  async function handleFaceCapture(blob: Blob, metrics?: FrameMetrics) {
    setLoading(true);
    setError('');
    try {
      const data = await faceLogin(email, blob, metrics?.box);
      setToken(data.access_token);
      setUser(data.user);
      setVerifiedName(data.user.name);
      setStage('verified');
      setTimeout(() => navigate('/dashboard'), 3000);
    } catch (e) {
      // Not a recognition failure: retrying the camera cannot help, so stop at once.
      if (e instanceof LoginError && e.alreadySignedIn) {
        setFaceAttempts(MAX_FACE_ATTEMPTS);
        setError(e.message);
        setLoading(false);
        return;
      }
      const attempts = faceAttempts + 1;
      setFaceAttempts(attempts);
      if (attempts >= MAX_FACE_ATTEMPTS) {
        setError("We couldn't recognise you. Try again, or sign in with your password.");
        setLoading(false);
        return;
      }
      setError(e instanceof Error ? e.message : 'Face not recognized. Please try again.');
      // Hold the camera paused briefly before re-arming, so the user has a moment
      // to read the message and reposition rather than being re-shot instantly.
      cooldownRef.current = setTimeout(() => setLoading(false), RETRY_COOLDOWN_MS);
      return;
    }
    setLoading(false);
  }

  const retryFace = useCallback(() => {
    if (cooldownRef.current) clearTimeout(cooldownRef.current);
    setFaceAttempts(0);
    setError('');
    setLoading(false);
  }, []);

  async function handleAdminSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateEmail(email);
    if (err) { setError(err); return; }
    if (!password) { setError('Password is required'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await login(email, password);
      if (isCodeRequired(data)) {
        setChallenge({ id: data.challengeId, sentTo: data.sentTo });
        setCode('');
        setNotice('');
        setStage('code');
        return;
      }
      finishPasswordLogin(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  function finishPasswordLogin(data: LoginResponse) {
    setPassword('');
    setToken(data.access_token);
    setUser(data.user);
    navigate('/dashboard');
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code from the email'); return; }
    setLoading(true);
    setError('');
    try {
      finishPasswordLogin(await verifyLoginCode(challenge.id, code));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code is not right.');
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend(): Promise<boolean> {
    if (!challenge) return false;
    setError('');
    setNotice('');
    try {
      const r = await resendLoginCode(challenge.id);
      setNotice(`A new code was sent to ${r.sentTo}.`);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send a new code.");
      return false;
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
          // dvh: on a phone a URL bar makes 100vh taller than the visible area, which
          // leaves the sign-in button below the fold on first paint.
          minHeight: '100dvh',
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
                exhausted={faceAttempts >= MAX_FACE_ATTEMPTS}
                onBack={() => goToStage('email')}
                onCapture={handleFaceCapture}
                onError={setError}
                onRetry={retryFace}
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

            {stage === 'code' && challenge && (
              <CodeStage
                sentTo={challenge.sentTo}
                code={code}
                loading={loading}
                error={error}
                notice={notice}
                onCodeChange={v => { setCode(v); if (error) setError(''); }}
                onSubmit={handleCodeSubmit}
                onResend={handleResend}
                onBack={() => { setChallenge(null); goToStage('admin'); }}
              />
            )}

            {stage === 'verified' && <VerifiedStage name={verifiedName} />}

            <p className="fu d6" style={{ textAlign: 'center', color: 'rgba(94,122,150,0.55)', fontSize: 11.5, marginTop: 44, letterSpacing: '0.04em' }}>
              CYG Finance · Bookkeeping Management Platform
            </p>
            {/* The only route into the public legal pages from anywhere in the app.
                Nothing linked to them before, and a policy a reviewer cannot reach is
                treated as one that does not exist. Inline styles here, not Tailwind:
                this page is the documented exception, and a light-theme utility class
                would be invisible on navy. */}
            <p className="fu d6" style={{ textAlign: 'center', color: 'rgba(94,122,150,0.45)', fontSize: 11, marginTop: 10, letterSpacing: '0.04em' }}>
              <Link to="/privacy" style={{ color: 'rgba(94,122,150,0.75)' }}>
                Privacy
              </Link>
              {' · '}
              <Link to="/terms" style={{ color: 'rgba(94,122,150,0.75)' }}>
                Terms
              </Link>
              {' · '}
              <Link to="/sms-opt-in" style={{ color: 'rgba(94,122,150,0.75)' }}>
                Text Messages
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
