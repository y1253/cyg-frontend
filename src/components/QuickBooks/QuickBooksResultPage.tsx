import { useEffect } from 'react';

/**
 * step2.md: the page Intuit's sign-in popup lands on. It tells the company page (its
 * opener) and closes — after a pause on an error, so the reason can be read.
 */
export function QuickBooksResultPage({ ok }: { ok: boolean }) {
  const reason = new URLSearchParams(window.location.search).get('reason');

  useEffect(() => {
    window.opener?.postMessage(
      { type: ok ? 'quickbooks-connected' : 'quickbooks-error' },
      window.location.origin,
    );
    const t = setTimeout(() => window.close(), ok ? 100 : 15000);
    return () => clearTimeout(t);
  }, [ok]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-sm">
      {ok ? (
        <p className="text-muted-foreground">QuickBooks connected. Closing…</p>
      ) : (
        <>
          <p className="font-medium text-destructive">QuickBooks was not connected.</p>
          {reason && (
            <p className="max-w-md text-center text-xs break-words text-muted-foreground">
              {reason}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">This window will close shortly.</p>
        </>
      )}
    </div>
  );
}
