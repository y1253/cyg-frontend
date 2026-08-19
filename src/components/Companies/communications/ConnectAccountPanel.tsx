import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EmailProvider } from '@/api/gmail';

/**
 * The empty state when a company has no mailbox linked yet. Only an admin can
 * actually connect one; everyone else just sees why the tab is empty.
 */
export function ConnectAccountPanel({
  isAdmin,
  connecting,
  onConnect,
}: {
  isAdmin: boolean;
  connecting: boolean;
  onConnect: (provider: EmailProvider, kind?: 'work' | 'personal') => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Mail size={40} className="text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        No email account connected — link Gmail or Outlook (a company uses one at a time).
      </p>
      {isAdmin && (
        <>
          <div className="flex gap-2">
            <Button
              onClick={() => onConnect('GOOGLE')}
              disabled={connecting}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {connecting ? 'Opening…' : 'Connect Gmail'}
            </Button>
            <Button
              onClick={() => onConnect('MICROSOFT', 'work')}
              disabled={connecting}
              variant="outline"
            >
              {connecting ? 'Opening…' : 'Connect Outlook'}
            </Button>
          </div>
          <button
            type="button"
            onClick={() => onConnect('MICROSOFT', 'personal')}
            disabled={connecting}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
          >
            Use a personal Outlook account (email only)
          </button>
        </>
      )}
    </div>
  );
}
