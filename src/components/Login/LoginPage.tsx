import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { login } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';

const TEAL = '#3BBFB4';
const NAVY_DEEP = '#0B1C2C';
const NAVY_MID = '#0E2033';
const TEXT_PRIMARY = '#EDF2F7';
const TEXT_MUTED = '#5E7A96';
const TEXT_LABEL = '#7A98B4';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser, setToken } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }
    if (password.length < 8) {
      setError(`Password must be at least 8 characters (${password.length}/8)`);
      return;
    }
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
        .d7  { animation-delay: 0.64s; }

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
          {/* ── Background decorations ── */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>

            {/* Large teal triangle echo (top-right) */}
            <div style={{
              position: 'absolute',
              top: 0, right: 0,
              width: '65%',
              height: '55%',
              background: 'linear-gradient(135deg, rgba(59,191,180,0.07) 0%, transparent 65%)',
              clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
            }} />

            {/* Subtle grid lines */}
            {[25, 50, 75].map(p => (
              <div key={p} style={{
                position: 'absolute',
                left: `${p}%`,
                top: 0, bottom: 0,
                width: '1px',
                background: 'rgba(255,255,255,0.022)',
              }} />
            ))}
            {[33, 66].map(p => (
              <div key={p} style={{
                position: 'absolute',
                top: `${p}%`,
                left: 0, right: 0,
                height: '1px',
                background: 'rgba(255,255,255,0.022)',
              }} />
            ))}

            {/* Diagonal slash accent */}
            <div style={{
              position: 'absolute',
              bottom: '38%',
              left: 0, right: 0,
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(59,191,180,0.18), transparent)',
              transform: 'rotate(-10deg)',
              transformOrigin: 'left center',
            }} />

            {/* Bar chart (bottom) — echoes logo bars */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 60, right: 60,
              height: 100,
              display: 'flex',
              alignItems: 'flex-end',
              gap: 7,
            }}>
              {[38, 62, 46, 78, 56, 88, 67, 52, 74].map((h, i) => (
                <div
                  key={i}
                  className="bar"
                  style={{
                    flex: 1,
                    height: `${h}%`,
                    background: `rgba(59,191,180,${0.055 + i * 0.005})`,
                    borderRadius: '3px 3px 0 0',
                    animationDelay: `${i * 0.06}s`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* ── Brand content (top) ── */}
          <div className="fu" style={{ position: 'relative', zIndex: 1 }}>
            <img
              src="/cyg-favicon.png"
              alt="CYG"
              style={{ width: 68, height: 68, marginBottom: 36, display: 'block' }}
            />
            <h1 style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 58,
              fontWeight: 600,
              color: TEXT_PRIMARY,
              lineHeight: 1.0,
              letterSpacing: '-0.025em',
              margin: '0 0 20px',
            }}>
              CYG<br />Finance
            </h1>

            {/* Teal separator */}
            <div
              className="sep-line"
              style={{
                width: 44,
                height: 2,
                background: TEAL,
                margin: '0 0 18px',
                borderRadius: 1,
              }}
            />

            <p style={{
              color: TEAL,
              fontSize: 10.5,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              fontWeight: 500,
              margin: 0,
            }}>
              Bookkeeping Management
            </p>
          </div>

          {/* ── Tagline (bottom) ── */}
          <div className="fu d4" style={{ position: 'relative', zIndex: 1, paddingBottom: 110 }}>
            <p style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 20,
              fontStyle: 'italic',
              color: 'rgba(237,242,247,0.38)',
              lineHeight: 1.65,
              margin: 0,
              maxWidth: 270,
            }}>
              "Precision in every ledger.<br />Clarity in every decision."
            </p>
          </div>
        </div>

        {/* ──────────────────── RIGHT FORM PANEL ──────────────────── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 32px',
            position: 'relative',
          }}
        >
          {/* Radial glow top-right */}
          <div style={{
            position: 'absolute',
            top: 0, right: 0,
            width: 320,
            height: 320,
            background: 'radial-gradient(circle at top right, rgba(59,191,180,0.055) 0%, transparent 65%)',
            pointerEvents: 'none',
          }} />
          {/* Radial glow bottom-left */}
          <div style={{
            position: 'absolute',
            bottom: 0, left: 0,
            width: 240,
            height: 240,
            background: 'radial-gradient(circle at bottom left, rgba(30,64,96,0.5) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          {/* Mobile-only logo */}
          <div
            className="fu lg:hidden"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 36 }}
          >
            <img src="/cyg-favicon.png" alt="CYG Finance" style={{ width: 48, height: 48, marginBottom: 12 }} />
            <span style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 26,
              fontWeight: 600,
              color: TEXT_PRIMARY,
            }}>CYG Finance</span>
          </div>

          {/* Form container */}
          <div style={{ width: '100%', maxWidth: 380, position: 'relative', zIndex: 1 }}>

            {/* Heading */}
            <div className="fu d1" style={{ marginBottom: 36 }}>
              <h2 style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 38,
                fontWeight: 600,
                color: TEXT_PRIMARY,
                letterSpacing: '-0.015em',
                margin: '0 0 8px',
                lineHeight: 1.1,
              }}>
                Welcome back
              </h2>
              <p style={{
                color: TEXT_MUTED,
                fontSize: 14,
                fontWeight: 300,
                margin: 0,
                letterSpacing: '0.01em',
              }}>
                Sign in to your account to continue
              </p>
            </div>

            {/* Fields */}
            <form
              onSubmit={handleSubmit}
              noValidate
              style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
            >
              {/* Email */}
              <div className="fu d2">
                <label style={{
                  display: 'block',
                  color: TEXT_LABEL,
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: 9,
                }}>
                  Email
                </label>
                <input
                  className="cyg-input"
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); if (error) setError(''); }}
                  placeholder="you@cygfinance.com"
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div className="fu d3">
                <label style={{
                  display: 'block',
                  color: TEXT_LABEL,
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: 9,
                }}>
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
                  <button
                    type="button"
                    className="pw-eye"
                    onClick={() => setShowPassword(v => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div
                  className="fi"
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    color: '#FCA5A5',
                    fontSize: 13,
                    fontWeight: 300,
                    letterSpacing: '0.01em',
                  }}
                >
                  {error}
                </div>
              )}

              {/* Submit button */}
              <div className="fu d4">
                <button type="submit" className="cyg-btn" disabled={loading}>
                  {loading ? (
                    <>
                      <svg
                        width="15" height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{ animation: 'spin 0.85s linear infinite', flexShrink: 0 }}
                      >
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight size={15} strokeWidth={2} />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Footer */}
            <p
              className="fu d6"
              style={{
                textAlign: 'center',
                color: 'rgba(94,122,150,0.55)',
                fontSize: 11.5,
                marginTop: 44,
                letterSpacing: '0.04em',
              }}
            >
              CYG Finance · Bookkeeping Management Platform
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
