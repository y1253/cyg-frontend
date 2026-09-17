import { useState } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatE164 } from '@/lib/phone';
import { usePhoneNumber, useReleaseNumber } from '@/hooks/usePhoneNumber';
import { ConnectNumberDialog } from './ConnectNumberDialog';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Error';
}

/**
 * Admin management of a company's SignalWire support number.
 *
 * Lives in the Details tab rather than Communications: that tab is gated on a connected
 * mailbox, which would hide the phone controls entirely for a company with no email.
 */
export function PhoneNumberSection({
  companyId,
  companyCountry,
}: {
  companyId: number;
  /** `'USA'` | `'CANADA'` from registration. Seeds the search country. */
  companyCountry: string | null;
}) {
  const { data: number, isLoading } = usePhoneNumber(companyId);
  const release = useReleaseNumber(companyId);

  const [connectOpen, setConnectOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Phone size={16} className="text-teal-600" />
          Support Number
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : number ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                {formatE164(number.phoneNumber)}
              </span>
              {/* ⚠️ No "Voice + SMS" badge here, deliberately.
                  It used to be hardcoded on every connected number, which made it a claim
                  with nothing behind it. `SupportNumber` stores no capability columns, and
                  adding them would not help: the PURCHASE response's capabilities are a
                  constant that lies (see CLAUDE.md), so the only truthful source is a
                  provider round trip — and even that would be a snapshot, since a number's
                  SMS capability moves with its 10DLC/campaign state. The search list's own
                  badge stays, because that one is derived from real capabilities and goes
                  MISSING rather than lying. */}
              <div className="flex items-center gap-1.5">
                {number.region && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 text-muted-foreground"
                  >
                    {number.region}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  connected {new Date(number.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDisconnectOpen(true)}
            >
              <PhoneOff size={14} className="mr-1.5" />
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              No support number connected.
            </p>
            <Button size="sm" onClick={() => setConnectOpen(true)}>
              <Phone size={14} className="mr-1.5" />
              Connect a number
            </Button>
          </div>
        )}

        {release.isError && (
          <p className="mt-2 text-xs text-destructive">
            {errorText(release.error)}
          </p>
        )}
      </CardContent>

      <ConnectNumberDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        companyId={companyId}
        companyCountry={companyCountry}
      />

      {/* Disconnect confirmation. Deliberately blunt: this is not reversible. */}
      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect this number?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong>{formatE164(number?.phoneNumber)}</strong> will be released back
            to SignalWire. Billing stops, but the number is gone permanently — it
            cannot be recovered, and anyone who calls or texts it will not reach this
            company.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDisconnectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={release.isPending}
              onClick={() =>
                release.mutate(undefined, {
                  onSuccess: () => setDisconnectOpen(false),
                })
              }
            >
              {release.isPending ? 'Disconnecting…' : 'Release number'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
