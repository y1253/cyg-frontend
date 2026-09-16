import { useState } from 'react';
import { PhoneMissed } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useNotifications } from '@/context/NotificationContext';
import { useInboxSummary } from '@/hooks/useInboxSummary';
import { dismissUnreadFeedItem } from '@/lib/unreadFeedDismiss';
import { useMarkFeedItemRead } from '@/hooks/useMarkFeedItemRead';
import { useReturnCall } from '@/hooks/useReturnCall';
import { NotificationPanel } from './NotificationPanel';
import { isMissedCallRow, pendingOpenFromFeedItem } from './unread-feed';
import type { UnreadFeedItem } from '@/api/gmail';

/**
 * Unanswered callers, in the header, on every page.
 *
 * ── WHY THIS IS NOT A COMPANY BADGE ───────────────────────────────────────────
 * A missed call is the backlog that goes stale fastest, and it used to be visible only
 * from inside a company — the dashboard's per-row badge, and the Communications tab's
 * Missed calls folder. Walk into any company and the picture disappeared. The only
 * always-on signal was the number painted on the browser TAB icon, which is drawn only
 * while the tab is unfocused, i.e. never while somebody is looking at the app.
 *
 * Mounted twice from `AppLayout` — centred from `md` up, compact beside the bell below
 * it. That costs nothing: both reads resolve to the one `['inbox-summary']` query the
 * bell already polls, deduped by React Query on the key.
 */
export function MissedCallsIndicator({
  variant,
}: {
  variant: 'full' | 'compact';
}) {
  const { requestOpen } = useNotifications();
  const { unread, missedCallsOwn, failed, isLoading } = useInboxSummary();
  const markRead = useMarkFeedItemRead();
  const { returnCall, blockedReason } = useReturnCall();
  const [open, setOpen] = useState(false);

  const rows = unread.filter(isMissedCallRow);

  // Nothing owed, nothing shown. This sits in the header all day, so an idle "0" would
  // be permanent furniture — and a pulsing one would be a permanent false alarm.
  if (missedCallsOwn === 0) return null;

  const label = `${missedCallsOwn} missed call${missedCallsOwn === 1 ? '' : 's'}`;

  /**
   * ⚠️ The rows can be FEWER than the number, and the panel has to say so.
   *
   * They come from two different pipelines: `missedCallsOwn` is an uncapped sum over the
   * 30-day window, while the feed is capped at 10 per company and 50 overall — caps it
   * shares with email, chat, SMS and WhatsApp. So a busy inbox can crowd missed calls out
   * of the list while they still count. Claiming "no missed calls" under a badge reading
   * 3 is the failure this avoids; same rule as the `failed` line beside it.
   */
  const note =
    rows.length < missedCallsOwn
      ? `Showing ${rows.length} of ${missedCallsOwn} — open a company's Missed calls folder for the rest.`
      : undefined;

  const handleOpen = (item: UnreadFeedItem) => {
    const request = pendingOpenFromFeedItem(item);
    if (!request) return;
    // Hide the row before navigating, exactly as the bell does: opening it marks it read
    // a beat later, and a row that lingers while the page changes underneath reads as a
    // click that did nothing.
    dismissUnreadFeedItem(item.id);
    setOpen(false);
    requestOpen(request);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        title={label}
        className={[
          'inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50',
          'font-medium text-red-700 hover:bg-red-100',
          'animate-missed-call-pulse',
          variant === 'full' ? 'px-3 py-1 text-xs' : 'px-2 py-1 text-[11px]',
        ].join(' ')}
      >
        <PhoneMissed size={variant === 'full' ? 13 : 12} />
        {/* One span, so the flex `gap` separates the icon from the text and the number
            from its noun by an ordinary word space. `tabular-nums` stays on the digits
            alone: it is there to stop the pill resizing as the count ticks over. */}
        <span>
          <span className="tabular-nums">{missedCallsOwn}</span>
          {/* The words are the first thing to go on a phone — the icon and the red
              pulse already say what this is, and that header is also carrying a
              hamburger, the title, the bell and the avatar. */}
          {variant === 'full' &&
            ` missed call${missedCallsOwn === 1 ? '' : 's'}`}
        </span>
      </PopoverTrigger>

      <PopoverContent
        align={variant === 'full' ? 'center' : 'end'}
        // Matches the bell: 24rem is wider than a 390px phone, so below `sm` it takes
        // the viewport minus the page gutters instead of being clipped.
        className="w-[calc(100vw-1.5rem)] gap-0 p-0 sm:w-[24rem]"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <PhoneMissed size={14} className="text-red-600" />
          <span className="text-sm font-medium">Missed calls</span>
        </div>

        {/* No settings gear, unlike the bell. Alert preferences are one thing and they
            live in one place; a second copy is a second thing to keep in step. */}
        <NotificationPanel
          items={rows}
          isLoading={isLoading}
          // The panel's own "showing the N most recent" would contradict `note`, which
          // already says how many of how many.
          truncated={false}
          failed={failed}
          onOpen={handleOpen}
          onMarkRead={(item) => markRead.mutate(item)}
          // Kept open on a call-back, unlike `handleOpen` above: this list exists to be
          // worked through, and the call card raises itself over the page anyway.
          onReturnCall={(item) => returnCall(item, () => markRead.mutate(item))}
          returnCallBlocked={blockedReason}
          emptyIcon={PhoneMissed}
          emptyTitle="No missed calls"
          emptyBody="Callers nobody picked up show up here."
          note={note}
        />
      </PopoverContent>
    </Popover>
  );
}
