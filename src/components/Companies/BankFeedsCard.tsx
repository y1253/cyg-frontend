import { useState } from 'react';
import { Landmark, Loader2, Plus, RefreshCw, Unplug } from 'lucide-react';
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
import type { BankAccount, BankItem } from '@/api/bankFeeds';
import {
  useBankFeedsStatus,
  useConnectBank,
  useDisconnectBankItem,
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
        <span className="ml-2 text-xs text-muted-foreground capitalize">
          {a.subtype ?? a.type}
        </span>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <div>{money(a.currentBalance, a.currency)}</div>
        {a.availableBalance !== null && a.availableBalance !== a.currentBalance && (
          <div className="text-xs text-muted-foreground">
            {money(a.availableBalance, a.currency)} available
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * step2.md (2026-11-04): the company's bank logins through Plaid. An ADMIN connects them
 * (Plaid Link; the access token is encrypted on the server); the company's AI agents then
 * read balances and transactions through `/api/agent/bank/*`. Everyone else sees the status.
 */
export function BankFeedsCard({
  companyId,
  canConnect,
}: {
  companyId: number;
  canConnect: boolean;
}) {
  const status = useBankFeedsStatus(companyId);
  const { connect, busy, error } = useConnectBank(companyId);
  const sync = useSyncBankItem(companyId);
  const disconnect = useDisconnectBankItem(companyId);
  const [confirming, setConfirming] = useState<BankItem | null>(null);
  const s = status.data;
  const items = s?.items.filter((i) => i.status !== 'REMOVED') ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Landmark className="size-4 text-[#3BBFB4]" /> Bank feeds
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Connected through Plaid, the AI agent reads balances and transactions by API — no
            bank sign-in in its browser.
          </p>
        </div>
        {canConnect && s?.configured && (
          <Button size="sm" onClick={() => void connect()} disabled={busy !== null}>
            {busy === 'new' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Connect bank
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {status.isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : status.isError ? (
          <p className="text-destructive">{(status.error as Error).message}</p>
        ) : !s?.configured ? (
          <p className="text-muted-foreground">
            Bank feeds are not set up on the server yet (PLAID_CLIENT_ID / PLAID_SECRET).
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
                  <div className="ml-auto flex items-center gap-1">
                    {item.status !== 'ACTIVE' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => void connect(item.id)}
                      >
                        {busy === item.id && <Loader2 className="size-4 animate-spin" />}
                        Reconnect
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Sync now"
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
                <p className="mt-1 text-xs break-words text-destructive">{item.error}</p>
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

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect {confirming?.institutionName ?? 'this bank'}?</DialogTitle>
            <DialogDescription>
              The connection is removed at Plaid and the AI agent can no longer read this
              bank&rsquo;s balances or transactions. Connecting it again is a new sign-in.
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
