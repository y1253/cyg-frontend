import { useEffect } from 'react';

export function GmailSuccessPage() {
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: 'gmail-connected' }, window.location.origin);
    }
    window.close();
  }, []);

  return (
    <div className="flex items-center justify-center h-screen text-sm text-muted-foreground">
      Gmail connected. Closing…
    </div>
  );
}
