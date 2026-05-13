import { useEffect, useRef, useState } from 'react';

const TEAL = '#3BBFB4';

interface Props {
  onCapture: (blob: Blob) => void;
  onError?: (msg: string) => void;
  label?: string;
  autoStart?: boolean;
}

export function WebcamCapture({ onCapture, onError, label = 'Capture', autoStart = true }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!autoStart) return;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setReady(true);
      })
      .catch(() => {
        setDenied(true);
        onError?.('Camera access denied. Allow camera access and refresh.');
      });

    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (blob) onCapture(blob);
    }, 'image/jpeg', 0.92);
  }

  if (denied) {
    return (
      <div style={{
        padding: '16px',
        borderRadius: '8px',
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.2)',
        color: '#FCA5A5',
        fontSize: '13px',
        textAlign: 'center',
      }}>
        Camera access denied. Allow camera access and refresh.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      <div style={{ position: 'relative', width: '100%', borderRadius: '10px', overflow: 'hidden', background: '#000' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', display: 'block', borderRadius: '10px' }}
        />
        {/* Scanning line overlay */}
        {ready && (
          <div style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            borderRadius: '10px',
            border: `2px solid ${TEAL}`,
            boxShadow: `inset 0 0 20px rgba(59,191,180,0.1)`,
          }}>
            <div style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: '2px',
              background: `linear-gradient(90deg, transparent, ${TEAL}, transparent)`,
              animation: 'scanLine 2s ease-in-out infinite',
              top: '50%',
            }} />
          </div>
        )}
        {!ready && !denied && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.4)',
            fontSize: '13px',
          }}>
            Starting camera…
          </div>
        )}
        <style>{`
          @keyframes scanLine {
            0%   { top: 10%; }
            50%  { top: 88%; }
            100% { top: 10%; }
          }
        `}</style>
      </div>

      <button
        type="button"
        disabled={!ready}
        onClick={capture}
        style={{
          width: '100%',
          background: ready ? TEAL : 'rgba(59,191,180,0.3)',
          color: '#0B1C2C',
          border: 'none',
          borderRadius: '9px',
          padding: '13px 20px',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '14px',
          fontWeight: 500,
          cursor: ready ? 'pointer' : 'not-allowed',
          transition: 'background 0.2s, transform 0.12s',
        }}
      >
        {label}
      </button>
    </div>
  );
}
