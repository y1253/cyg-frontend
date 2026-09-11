import { FOLDERS, MAILBOX_ONLY_FOLDERS } from './types';

/**
 * The folder strip along the top of the Communications tab.
 *
 * Extracted from `InboxView` so the Contacts panel can render the SAME strip. It has to:
 * Contacts replaces the inbox entirely rather than appearing beside it, so without the
 * strip there would be no way back to the inbox except the browser's back button — and a
 * second, hand-rolled copy would drift the moment a folder is added.
 */
export function FolderTabs({
  account,
  selectedLabel,
  onSelectFolder,
  unreadCount,
  uncompletedCount,
}: {
  /** Null when no mailbox is connected, which hides the mail-only folders. */
  account: unknown;
  selectedLabel: string;
  onSelectFolder: (id: string) => void;
  unreadCount: number;
  uncompletedCount: number;
}) {
  return (
    <div className="flex items-center gap-1 border-b">
      {FOLDERS.filter(
        // Sent / Spam / Trash are mailbox folders. With no mailbox they would render
        // as tabs that are permanently empty and can never fill.
        (f) => account || !MAILBOX_ONLY_FOLDERS.includes(f.id),
      ).map(({ id, label, icon: Icon }) => {
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
  );
}
