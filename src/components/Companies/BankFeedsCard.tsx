import { useState } from 'react';
import { CalendarDays, Landmark, ListChecks, Loader2, Plus, RefreshCw, Unplug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { BankAccount, BankItem } from '@/api/bankFeeds';
import {
  useBankFeedsConfig,
  useBankFeedsStatus,
  useConnectBank,
  useDisconnectBankItem,
  useSetBankStartDates,
  useSyncBankItem,
} from '@/hooks/useBankFeeds';

function money(value: number | null, currency: string | null): string {
  if (value === null) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'CAD',
    }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

function StatusBadge({ item }: { item: BankItem }) {
  if (item.status === 'LOGIN_REQUIRED')
    return <Badge variant="destructive">Sign-in needed</Badge>;
  if (item.status === 'ERROR') return <Badge variant="destructive">Error</Badge>;
  if (!item.setupAt) return <Badge variant="secondary">Start dates needed</Badge>;
  if (item.syncing || !item.historyDone)
    return <Badge variant="secondary">{item.syncing ? 'Syncing…' : 'Loading history…'}</Badge>;
  return <Badge className="bg-[#3BBFB4] text-white hover:bg-[#3BBFB4]">Connected</Badge>;
}

function AccountRow({ a }: { a: BankAccount }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <div className="min-w-0">
        <span className="font-medium">{a.name}</span>
        {a.mask && <span className="ml-1 text-muted-foreground">••{a.mask}</span>}
        <div className="text-xs text-muted-foreground">
          Filed as {a.accountName}
          {a.startDate ? ` · from ${a.startDate}` : ' · all history'}
        </div>
      </div>
      <div className="shrink-0 text-right tabular-nums">{money(a.currentBalance, a.currency)}</div>
    </div>
  );
}

/** Each account's first day in the books — blank = all the history Plaid gives. */
function StartDatesDialog({
  companyId,
  item,
  onClose,
}: {
  companyId: number;
  item: BankItem | null;
  onClose: () => void;
}) {
  const save = useSetBankStartDates(companyId);
  const [dates, setDates] = useState<Record<number, string>>({});
  const [forItem, setForItem] = useState<number | null>(null);
  if (item && forItem !== item.id) {
    setForItem(item.id);
    setDates(Object.fromEntries(item.accounts.map((a) => [a.id, a.startDate ?? ''])));
  }
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start dates — {item?.institutionName ?? 'bank'}</DialogTitle>
          <DialogDescription>
            The first day of each account that goes into the books (and to QuickBooks when that
            is on). Leave it blank for all the history the bank gives (from{' '}
            {item?.earliestDate}). Nothing is filed until this is saved.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {item?.accounts.map((a) => (
            <div key={a.id} className="flex flex-col gap-1">
              <Label htmlFor={`start-${a.id}`}>
                {a.name}
                {a.mask ? ` ••${a.mask}` : ''}
              </Label>
              <Input
                id={`start-${a.id}`}
                type="date"
                min={item.earliestDate}
                value={dates[a.id] ?? ''}
                onChange={(e) => setDates((d) => ({ ...d, [a.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        {save.isError && (
          <p className="text-sm text-destructive">{(save.error as Error).message}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={save.isPending || !item}
            onClick={() =>
              item &&
              save.mutate(
                {
                  itemId: item.id,
                  accounts: item.accounts.map((a) => ({
                    id: a.id,
                    startDate: dates[a.id] || null,
                  })),
                },
                { onSuccess: onClose },
              )
            }
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * step11 (2026-11-23): the company's bank connections — through the CUSTOMER app's Plaid
 * setup, into the company's book on cygfinance.com, so a bank the customer connected there
 * shows here and one connected here shows there. The customer API files and categorises
 * the transactions (see the Bank transactions tab) and, when it is on, enters them in
 * QuickBooks. Only an ADMIN connects, refreshes or disconnects; everyone sees the status.
 */
export function BankFeedsCard({
  companyId,
  canConnect,
}: {
  companyId: number;
  canConnect: boolean;
}) {
  const config = useBankFeedsConfig(companyId);
  const status = useBankFeedsStatus(companyId);
  const { connect, busy, error } = useConnectBank(companyId);
  const sync = useSyncBankItem(companyId);
  const disconnect = useDisconnectBankItem(companyId);
  const [confirming, setConfirming] = useState<BankItem | null>(null);
  const [dating, setDating] = useState<BankItem | null>(null);
  const items = status.data?.filter((i) => i.status !== 'REMOVED') ?? [];
  const enabled = config.data?.enabled ?? false;

  const connectAndDate = async (itemId?: number, chooseAccounts = false) => {
    const item = await connect(itemId, chooseAccounts);
    if (item && (!itemId || !item.setupAt || chooseAccounts)) setDating(item);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Landmark className="size-4 text-[#3BBFB4]" /> Bank feeds
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Connected through Plaid into the company&rsquo;s books on cygfinance.com — the same
            banks the customer sees there. Transactions are categorised there.
          </p>
        </div>
        {canConnect && enabled && (
          <Button size="sm" onClick={() => void connectAndDate()} disabled={busy !== null}>
            {busy === 'new' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Connect bank
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {status.isLoading || config.isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : status.isError ? (
          <p className="text-destructive">{(status.error as Error).message}</p>
        ) : !enabled && !items.length ? (
          <p className="text-muted-foreground">
            Bank feeds are not set up on the customer server (PLAID_CLIENT_ID / PLAID_SECRET).
          </p>
        ) : !items.length ? (
          <p className="text-muted-foreground">
            No bank connected{canConnect ? '.' : ' — an admin can connect one.'}
          </p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge item={item} />
                <span className="font-medium">{item.institutionName ?? 'Bank'}</span>
                {item.lastSyncAt && (
                  <span className="text-xs text-muted-foreground">
                    synced {new Date(item.lastSyncAt).toLocaleString()}
                  </span>
                )}
                {canConnect && (
                  <div className="ml-auto flex flex-wrap items-center gap-1">
                    {item.status !== 'ACTIVE' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => void connectAndDate(item.id)}
                      >
                        {busy === item.id && <Loader2 className="size-4 animate-spin" />}
                        Sign in again
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={item.setupAt ? 'ghost' : 'default'}
                      title="Start dates"
                      onClick={() => setDating(item)}
                    >
                      <CalendarDays className="size-4" />
                      {!item.setupAt && 'Start dates'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Change accounts"
                      disabled={busy !== null}
                      onClick={() => void connectAndDate(item.id, true)}
                    >
                      <ListChecks className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Refresh now"
                      disabled={sync.isPending || item.syncing}
                      onClick={() => sync.mutate(item.id)}
                    >
                      <RefreshCw
                        className={`size-4 ${
                          (sync.isPending && sync.variables === item.id) || item.syncing
                            ? 'animate-spin'
                            : ''
                        }`}
                      />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() => setConfirming(item)}
                    >
                      <Unplug className="size-4" /> Disconnect
                    </Button>
                  </div>
                )}
              </div>
              {item.error && (
                <p
                  className={`mt-1 text-xs break-words ${
                    item.status === 'ACTIVE' ? 'text-amber-700' : 'text-destructive'
                  }`}
                  title={item.errorDetail ?? undefined}
                >
                  {item.error}
                </p>
              )}
              {item.refreshNote && (
                <p className="mt-1 text-xs text-muted-foreground">{item.refreshNote}</p>
              )}
              {item.newAccounts && (
                <p className="mt-1 text-xs text-amber-700">
                  The bank has an account that is not shared yet — use Change accounts to add it.
                </p>
              )}
              {item.accounts.length > 0 && (
                <div className="mt-2 divide-y">
                  {item.accounts.map((a) => (
                    <AccountRow key={a.id} a={a} />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {sync.isError && (
          <p className="text-xs text-destructive">{(sync.error as Error).message}</p>
        )}
      </CardContent>

      <StartDatesDialog companyId={companyId} item={dating} onClose={() => setDating(null)} />

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect {confirming?.institutionName ?? 'this bank'}?</DialogTitle>
            <DialogDescription>
              The connection is removed at Plaid — for the customer on cygfinance.com too. The
              transactions already in the books stay. Connecting it again is a new sign-in.
            </DialogDescription>
          </DialogHeader>
          {disconnect.isError && (
            <p className="text-sm text-destructive">{(disconnect.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={disconnect.isPending}
              onClick={() =>
                confirming &&
                disconnect.mutate(confirming.id, { onSuccess: () => setConfirming(null) })
              }
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
