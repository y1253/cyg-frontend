import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { login, faceLogin } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import { WebcamCapture } from '../ui/WebcamCapture';

const TEAL = '#3BBFB4';
const NAVY_DEEP = '#0B1C2C';
const NAVY_MID = '#0E2033';
const TEXT_PRIMARY = '#EDF2F7';
const TEXT_MUTED = '#5E7A96';
const TEXT_LABEL = '#7A98B4';

type Stage = 'email' | 'face' | 'admin';

export function LoginPage() {
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      navigate('/dashboard');
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

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes barRise {
          from { transform: scaleY(0); }
          to   { transform: scaleY(1); }
        }
        @keyframes drawLine {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }

        .fu  { animation: fadeUp 0.65s cubic-bezier(0.16,1,0.3,1) both; }
        .fi  { animation: fadeIn 0.5s ease both; }
        .d1  { animation-delay: 0.08s; }
        .d2  { animation-delay: 0.16s; }
        .d3  { animation-delay: 0.24s; }
        .d4  { animation-delay: 0.34s; }
        .d5  { animation-delay: 0.44s; }
        .d6  { animation-delay: 0.54s; }

        .cyg-input {
          width: 100%;
          background: rgba(255,255,255,0.042);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 9px;
          padding: 13px 16px;
          color: ${TEXT_PRIMARY};
          font-family: 'DM Sans', sans-serif;
          font-size: 14.5px;
          font-weight: 300;
          outline: none;
          transition: border-color 0.22s, background 0.22s, box-shadow 0.22s;
          box-sizing: border-box;
        }
        .cyg-input::placeholder { color: rgba(255,255,255,0.18); }
        .cyg-input:focus {
          border-color: ${TEAL};
          background: rgba(59,191,180,0.045);
          box-shadow: 0 0 0 3px rgba(59,191,180,0.12);
        }
        .cyg-input:-webkit-autofill,
        .cyg-input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 40px #0F2133 inset !important;
          -webkit-text-fill-color: ${TEXT_PRIMARY} !important;
        }
        .cyg-input-pw { padding-right: 46px; }

        .cyg-btn {
          width: 100%;
          background: ${TEAL};
          color: ${NAVY_DEEP};
          border: none;
          border-radius: 9px;
          padding: 14px 20px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14.5px;
          font-weight: 500;
          letter-spacing: 0.015em;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          transition: background 0.2s, transform 0.12s, box-shadow 0.2s;
        }
        .cyg-btn:hover:not(:disabled) {
          background: #49CFC4;
          box-shadow: 0 6px 24px rgba(59,191,180,0.30);
          transform: translateY(-1px);
        }
        .cyg-btn:active:not(:disabled) { transform: translateY(0); }
        .cyg-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .pw-eye {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: rgba(255,255,255,0.3);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          transition: color 0.18s;
          line-height: 0;
        }
        .pw-eye:hover { color: rgba(255,255,255,0.65); }

        .bar {
          transform-origin: bottom;
          animation: barRise 0.9s cubic-bezier(0.16,1,0.3,1) both;
        }
        .sep-line {
          transform-origin: left;
          animation: drawLine 0.5s cubic-bezier(0.16,1,0.3,1) both;
          animation-delay: 0.2s;
        }
        .back-link {
          background: none;
          border: none;
          color: ${TEXT_MUTED};
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 0;
          transition: color 0.18s;
          margin-bottom: 24px;
        }
        .back-link:hover { color: ${TEXT_PRIMARY}; }
        .admin-link {
          background: none;
          border: none;
          color: rgba(94,122,150,0.6);
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
          text-underline-offset: 3px;
          transition: color 0.18s;
        }
        .admin-link:hover { color: ${TEXT_MUTED}; }
      `}</style>

      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          fontFamily: "'DM Sans', sans-serif",
          background: NAVY_MID,
        }}
      >
        {/* ──────────────────── LEFT BRAND PANEL ──────────────────── */}
        <div
          style={{
            width: '44%',
            background: NAVY_DEEP,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '56px 60px',
            position: 'relative',
            overflow: 'hidden',
            flexShrink: 0,
          }}
          className="hidden lg:flex"
        >
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <div style={{
              position: 'absolute', top: 0, right: 0,
              width: '65%', height: '55%',
              background: 'linear-gradient(135deg, rgba(59,191,180,0.07) 0%, transparent 65%)',
              clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
            }} />
            {[25, 50, 75].map(p => (
              <div key={p} style={{
                position: 'absolute', left: `${p}%`, top: 0, bottom: 0,
                width: '1px', background: 'rgba(255,255,255,0.022)',
              }} />
            ))}
            {[33, 66].map(p => (
              <div key={p} style={{
                position: 'absolute', top: `${p}%`, left: 0, right: 0,
                height: '1px', background: 'rgba(255,255,255,0.022)',
              }} />
            ))}
            <div style={{
              position: 'absolute', bottom: '38%', left: 0, right: 0, height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(59,191,180,0.18), transparent)',
              transform: 'rotate(-10deg)', transformOrigin: 'left center',
            }} />
            <div style={{
              position: 'absolute', bottom: 0, left: 60, right: 60, height: 100,
              display: 'flex', alignItems: 'flex-end', gap: 7,
            }}>
              {[38, 62, 46, 78, 56, 88, 67, 52, 74].map((h, i) => (
                <div key={i} className="bar" style={{
                  flex: 1, height: `${h}%`,
                  background: `rgba(59,191,180,${0.055 + i * 0.005})`,
                  borderRadius: '3px 3px 0 0',
                  animationDelay: `${i * 0.06}s`,
                }} />
              ))}
            </div>
          </div>

          <div className="fu" style={{ position: 'relative', zIndex: 1 }}>
            <img src="/cyg-favicon.png" alt="CYG" style={{ width: 68, height: 68, marginBottom: 36, display: 'block' }} />
            <h1 style={{
              fontFamily: "'Cormorant Garamond', serif", fontSize: 58, fontWeight: 600,
              color: TEXT_PRIMARY, lineHeight: 1.0, letterSpacing: '-0.025em', margin: '0 0 20px',
            }}>
              CYG<br />Finance
            </h1>
            <div className="sep-line" style={{ width: 44, height: 2, background: TEAL, margin: '0 0 18px', borderRadius: 1 }} />
            <p style={{ color: TEAL, fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 500, margin: 0 }}>
              Bookkeeping Management
            </p>
          </div>

          <div className="fu d4" style={{ position: 'relative', zIndex: 1, paddingBottom: 110 }}>
            <p style={{
              fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontStyle: 'italic',
              color: 'rgba(237,242,247,0.38)', lineHeight: 1.65, margin: 0, maxWidth: 270,
            }}>
              "Precision in every ledger.<br />Clarity in every decision."
            </p>
          </div>
        </div>

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

            {/* ── STAGE: EMAIL ── */}
            {stage === 'email' && (
              <>
                <div className="fu d1" style={{ marginBottom: 36 }}>
                  <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 38, fontWeight: 600, color: TEXT_PRIMARY, letterSpacing: '-0.015em', margin: '0 0 8px', lineHeight: 1.1 }}>
                    Welcome back
                  </h2>
                  <p style={{ color: TEXT_MUTED, fontSize: 14, fontWeight: 300, margin: 0, letterSpacing: '0.01em' }}>
                    Enter your email to sign in with face recognition
                  </p>
                </div>

                <form onSubmit={handleEmailContinue} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div className="fu d2">
                    <label style={{ display: 'block', color: TEXT_LABEL, fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 9 }}>
                      Email
                    </label>
                    <input
                      className="cyg-input"
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); if (error) setError(''); }}
                      placeholder="you@cygfinance.com"
                      autoComplete="email"
                      autoFocus
                    />
                  </div>

                  {error && (
                    <div className="fi" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', color: '#FCA5A5', fontSize: 13, fontWeight: 300 }}>
                      {error}
                    </div>
                  )}

                  <div className="fu d3">
                    <button type="submit" className="cyg-btn">
                      Continue <ArrowRight size={15} strokeWidth={2} />
                    </button>
                  </div>
                </form>

                <div style={{ marginTop: 40, textAlign: 'center' }}>
                  <button className="admin-link" onClick={() => { setError(''); setStage('admin'); }}>
                    Admin? Sign in with password
                  </button>
                </div>
              </>
            )}

            {/* ── STAGE: FACE SCAN ── */}
            {stage === 'face' && (
              <>
                <button className="back-link" onClick={() => { setError(''); setStage('email'); }}>
                  <ArrowLeft size={14} /> Back
                </button>

                <div style={{ marginBottom: 24 }}>
                  <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, fontWeight: 600, color: TEXT_PRIMARY, letterSpacing: '-0.015em', margin: '0 0 6px', lineHeight: 1.1 }}>
                    Face Recognition
                  </h2>
                  <p style={{ color: TEXT_MUTED, fontSize: 13, fontWeight: 300, margin: 0 }}>
                    Signing in as <span style={{ color: TEAL }}>{email}</span>
                  </p>
                </div>

                {loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 0', color: TEXT_MUTED, fontSize: 14 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.85s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" stroke={TEAL} strokeWidth="2.5" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                    Verifying face…
                  </div>
                ) : (
                  <WebcamCapture
                    onCapture={handleFaceCapture}
                    label="Scan Face & Sign In"
                    onError={msg => setError(msg)}
                  />
                )}

                {error && (
                  <div className="fi" style={{ marginTop: 16, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', color: '#FCA5A5', fontSize: 13, fontWeight: 300 }}>
                    {error}
                  </div>
                )}
              </>
            )}

            {/* ── STAGE: ADMIN LOGIN ── */}
            {stage === 'admin' && (
              <>
                <button className="back-link" onClick={() => { setError(''); setStage('email'); }}>
                  <ArrowLeft size={14} /> Back
                </button>

                <div style={{ marginBottom: 32 }}>
                  <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, fontWeight: 600, color: TEXT_PRIMARY, letterSpacing: '-0.015em', margin: '0 0 8px', lineHeight: 1.1 }}>
                    Admin Sign In
                  </h2>
                  <p style={{ color: TEXT_MUTED, fontSize: 14, fontWeight: 300, margin: 0 }}>
                    Administrator access only
                  </p>
                </div>

                <form onSubmit={handleAdminSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div>
                    <label style={{ display: 'block', color: TEXT_LABEL, fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 9 }}>
                      Email
                    </label>
                    <input
                      className="cyg-input"
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); if (error) setError(''); }}
                      placeholder="admin@cygfinance.com"
                      autoComplete="email"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', color: TEXT_LABEL, fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 9 }}>
                      Password
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        className="cyg-input cyg-input-pw"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => { setPassword(e.target.value); if (error) setError(''); }}
                        placeholder="••••••••"
                        autoComplete="current-password"
                      />
                      <button type="button" className="pw-eye" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="fi" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', color: '#FCA5A5', fontSize: 13, fontWeight: 300 }}>
                      {error}
                    </div>
                  )}

                  <button type="submit" className="cyg-btn" disabled={loading}>
                    {loading ? (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.85s linear infinite', flexShrink: 0 }}>
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
                          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                        Signing in…
                      </>
                    ) : (
                      <>Sign In <ArrowRight size={15} strokeWidth={2} /></>
                    )}
                  </button>
                </form>
              </>
            )}

            <p className="fu d6" style={{ textAlign: 'center', color: 'rgba(94,122,150,0.55)', fontSize: 11.5, marginTop: 44, letterSpacing: '0.04em' }}>
              CYG Finance · Bookkeeping Management Platform
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
