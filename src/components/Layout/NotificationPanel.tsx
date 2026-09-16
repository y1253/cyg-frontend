import {
  BellOff,
  Check,
  Loader2,
  PhoneOutgoing,
  type LucideIcon,
} from 'lucide-react';
import type { UnreadFeedItem } from '@/api/gmail';
import { feedRowChrome, relativeTime, returnCallTarget } from './unread-feed';

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
  onReturnCall,
  returnCallBlocked,
  emptyIcon = BellOff,
  emptyTitle = "You're all caught up",
  emptyBody = 'New messages for your companies show up here.',
  note,
}: {
  items: UnreadFeedItem[];
  isLoading: boolean;
  truncated: boolean;
  failed: { companyId: number; companyName: string }[];
  onOpen: (item: UnreadFeedItem) => void;
  onMarkRead: (item: UnreadFeedItem) => void;
  /**
   * Ring the caller back, straight from the row.
   *
   * Optional, and absent means the button is not rendered at all — so a surface that has
   * no softphone in scope simply does not offer it, rather than offering a dead control.
   */
  onReturnCall?: (item: UnreadFeedItem) => void;
  /** Why this row cannot be dialled right now, if it cannot. */
  returnCallBlocked?: (item: UnreadFeedItem) => string | null;
  /**
   * The empty state, overridable so a filtered view of this same feed does not claim
   * the whole inbox is clear. Defaulted to the bell's own wording, so the bell renders
   * byte-identically to before these existed.
   */
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyBody?: string;
  /**
   * An extra footer line, and the empty state's replacement when there is nothing to
   * list. A filtered view can know its number exceeds the rows it has — saying so is
   * the same rule the `failed` line follows: never imply an inbox you cannot prove.
   */
  note?: string;
}) {
  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState
            isLoading={isLoading}
            Icon={emptyIcon}
            title={emptyTitle}
            body={note ?? emptyBody}
          />
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
                onReturnCall={onReturnCall}
                returnCallBlocked={returnCallBlocked}
              />
            ))}
          </ul>
        )}
      </div>

      <Footer
        count={items.length}
        truncated={truncated}
        failed={failed}
        // Already shown as the empty state's body in that case — repeating it under an
        // empty panel would say the same sentence twice.
        note={items.length > 0 ? note : undefined}
      />
    </div>
  );
}

function EmptyState({
  isLoading,
  Icon,
  title,
  body,
}: {
  isLoading: boolean;
  Icon: LucideIcon;
  title: string;
  body: string;
}) {
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
      <Icon size={20} className="text-muted-foreground" />
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{body}</span>
    </div>
  );
}

function FeedRow({
  item,
  onOpen,
  onMarkRead,
  onReturnCall,
  returnCallBlocked,
}: {
  item: UnreadFeedItem;
  onOpen: (item: UnreadFeedItem) => void;
  onMarkRead: (item: UnreadFeedItem) => void;
  onReturnCall?: (item: UnreadFeedItem) => void;
  returnCallBlocked?: (item: UnreadFeedItem) => string | null;
}) {
  const chrome = feedRowChrome(item);
  const { Icon } = chrome;
  // Every call row with something to dial, not only the missed ones — see
  // `returnCallTarget`. A row with no target renders no button rather than a dead one.
  const canCall = !!onReturnCall && returnCallTarget(item) !== null;
  const callBlocked = canCall ? (returnCallBlocked?.(item) ?? null) : null;

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

      {/* ⚠️ `opacity-0 … group-hover:opacity-100` with `focus-within`, NOT `hidden …
          group-hover:flex`. `hidden` takes these out of the tab order entirely, so the only
          actions on a notification row were unreachable by keyboard. The container is
          `pointer-events-none` so its empty area cannot swallow a click meant for the row
          underneath; the buttons take pointer events back. */}
      <div className="pointer-events-none absolute right-1.5 bottom-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {canCall && (
          <button
            type="button"
            title={callBlocked ?? 'Call back'}
            aria-label={`Call back: ${item.from}`}
            disabled={!!callBlocked}
            onClick={(e) => {
              e.stopPropagation();
              onReturnCall?.(item);
            }}
            className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-green-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
          >
            <PhoneOutgoing size={13} />
          </button>
        )}
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
          className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Check size={13} />
        </button>
      </div>
    </li>
  );
}

function Footer({
  count,
  truncated,
  failed,
  note,
}: {
  count: number;
  truncated: boolean;
  failed: { companyId: number; companyName: string }[];
  note?: string;
}) {
  // A failed sweep must never read as a clean inbox. The count can undercount; saying so
  // is the honest version of the server's "absent means unknown, not zero" rule.
  const names = failed.slice(0, 2).map((f) => f.companyName);
  const extra = failed.length - names.length;

  if (!truncated && failed.length === 0 && !note) return null;

  return (
    <div className="shrink-0 border-t px-3 py-2 text-[11px] text-muted-foreground">
      {note && <div>{note}</div>}
      {/* A caller-supplied note already says how many of how many, so the generic
          line would only contradict it with a smaller number. */}
      {truncated && !note && <div>Showing the {count} most recent.</div>}
      {failed.length > 0 && (
        <div>
          Couldn't check {names.join(', ')}
          {extra > 0 && ` +${extra} more`}.
        </div>
      )}
    </div>
  );
}
