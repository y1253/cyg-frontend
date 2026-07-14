import { NAVY_DEEP, TEAL, TEXT_MUTED, TEXT_PRIMARY } from './loginTheme';

// Keyframes and class-based styles for the login page. Rendered once by LoginPage.
export function LoginStyles() {
  return (
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
      @keyframes ping {
        0%   { transform: scale(1);   opacity: 0.7; }
        100% { transform: scale(2.4); opacity: 0; }
      }
      @keyframes drawCircle {
        to { stroke-dashoffset: 0; }
      }
      @keyframes drawCheck {
        to { stroke-dashoffset: 0; }
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
  );
}
