import { Mail, MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EmailProvider, GmailAccount } from '@/api/gmail';
import { MessageNotice } from '../MessageNotice';

/**
 * The strip of status banners above the message list: no mailbox connected, mailbox
 * rejected, Chat not granted / not enabled / unlicensed, Chat app misconfigured, no
 * spaces, and the "chat request failed outright" retry.
 *
 * Every one of these was written out longhand with its own copy of the palette
 * classes; they now differ only in tone, icon and text.
 *
 * `account` is nullable because a company can have a support number and no mailbox.
 * That case used to be a full-page panel INSTEAD of the inbox, which is why phone
 * controls originally had to live on the Details tab; now it is the first banner
 * below and the list underneath still renders calls and texts.
 */
export function InboxNotices({
  emailNeedsReconnect,
  chatNeedsReconnect,
  chatStatus,
  chatsFailed,
  chatItemCount,
  isInboxLike,
  account,
  provider,
  providerLabels,
  isAdmin,
  onReconnect,
  onRetryChats,
  onConnect,
  connecting,
  connectDismissed,
  onDismissConnect,
}: {
  emailNeedsReconnect: boolean;
  chatNeedsReconnect: boolean;
  chatStatus: string | undefined;
  /** The chat query failed entirely (network error / 5xx — no first page). */
  chatsFailed: boolean;
  chatItemCount: number;
  isInboxLike: boolean;
  /** Null when nothing is connected — the phone-only case. */
  account: GmailAccount | null;
  provider: EmailProvider;
  providerLabels: { name: string; chat: string };
  isAdmin: boolean;
  onReconnect: () => void;
  onRetryChats: () => void;
  onConnect: (provider: EmailProvider, kind?: 'work' | 'personal') => void;
  connecting: boolean;
  /** Remembered per company, so the banner does not nag on every visit. */
  connectDismissed: boolean;
  onDismissConnect: () => void;
}) {
  const reconnectButton = (
    <Button
      size="sm"
      variant="outline"
      className="border-amber-300 text-amber-700 hover:bg-amber-100 text-xs"
      onClick={onReconnect}
    >
      Re-connect
    </Button>
  );

  // Both reconnect notices say the same thing about who can fix it.
  const whoFixes = isAdmin
    ? `Re-connect the ${providerLabels.name} account to restore them.`
    : `An admin needs to re-connect the ${providerLabels.name} account.`;

  return (
    <>
      {/* No mailbox at all. The list below still shows calls and texts, so this is a
          banner rather than the full-page panel it used to be. */}
      {!account && !connectDismissed && (
        <MessageNotice
          tone="teal"
          icon={<Mail size={14} className="shrink-0 text-teal-600" />}
          action={
            <div className="flex items-center gap-2">
              {isAdmin && (
                <>
                  <Button
                    size="sm"
                    className="bg-teal-600 hover:bg-teal-700 text-white text-xs"
                    disabled={connecting}
                    onClick={() => onConnect('GOOGLE')}
                  >
                    {connecting ? 'Opening…' : 'Gmail'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-teal-300 text-teal-700 hover:bg-teal-100 text-xs"
                    disabled={connecting}
                    onClick={() => onConnect('MICROSOFT', 'work')}
                  >
                    {connecting ? 'Opening…' : 'Outlook'}
                  </Button>
                </>
              )}
              <button
                onClick={onDismissConnect}
                title="Dismiss"
                className="text-teal-600 hover:text-teal-800"
              >
                <X size={14} />
              </button>
            </div>
          }
        >
          No email account connected — showing calls and texts only.
        </MessageNotice>
      )}

      {/* Re-connect notice when the mailbox itself was rejected (401/403) */}
      {emailNeedsReconnect && (
        <MessageNotice
          tone="amber"
          icon={<Mail size={14} className="shrink-0 text-amber-600" />}
          action={isAdmin ? reconnectButton : undefined}
        >
          {providerLabels.name} messages are unavailable. {whoFixes}
        </MessageNotice>
      )}

      {/* Re-connect notice for missing Chat scopes */}
      {chatNeedsReconnect && (
        <MessageNotice tone="amber" action={isAdmin ? reconnectButton : undefined}>
          {providerLabels.chat} messages are unavailable. {whoFixes}
        </MessageNotice>
      )}

      {/* Personal Outlook account — Teams isn't available via Microsoft Graph */}
      {provider === 'MICROSOFT' && account?.hasChatScope === false && isInboxLike && (
        <MessageNotice tone="muted" icon={<MessageSquare size={13} className="shrink-0" />}>
          Teams messages aren't available for this Outlook account. Email is fully supported.
        </MessageNotice>
      )}

      {/* No Chat spaces notice */}
      {!chatNeedsReconnect && chatStatus === 'no_spaces' && (
        <MessageNotice tone="muted" icon={<MessageSquare size={13} className="shrink-0" />}>
          No {providerLabels.chat} conversations found for this account. Chat messages
          will appear here once conversations exist.
        </MessageNotice>
      )}

      {/* Chat disabled notice */}
      {chatStatus === 'chat_disabled' && (
        <MessageNotice tone="muted" icon={<MessageSquare size={13} className="shrink-0" />}>
          {providerLabels.chat} is not enabled for this account. Email messages are still available.
        </MessageNotice>
      )}

      {/* Account has no Teams / Office 365 license — reconnecting won't help */}
      {chatStatus === 'no_license' && (
        <MessageNotice tone="amber" icon={<MessageSquare size={13} className="shrink-0" />}>
          This {providerLabels.name} account has no Microsoft {providerLabels.chat} license,
          so {providerLabels.chat} messages can't be shown. Email messages are still available.
        </MessageNotice>
      )}

      {/* Chat app not configured in Google Cloud Console */}
      {chatStatus === 'app_not_configured' && (
        <MessageNotice tone="amber" icon={<MessageSquare size={13} className="shrink-0" />}>
          Google Chat app is not configured. In Google Cloud Console → Google Chat API →
          Configuration, fill in the app name and set status to Enabled.
        </MessageNotice>
      )}

      {/* Chat API error notice */}
      {chatStatus === 'error' && (
        <MessageNotice tone="amber" icon={<MessageSquare size={13} className="shrink-0" />}>
          Could not load {providerLabels.chat} messages. Email messages are still available.
        </MessageNotice>
      )}

      {/* Chat query failed entirely (network error / 5xx — no first page) */}
      {chatsFailed && (
        <MessageNotice
          tone="amber"
          icon={<MessageSquare size={13} className="shrink-0" />}
          action={
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 text-amber-700 hover:bg-amber-100 text-xs"
              onClick={onRetryChats}
            >
              Retry
            </Button>
          }
        >
          Could not load {providerLabels.chat} messages. Email messages are still available.
        </MessageNotice>
      )}

      {/* Chat fetched ok but no messages found (history may be off) */}
      {chatStatus === 'ok' && chatItemCount === 0 && (
        <MessageNotice tone="muted" icon={<MessageSquare size={13} className="shrink-0" />}>
          No recent {providerLabels.chat} messages found. History may be disabled for your
          chat conversations.
        </MessageNotice>
      )}
    </>
  );
}
