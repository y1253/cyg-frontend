import { useState } from 'react';
import { BookOpen, Loader2, Unplug } from 'lucide-react';
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
import {
  useConnectQuickBooks,
  useDisconnectQuickBooks,
  useQuickBooksStatus,
} from '@/hooks/useQuickBooks';

/**
 * step2.md (2026-11-04): the company's QuickBooks Online file. An ADMIN connects it once
 * (Intuit sign-in, tokens encrypted on the server); the company's AI agents then read and
 * write the books through the API instead of signing in to QuickBooks in their browser.
 * Everyone else sees the status only.
 */
export function QuickBooksCard({
  companyId,
  canConnect,
}: {
  companyId: number;
  canConnect: boolean;
}) {
  const status = useQuickBooksStatus(companyId);
  const { connect, connecting, error } = useConnectQuickBooks(companyId);
  const disconnect = useDisconnectQuickBooks(companyId);
  const [confirming, setConfirming] = useState(false);
  const s = status.data;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="size-4 text-[#2CA01C]" /> QuickBooks Online
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Connected, the AI agent works the books through QuickBooks&rsquo; API — no browser
            sign-in, no texted code.
          </p>
        </div>
        {canConnect && s?.configured && (!s.connected || s.needsReconnect) && (
          <Button size="sm" onClick={() => void connect()} disabled={connecting}>
            {connecting && <Loader2 className="size-4 animate-spin" />}
            {s.needsReconnect ? 'Reconnect' : 'Connect QuickBooks'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {status.isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : status.isError ? (
          <p className="text-destructive">{(status.error as Error).message}</p>
        ) : !s?.configured ? (
          <p className="text-muted-foreground">
            QuickBooks is not set up on the server yet (QBO_CLIENT_ID / QBO_CLIENT_SECRET).
          </p>
        ) : !s.connected ? (
          <p className="text-muted-foreground">
            Not connected{canConnect ? '.' : ' — an admin can connect it.'}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {s.needsReconnect ? (
              <Badge variant="destructive">Reconnect needed</Badge>
            ) : (
              <Badge className="bg-[#2CA01C] text-white hover:bg-[#2CA01C]">Connected</Badge>
            )}
            <span className="font-medium">{s.companyName ?? `Company ${s.realmId}`}</span>
            {s.connectedAt && (
              <span className="text-xs text-muted-foreground">
                since {new Date(s.connectedAt).toLocaleDateString()}
              </span>
            )}
            {canConnect && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-muted-foreground"
                onClick={() => setConfirming(true)}
              >
                <Unplug className="size-4" /> Disconnect
              </Button>
            )}
          </div>
        )}
        {s?.needsReconnect && s.lastError && (
          <p className="text-xs break-words text-muted-foreground">{s.lastError}</p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect QuickBooks?</DialogTitle>
            <DialogDescription>
              The AI agent goes back to signing in to QuickBooks in its browser. Nothing in the
              books changes.
            </DialogDescription>
          </DialogHeader>
          {disconnect.isError && (
            <p className="text-sm text-destructive">{(disconnect.error as Error).message}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={disconnect.isPending}
              onClick={() =>
                disconnect.mutate(undefined, { onSuccess: () => setConfirming(false) })
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
