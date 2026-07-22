import { useEffect } from 'react';

export function MicrosoftSuccessPage() {
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: 'microsoft-connected' }, window.location.origin);
    }
    window.close();
  }, []);

  return (
    <div className="flex items-center justify-center h-screen text-sm text-muted-foreground">
      Outlook connected. Closing…
    </div>
  );
}
