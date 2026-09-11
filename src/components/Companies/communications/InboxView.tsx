import { useEffect, useState } from 'react';
import {
  CheckCircle2, Circle, ListChecks, Mail, MailOpen,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SearchInput } from '@/components/ui/SearchInput';
import type { EmailProvider, EmailSummary, GmailAccount } from '@/api/gmail';
import { MessageNotice } from '../MessageNotice';
import { InboxNotices } from './InboxNotices';
import { InboxRow } from './InboxRow';
import {
  KIND_FILTER_LABELS,
  type CompleteTarget, type KindFilter, type UnifiedItem,
} from './types';
import { FolderTabs } from './FolderTabs';
import { AdvancedSearchPanel } from './AdvancedSearchPanel';
import type { SearchFilters } from './search-filters';

/**
 * The message list: account header, status banners, folder tabs, the search and
 * kind filter, the admin bulk-select bar, the rows themselves and the
 * infinite-scroll sentinel.
 *
 * Selection state lives here — it never outlived the list anyway (switching folder
 * already cleared it), and this view unmounts whenever a message is opened.
 */
export function InboxView({
  companyId,
  token,
  isAdmin,
  account,
  provider,
  providerLabels,
  listRootRef,
  loadMoreRef,
  selectedLabel,
  onSelectFolder,
  searchInput,
  onSearchInput,
  searchPlaceholder,
  filters,
  onFiltersChange,
  relevanceOrderWarning,
  filter,
  onFilterChange,
  isInboxLike,
  isFiltering,
  activeSearch,
  isLoading,
  phoneLoading,
  visibleItems,
  emailItems,
  emailHasNext,
  emailFetchingNext,
  anyFetchingNext,
  allExhausted,
  emailNeedsReconnect,
  chatNeedsReconnect,
  chatStatus,
  chatsFailed,
  chatItemCount,
  unreadCount,
  uncompletedCount,
  newEmailBanner,
  onDismissNewEmailBanner,
  stateError,
  draftError,
  onDismissDraftError,
  onResetStateError,
  onConnect,
  onRetryChats,
  onOpenItem,
  onToggleRead,
  onToggleComplete,
  onBulk,
  onCall,
  connecting,
  connectDismissed,
  onDismissConnect,
}: {
  companyId: number;
  token: string | null;
  isAdmin: boolean;
  /** Null when no mailbox is connected — the tab still renders phone activity. */
  account: GmailAccount | null;
  provider: EmailProvider;
  providerLabels: { name: string; chat: string };
  listRootRef: React.Ref<HTMLDivElement>;
  loadMoreRef: React.Ref<HTMLDivElement>;
  selectedLabel: string;
  onSelectFolder: (id: string) => void;
  searchInput: string;
  onSearchInput: (v: string) => void;
  searchPlaceholder: string;
  filters: SearchFilters;
  onFiltersChange: (next: SearchFilters) => void;
  /** Outlook search is relevance-ordered — surfaced in the panel. */
  relevanceOrderWarning?: boolean;
  filter: KindFilter;
  onFilterChange: (f: KindFilter) => void;
  isInboxLike: boolean;
  /** Narrowed by search or kind — drives the empty-state copy. */
  isFiltering: boolean;
  activeSearch: string | undefined;
  isLoading: boolean;
  /** Phone has not returned its first page yet. See the sentinel below. */
  phoneLoading?: boolean;
  visibleItems: UnifiedItem[];
  /** The email-only folders (Sent/Spam/Trash) render straight off this. */
  emailItems: EmailSummary[];
  emailHasNext: boolean;
  emailFetchingNext: boolean;
  /** Any source mid-page. Derived in the hook so adding a source changes nothing here. */
  anyFetchingNext: boolean;
  /** Every source exhausted — drives "You're all caught up". */
  allExhausted: boolean;
  emailNeedsReconnect: boolean;
  chatNeedsReconnect: boolean;
  chatStatus: string | undefined;
  chatsFailed: boolean;
  chatItemCount: number;
  unreadCount: number;
  uncompletedCount: number;
  newEmailBanner: boolean;
  onDismissNewEmailBanner: () => void;
  stateError: string | null;
  /** A draft row that could not be opened — deleted from the provider's own UI since
   *  the list rendered, or an expired token. */
  draftError: string | null;
  onDismissDraftError: () => void;
  onResetStateError: () => void;
  onConnect: (provider: EmailProvider, kind?: 'work' | 'personal') => void;
  onRetryChats: () => void;
  onOpenItem: (item: UnifiedItem) => void;
  onToggleRead: (item: UnifiedItem) => void;
  onToggleComplete: (target: CompleteTarget, isCompleted: boolean) => void;
  onBulk: (action: 'read' | 'unread' | 'complete' | 'uncomplete', items: UnifiedItem[]) => void;
  /** The company's support number, or null. Labels the channel and gates texting. */
  /** Dial a number from a row. Absent when no support number is attached. */
  onCall?: (number: string) => void;
  /** Start a new text message. */
  /** Dial a number that is not already in the feed. */
  connecting: boolean;
  /** The "connect a mailbox" banner was dismissed for this company. */
  connectDismissed: boolean;
  onDismissConnect: () => void;
}) {
  // Bulk multi-select (admin, inbox only). `selectionMode` swaps row clicks from
  // "open" to "toggle select"; `selectedIds` holds the picked ids. Those ids are
  // globally unique across all four channels — Gmail ids are hex, Chat resource names
  // contain "/", and phone ids are explicitly namespaced `swcall:`/`swsms:` — so the
  // bare-id Set cannot collide. (The kind is NOT re-derived from the id shape: the
  // bulk handler is handed whole `UnifiedItem`s, which already carry `.kind`.)
  // A pending bulk complete/uncomplete is parked in `bulkAction` for confirmation.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'complete' | 'uncomplete' | null>(null);
  // Leaving the inbox (folder switch) exits selection mode and drops the picks.
  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [selectedLabel]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Master "select all" toggles every currently-visible (filtered + loaded) row.
  const allVisibleSelected =
    visibleItems.length > 0 && visibleItems.every((it) => selectedIds.has(it.data.id));
  const someVisibleSelected =
    !allVisibleSelected && visibleItems.some((it) => selectedIds.has(it.data.id));

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const runBulk = (action: 'read' | 'unread' | 'complete' | 'uncomplete') => {
    onBulk(action, visibleItems.filter((it) => selectedIds.has(it.data.id)));
    setSelectedIds(new Set());
  };

  // The email-only folders reuse the same row through a UnifiedItem wrapper.
  const folderItems: UnifiedItem[] = emailItems.map((data) => ({ kind: 'email', data }));
  // Drafts are ordinary email rows fetched from the drafts folder — the row only
  // needs to know so it can show recipients rather than the sender.
  const isDrafts = selectedLabel === 'DRAFTS';
  const rows = isInboxLike ? visibleItems : folderItems;

  const renderRow = (item: UnifiedItem, idx: number) => (
    <InboxRow
      key={item.data.id}
      item={item}
      isFirst={idx === 0}
      selectionMode={isInboxLike && selectionMode}
      selected={selectedIds.has(item.data.id)}
      showKindBadge={isInboxLike}
      companyId={companyId}
      token={token}
      onOpen={() => onOpenItem(item)}
      onToggleSelect={() => toggleSelected(item.data.id)}
      onToggleRead={() => onToggleRead(item)}
      onToggleComplete={() =>
        onToggleComplete({ kind: item.kind, id: item.data.id }, !!item.data.isCompleted)
      }
      onCall={onCall}
      isDraft={isDrafts}
    />
  );

  return (
    <div ref={listRootRef} className="flex flex-col gap-4">
      {/* New email banner */}
      {newEmailBanner && (
        <MessageNotice
          tone="teal"
          icon={<Mail size={14} className="text-teal-600" />}
          action={
            <button onClick={onDismissNewEmailBanner} className="text-teal-600 hover:text-teal-800">
              <X size={14} />
            </button>
          }
        >
          New email received
        </MessageNotice>
      )}

      {/* A read/complete toggle that failed. Without this the optimistic update is
          rolled back silently and the change just appears to "not stick". */}
      {/* A draft row that wouldn't open. Kept separate from stateError because
          nothing was being saved, and "Couldn't save that change" would be a lie. */}
      {draftError && (
        <MessageNotice
          tone="destructive"
          action={
            <button
              onClick={onDismissDraftError}
              className="text-destructive/70 hover:text-destructive"
            >
              <X size={14} />
            </button>
          }
        >
          {draftError}
        </MessageNotice>
      )}

      {stateError && (
        <MessageNotice
          tone="destructive"
          action={
            <button onClick={onResetStateError} className="text-destructive/70 hover:text-destructive">
              <X size={14} />
            </button>
          }
        >
          Couldn't save that change: {stateError}
        </MessageNotice>
      )}

      <InboxNotices
        emailNeedsReconnect={emailNeedsReconnect}
        chatNeedsReconnect={chatNeedsReconnect}
        chatStatus={chatStatus}
        chatsFailed={chatsFailed}
        chatItemCount={chatItemCount}
        isInboxLike={isInboxLike}
        account={account}
        provider={provider}
        providerLabels={providerLabels}
        isAdmin={isAdmin}
        onReconnect={() => onConnect(provider)}
        onRetryChats={onRetryChats}
        onConnect={onConnect}
        connecting={connecting}
        connectDismissed={connectDismissed}
        onDismissConnect={onDismissConnect}
      />

      <FolderTabs
        account={account}
        selectedLabel={selectedLabel}
        onSelectFolder={onSelectFolder}
        unreadCount={unreadCount}
        uncompletedCount={uncompletedCount}
      />

      {/* Search + filter toolbar. Search works in every folder; the kind filter and
          multi-select are inbox-only (chats and completion state live there). */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SearchInput
            value={searchInput}
            onChange={onSearchInput}
            placeholder={searchPlaceholder}
            className="h-9"
          />
        </div>
        <AdvancedSearchPanel
          filters={filters}
          onApply={onFiltersChange}
          relevanceOrderWarning={relevanceOrderWarning}
        />
        {isInboxLike && (
          <>
            <Select
              items={KIND_FILTER_LABELS}
              value={filter}
              onValueChange={(v) => onFilterChange((v as KindFilter) ?? 'all')}
            >
              <SelectTrigger size="sm" className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KIND_FILTER_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Multi-select toggle (admin only) */}
            {isAdmin && (
              <Button
                type="button"
                variant={selectionMode ? 'default' : 'outline'}
                size="sm"
                className={selectionMode ? 'gap-1.5 bg-teal-600 hover:bg-teal-700 text-white' : 'gap-1.5'}
                onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
              >
                <ListChecks size={14} />
                {selectionMode ? 'Done' : 'Select'}
              </Button>
            )}
          </>
        )}
      </div>

      {/* Bulk action bar (inbox-like, admin, selection mode) */}
      {isInboxLike && isAdmin && selectionMode && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-teal-200 bg-teal-50/60 px-3 py-2">
          <label className="flex items-center gap-2 text-sm font-medium text-teal-900 cursor-pointer select-none">
            <Checkbox
              checked={allVisibleSelected}
              indeterminate={someVisibleSelected}
              onCheckedChange={() =>
                setSelectedIds(
                  allVisibleSelected ? new Set() : new Set(visibleItems.map((it) => it.data.id)),
                )
              }
            />
            Select all
          </label>
          <span className="text-xs text-muted-foreground">
            {selectedIds.size} selected{' '}
            <span className="text-muted-foreground/70">· of {visibleItems.length} loaded</span>
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button
              type="button" variant="outline" size="sm" className="gap-1"
              disabled={selectedIds.size === 0}
              onClick={() => runBulk('read')}
            >
              <MailOpen size={14} /> Mark read
            </Button>
            <Button
              type="button" variant="outline" size="sm" className="gap-1"
              disabled={selectedIds.size === 0}
              onClick={() => runBulk('unread')}
            >
              <Mail size={14} /> Mark unread
            </Button>
            <Button
              type="button" variant="outline" size="sm" className="gap-1 text-blue-700 border-blue-200 hover:bg-blue-50"
              disabled={selectedIds.size === 0}
              onClick={() => setBulkAction('complete')}
            >
              <CheckCircle2 size={14} /> Complete
            </Button>
            <Button
              type="button" variant="outline" size="sm" className="gap-1"
              disabled={selectedIds.size === 0}
              onClick={() => setBulkAction('uncomplete')}
            >
              <Circle size={14} /> Uncomplete
            </Button>
            <Button
              type="button" variant="ghost" size="sm" className="gap-1 text-muted-foreground"
              onClick={exitSelection}
            >
              <X size={14} /> Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Message list */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : (
        <Card className="overflow-hidden gap-0 py-0 rounded-lg">
          {rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {isInboxLike
                ? isFiltering
                  ? 'No messages match your search'
                  : selectedLabel === 'UNCOMPLETED'
                    ? 'No uncompleted messages'
                    : selectedLabel === 'UNREAD'
                      ? 'No unread messages'
                      : 'Inbox is empty'
                : activeSearch
                  ? 'No messages match your search'
                  : isDrafts
                    ? 'No drafts'
                    : 'No messages'}
            </div>
          ) : (
            rows.map(renderRow)
          )}
        </Card>
      )}

      {/* Infinite-scroll sentinel + status (shown for both inbox and folders) */}
      {!isLoading && (
        <div ref={loadMoreRef} className="flex items-center justify-center py-4">
          {/* Outside the unified inbox only email pages, so a background chat/phone
              page must not read as "loading more" in Sent/Spam/Trash. */}
          {(isInboxLike ? anyFetchingNext : emailFetchingNext) ? (
            <span className="text-xs text-muted-foreground">Loading more…</span>
          ) : phoneLoading ? (
            /* A source that has not returned its FIRST page reports hasNextPage:false, so
               `allExhausted` below would otherwise announce the list is complete while
               calls and texts are still on the way. Now that a late phone query no longer
               blanks the list, this is the only thing standing between the user and a
               confident "You're all caught up" over a half-loaded inbox. */
            <span className="text-xs text-muted-foreground">
              Loading calls &amp; texts…
            </span>
          ) : (isInboxLike ? allExhausted : !emailHasNext) && rows.length > 0 ? (
            <span className="text-xs text-muted-foreground/70">You're all caught up</span>
          ) : null}
        </div>
      )}

      {/* Compose is no longer here: it is the app-level docked window (see
          ComposerContext), so it survives leaving this tab. */}

      {/* Bulk complete/uncomplete confirmation (read/unread apply without a prompt) */}
      <Dialog open={bulkAction !== null} onOpenChange={(open) => { if (!open) setBulkAction(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {bulkAction === 'uncomplete'
                ? `Mark ${selectedIds.size} message${selectedIds.size === 1 ? '' : 's'} not complete?`
                : `Mark ${selectedIds.size} message${selectedIds.size === 1 ? '' : 's'} complete?`}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {bulkAction === 'uncomplete'
              ? 'This removes the completed check from the selected messages for everyone.'
              : 'The selected messages stay in the inbox with a blue check, visible to everyone.'}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setBulkAction(null)}>
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1"
              onClick={() => {
                if (bulkAction) runBulk(bulkAction);
                setBulkAction(null);
              }}
            >
              {bulkAction === 'uncomplete' ? <Circle size={14} /> : <CheckCircle2 size={14} />}
              {bulkAction === 'uncomplete' ? 'Mark not complete' : 'Mark complete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
