import { useState } from 'react';
import { Loader2, Phone, Search, UserRound } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAutocomplete } from '@/components/Companies/UserAutocomplete';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { usePresence } from '@/hooks/usePresence';
import { useContacts } from '@/hooks/useContacts';
import { useAuth } from '@/context/AuthContext';
import { formatE164, toE164 } from '@/lib/phone';
import { unlockAudio } from '@/lib/notificationSound';
import type { AddCallTarget } from '@/api/phone';

type Tab = 'contacts' | 'number' | 'colleague';

/**
 * "Who else should be on this call?"
 *
 * ── WHY A NUMBER IS ALLOWED HERE WHEN TRANSFER FORBIDS ONE ───────────────────
 * `TransferPicker` commits only directory picks, so a transfer structurally cannot become
 * an outbound-dialling surface. This one offers a number field, and that is not a
 * loosening of the same rule — it is a different question. A three-way call with an
 * outside party is most of the point, and dialling an arbitrary number from a company's
 * line is something click-to-call already does, behind the same
 * `assertMayUseCompanyPhone` check on the same caller ID. Nothing new is reachable.
 *
 * What still holds: the server decides what is actually dialled. A contact is named by
 * id and its number read off the row, never sent from here.
 *
 * ⚠️ An INTERNAL staff call gets the Colleague tab alone and no tab strip. A staff call
 * has no caller ID of its own, so there is no number it could dial from.
 */
export function AddCallPicker({
  open,
  onOpenChange,
  companyId,
  internal,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The company whose contacts and caller ID are in play. */
  companyId: number;
  /** A staff-to-staff call: colleagues only. */
  internal: boolean;
  onAdd: (target: AddCallTarget) => Promise<void>;
}) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>(internal ? 'colleague' : 'contacts');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [picked, setPicked] = useState<number[]>([]);
  const [number, setNumber] = useState('');
  const [search, setSearch] = useState('');

  const { data: directory } = useUserDirectory(open && tab === 'colleague');
  const { data: presence } = usePresence(open && tab === 'colleague');
  const { data: contacts, isLoading: contactsLoading } = useContacts(
    companyId,
    open && tab === 'contacts' && !internal,
  );

  const online = new Set(presence?.userIds ?? []);
  const targetId = picked[0];

  const matches = (contacts ?? []).filter((c) => {
    if (!c.phoneE164) return false; // nothing we could dial
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      c.name.toLowerCase().includes(term) || c.phoneE164.includes(term)
    );
  });

  const reset = () => {
    setPicked([]);
    setNumber('');
    setSearch('');
    setError(null);
  };

  async function commit(target: AddCallTarget) {
    if (busy) return;
    /*
     * ⚠️ Synchronously, inside the click. The new leg joins the call seconds later, and
     * by then this gesture is far too stale for the browser to grant audio on — the rule
     * `DialCallDialog` states in its own docblock.
     */
    unlockAudio();
    setBusy(true);
    setError(null);
    try {
      await onAdd(target);
      onOpenChange(false);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add them to the call');
    } finally {
      setBusy(false);
    }
  }

  const submitNumber = () => {
    const e164 = toE164(number);
    if (!e164) {
      setError('Enter a valid phone number, e.g. (438) 256-1210');
      return;
    }
    void commit({ phone: e164 });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      {/*
        ⚠️ Above the call overlay, which sits at `z-[200]`.

        The shadcn dialog defaults to `z-50`, so an in-call picker opens BEHIND the call
        card — the card covers its middle and the controls under it are unreachable.
        Every other dialog in the app is fine at 50 because nothing else renders that
        high; these two are the only ones raised from inside a live call.

        The backdrop stays at 50 deliberately, so the call card is NOT dimmed and Hang up
        stays clickable — the one control that must never be blocked.
      */}
      <DialogContent className="z-[210] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add someone to this call</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {!internal && (
            <div className="flex items-center gap-1 rounded-md bg-muted p-1">
              {(
                [
                  ['contacts', 'Contacts'],
                  ['number', 'Number'],
                  ['colleague', 'Colleague'],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setTab(id);
                    setError(null);
                  }}
                  className={[
                    'flex-1 rounded px-2 py-1.5 text-sm transition-colors',
                    tab === id
                      ? 'bg-background font-medium shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {tab === 'contacts' && (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search contacts…"
                  className="pl-8"
                  autoFocus
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-md border">
                {contactsLoading ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </p>
                ) : matches.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    {contacts?.length
                      ? 'Nobody here matches, or their number cannot be dialled.'
                      : 'No contacts saved for this company yet.'}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {matches.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void commit({ contactId: c.id })}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 disabled:opacity-50"
                        >
                          <UserRound
                            size={14}
                            className="shrink-0 text-muted-foreground"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {c.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {formatE164(c.phoneE164)}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {tab === 'number' && (
            <Input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitNumber();
              }}
              placeholder="(438) 256-1210"
              autoComplete="off"
              inputMode="tel"
              autoFocus
            />
          )}

          {tab === 'colleague' && (
            <>
              <UserAutocomplete
                value={picked.slice(0, 1)}
                onChange={(next) => setPicked(next.slice(-1))}
                users={(directory ?? []).filter((u) => u.id !== user?.id)}
                placeholder="Type a colleague's name…"
              />
              {targetId !== undefined && !online.has(targetId) && (
                /* Advisory, never a block — see TransferPicker for why presence lies. */
                <p className="text-sm text-amber-600">
                  They may be away — we cannot see an open session. Their phone will
                  still ring.
                </p>
              )}
            </>
          )}

          <p className="text-sm text-slate-500">
            Whoever you are on with is put on hold while this rings. You can merge
            everyone afterwards.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <DialogClose>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          {tab !== 'contacts' && (
            <Button
              onClick={() =>
                tab === 'number'
                  ? submitNumber()
                  : targetId !== undefined &&
                    void commit({ targetUserId: targetId })
              }
              disabled={
                busy ||
                (tab === 'number' ? number.trim() === '' : targetId === undefined)
              }
              className="gap-1 bg-green-600 text-white hover:bg-green-500"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Phone className="h-4 w-4" />
              )}
              Add
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
