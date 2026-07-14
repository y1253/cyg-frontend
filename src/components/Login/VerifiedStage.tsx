import { TEAL, TEXT_MUTED, TEXT_PRIMARY } from './loginTheme';

// Success state after a face login: a ring pings outward while the circle and checkmark
// draw themselves in, then the two lines fade up.
export function VerifiedStage({ name }: { name: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 28, padding: '48px 0',
    }}>
      <div style={{ position: 'relative', width: 96, height: 96 }}>
        <div style={{
          position: 'absolute', top: -16, left: -16, right: -16, bottom: -16,
          borderRadius: '50%', border: `2px solid ${TEAL}`,
          animation: 'ping 1s cubic-bezier(0,0,0.2,1) forwards',
        }} />
        <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
          <circle
            cx="48" cy="48" r="44"
            stroke={TEAL} strokeWidth="2.5"
            strokeDasharray="276" strokeDashoffset="276"
            style={{ animation: 'drawCircle 0.6s ease forwards 0.15s' }}
          />
          <polyline
            points="27,50 41,64 69,34"
            stroke={TEAL} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="70" strokeDashoffset="70"
            style={{ animation: 'drawCheck 0.4s ease forwards 0.75s' }}
          />
        </svg>
      </div>

      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{
          fontFamily: "'Cormorant Garamond', serif",
          color: TEXT_PRIMARY, fontSize: 26, fontWeight: 600, margin: 0,
          opacity: 0, animation: 'fadeUp 0.45s ease forwards 0.85s',
        }}>
          Identity Verified
        </p>
        <p style={{
          color: TEXT_MUTED, fontSize: 14, fontWeight: 300, margin: 0,
          opacity: 0, animation: 'fadeUp 0.45s ease forwards 1.1s',
        }}>
          Welcome back, {name}
        </p>
      </div>
    </div>
  );
}
