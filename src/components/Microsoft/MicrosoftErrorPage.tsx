import { useEffect } from 'react';

export function MicrosoftErrorPage() {
  const reason = new URLSearchParams(window.location.search).get('reason');

  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: 'microsoft-error' }, window.location.origin);
    }
    setTimeout(() => window.close(), 5000);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-2 text-sm">
      <p className="text-destructive font-medium">Outlook connection failed. This window will close shortly.</p>
      {reason && (
        <p className="text-muted-foreground text-xs max-w-sm text-center">{reason}</p>
      )}
    </div>
  );
}
