import { useEffect } from 'react';

export function GmailErrorPage() {
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: 'gmail-error' }, window.location.origin);
    }
    setTimeout(() => window.close(), 3000);
  }, []);

  return (
    <div className="flex items-center justify-center h-screen text-sm text-destructive">
      Gmail connection failed. This window will close shortly.
    </div>
  );
}
