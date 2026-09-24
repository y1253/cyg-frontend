import { useEffect } from 'react';

/**
 * Is this Microsoft telling us the consent screen was DISMISSED, rather than anything
 * being wrong at our end?
 *
 * `access_denied` with subcode `cancel` is what Azure sends when the person closes or
 * declines the consent prompt — including the "Need admin approval" screen, where
 * declining is the only button a non-admin has. Calling that "connection failed" sends
 * people looking for a fault that does not exist, so it gets its own wording.
 */
function wasDismissed(reason: string | null): boolean {
  if (!reason) return false;
  const r = reason.toLowerCase();
  return r.includes('access_denied') || r.includes('cancel');
}

export function MicrosoftErrorPage() {
  const reason = new URLSearchParams(window.location.search).get('reason');
  const dismissed = wasDismissed(reason);

  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: 'microsoft-error' }, window.location.origin);
    }
    // Longer than the old 5s: the message now carries the AADSTS code somebody has to be
    // able to read and copy before the window goes.
    setTimeout(() => window.close(), 20000);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3 p-6 text-sm">
      {dismissed ? (
        <>
          <p className="font-medium text-destructive">
            Outlook was not connected — the Microsoft sign-in was cancelled.
          </p>
          <p className="max-w-md text-center text-xs text-muted-foreground">
            If you saw a <strong>&ldquo;Needs admin approval&rdquo;</strong> screen, this
            mailbox&rsquo;s own Microsoft administrator has to approve the app — approval
            granted in another organisation does not carry over. Otherwise, try again and
            choose <strong>Accept</strong>.
          </p>
        </>
      ) : (
        <p className="font-medium text-destructive">Outlook connection failed.</p>
      )}

      {reason && (
        <p className="max-w-md text-center text-xs break-words text-muted-foreground">
          {reason}
        </p>
      )}

      <p className="text-[11px] text-muted-foreground">
        This window will close shortly.
      </p>
    </div>
  );
}
