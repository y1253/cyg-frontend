import { useEffect } from 'react';

export function MicrosoftSuccessPage() {
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: 'microsoft-connected' }, window.location.origin);
    }
    // Defer the close so it can't race the postMessage above (closing in the same
    // tick can drop the message before the opener's listener receives it).
    const t = setTimeout(() => window.close(), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex items-center justify-center h-screen text-sm text-muted-foreground">
      Outlook connected. Closing…
    </div>
  );
}
