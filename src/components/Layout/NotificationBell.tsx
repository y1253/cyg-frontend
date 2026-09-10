import { useState } from 'react';
import { ArrowLeft, Bell, BellOff, Settings } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useNotifications } from '@/context/NotificationContext';
import { useInboxSummary } from '@/hooks/useInboxSummary';
import { dismissUnreadFeedItem } from '@/lib/unreadFeedDismiss';
import { useMarkFeedItemRead } from '@/hooks/useMarkFeedItemRead';
import { NotificationPanel } from './NotificationPanel';
import { NotificationSettings } from './NotificationSettings';
import { badgeLabel, pendingOpenFromFeedItem } from './unread-feed';
import type { UnreadFeedItem } from '@/api/gmail';

/**
 * Unread messages across every company assigned to this user, plus their own workspace.
 *
 * The bell's ICON still means "are alerts on", which is why the settings that used to be
 * the whole popover are still here behind the gear. The BADGE is independent of that: it
 * counts waiting work, which matters whether or not you want to be chimed at.
 *
 * Mounted in the header, so it is alive on every authenticated route — which is what
 * makes this the one component that owns the feed query. `useInboxSummary` is also
 * mounted by the dashboard and the new-message notifier, and React Query dedupes all
 * three onto a single request by key.
 */
export function NotificationBell() {
  const { prefs, requestOpen } = useNotifications();
  const { unread, count, truncated, failed, isLoading } = useInboxSummary();
  const markRead = useMarkFeedItemRead();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'list' | 'settings'>('list');

  const alertsOn = prefs.sound || prefs.desktop;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Always reopen on the list: the settings page is somewhere you visit, not somewhere
    // you are left.
    if (!next) setView('list');
  };

  const handleOpen = (item: UnreadFeedItem) => {
    const request = pendingOpenFromFeedItem(item);
    if (!request) return;
    // Hide the row before navigating. Opening it marks it read a beat later, and a row
    // that lingers while the page changes underneath reads as a click that did nothing.
    dismissUnreadFeedItem(item.id);
    handleOpenChange(false);
    requestOpen(request);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        aria-label={
          count > 0
            ? `Notifications, ${count} unread`
            : alertsOn
              ? 'Notifications'
              : 'Notifications (alerts off)'
        }
        title={count > 0 ? `${count} unread` : 'No unread messages'}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {alertsOn ? <Bell size={16} /> : <BellOff size={16} />}
        {count > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white">
            {badgeLabel(count, truncated)}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[26rem] gap-0 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">
            {view === 'list' ? 'Notifications' : 'Alert settings'}
          </span>
          <button
            type="button"
            aria-label={view === 'list' ? 'Alert settings' : 'Back to notifications'}
            onClick={() => setView(view === 'list' ? 'settings' : 'list')}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {view === 'list' ? <Settings size={14} /> : <ArrowLeft size={14} />}
          </button>
        </div>

        {view === 'list' ? (
          <NotificationPanel
            items={unread}
            isLoading={isLoading}
            truncated={truncated}
            failed={failed}
            onOpen={handleOpen}
            onMarkRead={(item) => markRead.mutate(item)}
          />
        ) : (
          <NotificationSettings />
        )}
      </PopoverContent>
    </Popover>
  );
}
