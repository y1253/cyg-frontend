import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { TEXT_LABEL, TEXT_MUTED, TEXT_PRIMARY } from './loginTheme';

export function Spinner({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: 'spin 0.85s linear infinite', flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2.5" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function ErrorBox({ message, marginTop }: { message: string; marginTop?: number }) {
  return (
    <div
      className="fi"
      style={{
        marginTop,
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.2)',
        borderRadius: 8,
        padding: '10px 14px',
        color: '#FCA5A5',
        fontSize: 13,
        fontWeight: 300,
      }}
    >
      {message}
    </div>
  );
}

export function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button className="back-link" onClick={onClick}>
      <ArrowLeft size={14} /> Back
    </button>
  );
}

export function StageHeading({
  title,
  subtitle,
  titleSize = 34,
  subtitleSize = 14,
  marginBottom = 24,
}: {
  title: string;
  subtitle: ReactNode;
  titleSize?: number;
  subtitleSize?: number;
  marginBottom?: number;
}) {
  return (
    <div style={{ marginBottom }}>
      <h2 style={{
        fontFamily: "'Cormorant Garamond', serif", fontSize: titleSize, fontWeight: 600,
        color: TEXT_PRIMARY, letterSpacing: '-0.015em', margin: '0 0 8px', lineHeight: 1.1,
      }}>
        {title}
      </h2>
      <p style={{ color: TEXT_MUTED, fontSize: subtitleSize, fontWeight: 300, margin: 0, letterSpacing: '0.01em' }}>
        {subtitle}
      </p>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', color: TEXT_LABEL, fontSize: 11, fontWeight: 500,
        letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 9,
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function SubmitButton({
  children,
  loading = false,
  loadingLabel,
  disabled,
}: {
  children: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
}) {
  return (
    <button type="submit" className="cyg-btn" disabled={disabled ?? loading}>
      {loading ? <><Spinner /> {loadingLabel}</> : children}
    </button>
  );
}
