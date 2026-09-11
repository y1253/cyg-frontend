import { useMemo, useState } from 'react';
import {
  MessageSquareText, Pencil, Phone, Plus, Trash2, UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/SearchInput';
import {
  useContacts, useCreateContact, useDeleteContact, useUpdateContact,
} from '@/hooks/useContacts';
import { formatE164 } from '@/lib/phone';
import type { Contact, ContactInput } from '@/api/contacts';
import { FolderTabs } from './FolderTabs';
import { ContactEditDialog } from './ContactEditDialog';

/**
 * The company's address book, as a tab inside Communications.
 *
 * It REPLACES the inbox rather than sitting beside it, which is why it renders
 * `FolderTabs` itself — that strip is the only way back out.
 *
 * Search is client-side, deliberately unlike every other folder here: an address book is
 * tens of rows and already fully loaded, so a server round-trip per keystroke would be
 * slower than the filter it replaced.
 */
export function ContactsPanel({
  companyId,
  account,
  selectedLabel,
  onSelectFolder,
  unreadCount,
  uncompletedCount,
  supportNumber,
  onCall,
  onText,
}: {
  companyId: number;
  account: unknown;
  selectedLabel: string;
  onSelectFolder: (id: string) => void;
  unreadCount: number;
  uncompletedCount: number;
  /** Null when this company has no line, which hides Call and Text. */
  supportNumber: string | null;
  onCall: (e164: string) => void;
  onText: (e164: string) => void;
}) {
  const { data: contacts, isLoading, error } = useContacts(companyId);
  const create = useCreateContact(companyId);
  const update = useUpdateContact(companyId);
  const remove = useDeleteContact(companyId);

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Contact | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Contact | null>(null);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts ?? [];
    return (contacts ?? []).filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.phone.toLowerCase().includes(term) ||
        (c.phoneE164 ?? '').includes(term) ||
        (c.email ?? '').toLowerCase().includes(term),
    );
  }, [contacts, search]);

  const save = (data: ContactInput) => {
    const done = () => {
      setDialogOpen(false);
      setEditing(null);
    };
    if (editing) update.mutate({ id: editing.id, data }, { onSuccess: done });
    else create.mutate(data, { onSuccess: done });
  };

  const saveError =
    ((editing ? update.error : create.error) as Error | null)?.message ?? null;

  return (
    <>
      <FolderTabs
        account={account}
        selectedLabel={selectedLabel}
        onSelectFolder={onSelectFolder}
        unreadCount={unreadCount}
        uncompletedCount={uncompletedCount}
      />

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search contacts…"
          />
        </div>
        <Button
          size="sm"
          className="gap-1 shrink-0"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus size={14} />
          Add contact
        </Button>
      </div>

      {error && (
        <p className="px-1 py-3 text-sm text-destructive">
          {(error as Error).message}
        </p>
      )}

      {isLoading ? (
        <p className="px-1 py-6 text-sm text-muted-foreground">Loading contacts…</p>
      ) : rows.length === 0 ? (
        <div className="px-1 py-10 text-center">
          <UserRound size={22} className="mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {contacts?.length
              ? 'No contact matches that search.'
              : 'No contacts yet. Add one and their name will show on incoming calls.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {rows.map((contact) => (
            <li
              key={contact.id}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700">
                {contact.name.trim().charAt(0).toUpperCase() || '?'}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{contact.name}</span>
                  {contact.autoSource && (
                    <span
                      className="shrink-0 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700"
                      title="Kept in step with the Contact and Accountant cards on the Details tab. An edit here is overwritten the next time that section is saved."
                    >
                      From company details
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {formatE164(contact.phoneE164 ?? contact.phone) || contact.phone}
                  {!contact.phoneE164 && (
                    <span
                      className="ml-1.5 text-amber-700"
                      title="This number has no country code, so it cannot be matched to an incoming call."
                    >
                      · not matched to calls
                    </span>
                  )}
                  {contact.email && <span className="ml-1.5">· {contact.email}</span>}
                </div>
                {contact.note && (
                  <p className="truncate text-xs text-muted-foreground/80">
                    {contact.note}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {supportNumber && contact.phoneE164 && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-green-700 hover:bg-green-50"
                      title={`Call ${contact.name}`}
                      onClick={() => onCall(contact.phoneE164!)}
                    >
                      <Phone size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-amber-700 hover:bg-amber-50"
                      title={`Text ${contact.name}`}
                      onClick={() => onText(contact.phoneE164!)}
                    >
                      <MessageSquareText size={14} />
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  title="Edit"
                  onClick={() => {
                    setEditing(contact);
                    setDialogOpen(true);
                  }}
                >
                  <Pencil size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                  title="Delete"
                  onClick={() => setConfirmDelete(contact)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ContactEditDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setEditing(null);
        }}
        contact={editing}
        onSave={save}
        pending={create.isPending || update.isPending}
        error={saveError}
      />

      {confirmDelete && (
        <ConfirmDelete
          contact={confirmDelete}
          pending={remove.isPending}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() =>
            remove.mutate(confirmDelete.id, {
              onSuccess: () => setConfirmDelete(null),
            })
          }
        />
      )}
    </>
  );
}

function ConfirmDelete({
  contact,
  pending,
  onCancel,
  onConfirm,
}: {
  contact: Contact;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg border bg-background p-4 shadow-xl">
        <h3 className="text-sm font-semibold">Delete {contact.name}?</h3>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Their calls and texts stay in the inbox — they will just show the number again.
          {contact.autoSource &&
            ' This contact comes from the Details tab, so saving that section will bring it back.'}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  );
}
