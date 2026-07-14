import { NAVY_DEEP, TEAL, TEXT_PRIMARY } from './loginTheme';

// Decorative left half of the login page: faint grid, rising bar chart, logo and tagline.
// Hidden below the lg breakpoint.
export function BrandPanel() {
  return (
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
  );
}
