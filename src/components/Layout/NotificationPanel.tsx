import { BellOff, Check, Loader2 } from 'lucide-react';
import type { UnreadFeedItem } from '@/api/gmail';
import { feedRowChrome, relativeTime } from './unread-feed';

/**
 * The unread list under the bell.
 *
 * Flat and newest-first rather than grouped by company: most companies contribute one or
 * two rows, so group headers would routinely be taller than their own contents. Company
 * identity lives on the row instead.
 *
 * Everything here is unread by definition, so there is no read/unread styling to carry —
 * a row leaving the list IS the feedback for reading it.
 */
export function NotificationPanel({
  items,
  isLoading,
  truncated,
  failed,
  onOpen,
  onMarkRead,
}: {
  items: UnreadFeedItem[];
  isLoading: boolean;
  truncated: boolean;
  failed: { companyId: number; companyName: string }[];
  onOpen: (item: UnreadFeedItem) => void;
  onMarkRead: (item: UnreadFeedItem) => void;
}) {
  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState isLoading={isLoading} />
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <FeedRow
                // Keyed on company AND id: a provider id is unique within its own
                // mailbox, not across every mailbox in the list.
                key={`${item.companyId}|${item.id}`}
                item={item}
                onOpen={onOpen}
                onMarkRead={onMarkRead}
              />
            ))}
          </ul>
        )}
      </div>

      <Footer count={items.length} truncated={truncated} failed={failed} />
    </div>
  );
}

function EmptyState({ isLoading }: { isLoading: boolean }) {
  // A spinner only when there is nothing to show. Replacing a painted list with one on
  // every background refetch would make the panel flicker once a minute.
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" />
        Checking your inbox…
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 p-8 text-center">
      <BellOff size={20} className="text-muted-foreground" />
      <span className="text-sm font-medium">You're all caught up</span>
      <span className="text-xs text-muted-foreground">
        New messages for your companies show up here.
      </span>
    </div>
  );
}

function FeedRow({
  item,
  onOpen,
  onMarkRead,
}: {
  item: UnreadFeedItem;
  onOpen: (item: UnreadFeedItem) => void;
  onMarkRead: (item: UnreadFeedItem) => void;
}) {
  const chrome = feedRowChrome(item);
  const { Icon } = chrome;

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/50"
      >
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${chrome.avatar}`}
        >
          <Icon size={13} />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline gap-1.5">
            <span className="truncate text-sm font-medium">{item.from}</span>
            <span className="shrink-0 truncate text-xs text-muted-foreground">
              · {item.companyName}
            </span>
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {item.title || chrome.label}
            {item.snippet && ` — ${item.snippet}`}
          </span>
        </span>

        <span className="mt-0.5 shrink-0 text-[11px] text-muted-foreground">
          {relativeTime(item.at)}
        </span>
      </button>

      {/* Per-row rather than a "mark all read" button: email read is one provider call
          per message with no batch endpoint, and chat read state is shared across staff,
          so a single click could clear other people's bells. */}
      <button
        type="button"
        title="Mark as read"
        aria-label={`Mark as read: ${item.title || chrome.label}`}
        onClick={(e) => {
          e.stopPropagation();
          onMarkRead(item);
        }}
        className="absolute right-1.5 bottom-1.5 hidden h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground group-hover:flex"
      >
        <Check size={13} />
      </button>
    </li>
  );
}

function Footer({
  count,
  truncated,
  failed,
}: {
  count: number;
  truncated: boolean;
  failed: { companyId: number; companyName: string }[];
}) {
  // A failed sweep must never read as a clean inbox. The count can undercount; saying so
  // is the honest version of the server's "absent means unknown, not zero" rule.
  const names = failed.slice(0, 2).map((f) => f.companyName);
  const extra = failed.length - names.length;

  if (!truncated && failed.length === 0) return null;

  return (
    <div className="shrink-0 border-t px-3 py-2 text-[11px] text-muted-foreground">
      {truncated && <div>Showing the {count} most recent.</div>}
      {failed.length > 0 && (
        <div>
          Couldn't check {names.join(', ')}
          {extra > 0 && ` +${extra} more`}.
        </div>
      )}
    </div>
  );
}
