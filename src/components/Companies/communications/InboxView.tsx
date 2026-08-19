import { useEffect, useState } from 'react';
import {
  CheckCircle2, Circle, ListChecks, Mail, MailOpen, Plus, Trash2, X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { useDisconnectGmail } from '@/hooks/useDisconnectGmail';
import { MessageNotice } from '../MessageNotice';
import { InboxNotices } from './InboxNotices';
import { InboxRow } from './InboxRow';
import { FOLDERS, KIND_FILTER_LABELS, type CompleteTarget, type KindFilter, type UnifiedItem } from './types';

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
  accountAddress,
  provider,
  providerLabels,
  listRootRef,
  loadMoreRef,
  selectedLabel,
  onSelectFolder,
  searchInput,
  onSearchInput,
  searchPlaceholder,
  filter,
  onFilterChange,
  isInboxLike,
  isFiltering,
  activeSearch,
  isLoading,
  visibleItems,
  emailItems,
  emailHasNext,
  chatHasNext,
  emailFetchingNext,
  chatFetchingNext,
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
  onResetStateError,
  onConnect,
  onRetryChats,
  onCompose,
  onOpenItem,
  onToggleRead,
  onToggleComplete,
  onBulk,
}: {
  companyId: number;
  token: string | null;
  isAdmin: boolean;
  account: GmailAccount;
  accountAddress: string;
  provider: EmailProvider;
  providerLabels: { name: string; chat: string };
  listRootRef: React.Ref<HTMLDivElement>;
  loadMoreRef: React.Ref<HTMLDivElement>;
  selectedLabel: string;
  onSelectFolder: (id: string) => void;
  searchInput: string;
  onSearchInput: (v: string) => void;
  searchPlaceholder: string;
  filter: KindFilter;
  onFilterChange: (f: KindFilter) => void;
  isInboxLike: boolean;
  /** Narrowed by search or kind — drives the empty-state copy. */
  isFiltering: boolean;
  activeSearch: string | undefined;
  isLoading: boolean;
  visibleItems: UnifiedItem[];
  /** The email-only folders (Sent/Spam/Trash) render straight off this. */
  emailItems: EmailSummary[];
  emailHasNext: boolean;
  chatHasNext: boolean;
  emailFetchingNext: boolean;
  chatFetchingNext: boolean;
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
  onResetStateError: () => void;
  onConnect: (provider: EmailProvider) => void;
  onRetryChats: () => void;
  onCompose: () => void;
  onOpenItem: (item: UnifiedItem) => void;
  onToggleRead: (item: UnifiedItem) => void;
  onToggleComplete: (target: CompleteTarget, isCompleted: boolean) => void;
  onBulk: (action: 'read' | 'unread' | 'complete' | 'uncomplete', items: UnifiedItem[]) => void;
}) {
  const disconnectMutation = useDisconnectGmail(companyId);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);

  // Bulk multi-select (admin, inbox only). `selectionMode` swaps row clicks from
  // "open" to "toggle select"; `selectedIds` holds the picked message ids (email
  // ids have no "/", chat ids do, so the kind is re-derived at action time). A
  // pending bulk complete/uncomplete is parked in `bulkAction` for confirmation.
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
    />
  );

  return (
    <div ref={listRootRef} className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-teal-600" />
          <Badge variant="outline" className="text-teal-700 border-teal-200 bg-teal-50">
            {accountAddress}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={onCompose}
            className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
          >
            <Plus size={14} /> Compose
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/5 gap-1"
              onClick={() => setDisconnectConfirmOpen(true)}
            >
              <Trash2 size={14} /> Disconnect
            </Button>
          )}
        </div>
      </div>

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
      />

      {/* Folder tabs */}
      <div className="flex items-center gap-1 border-b">
        {FOLDERS.map(({ id, label, icon: Icon }) => {
          const badge =
            id === 'UNCOMPLETED' ? uncompletedCount : id === 'UNREAD' ? unreadCount : 0;
          return (
            <button
              key={id}
              onClick={() => onSelectFolder(id)}
              className={[
                'flex items-center gap-1.5 px-3 py-2 text-sm transition-colors',
                selectedLabel === id
                  ? 'text-teal-700 border-b-2 border-teal-600 font-medium -mb-px'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              <Icon size={13} />
              {label}
              {badge > 0 && (
                <span className="ml-0.5 text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-semibold leading-none">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

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
          {emailFetchingNext || chatFetchingNext ? (
            <span className="text-xs text-muted-foreground">Loading more…</span>
          ) : (isInboxLike ? (!emailHasNext && !chatHasNext) : !emailHasNext) && rows.length > 0 ? (
            <span className="text-xs text-muted-foreground/70">You're all caught up</span>
          ) : null}
        </div>
      )}

      {/* Compose is no longer here: it is the app-level docked window (see
          ComposerContext), so it survives leaving this tab. */}

      {/* Disconnect confirm dialog */}
      <Dialog open={disconnectConfirmOpen} onOpenChange={setDisconnectConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect {providerLabels.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove access to <strong>{accountAddress}</strong>. You can reconnect
            anytime from the Billing section.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDisconnectConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={disconnectMutation.isPending}
              onClick={() =>
                disconnectMutation.mutate(undefined, {
                  onSuccess: () => setDisconnectConfirmOpen(false),
                })
              }
            >
              {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
