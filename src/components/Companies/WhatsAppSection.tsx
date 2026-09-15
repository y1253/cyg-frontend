import { useState } from 'react';
import { Loader2, MessageCircle, RotateCcw, Unplug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useWhatsAppAccount } from '@/hooks/useWhatsAppAccount';
import { useWhatsAppConfig } from '@/hooks/useWhatsAppConfig';
import { useConnectFirmWhatsApp } from '@/hooks/useConnectFirmWhatsApp';
import { useDisconnectWhatsApp } from '@/hooks/useDisconnectWhatsApp';
import { useGenerateWhatsApp } from '@/hooks/useGenerateWhatsApp';
import { usePhoneNumber } from '@/hooks/usePhoneNumber';
import { NO_SUPPORT_NUMBER, WhatsAppRequestError, isWhatsAppSettingUp } from '@/api/whatsapp';
import { ConnectNumberDialog } from './ConnectNumberDialog';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Error';
}

/**
 * A company's WhatsApp number.
 *
 * "Generate WhatsApp account" makes one from the company's SignalWire support number: the
 * server adds it to the firm's WhatsApp Business Account and reads Meta's verification
 * text off that number itself, so there is no Meta popup and nobody types a code. With no
 * support number yet, the click opens the same buy-a-number popup the Support Number card
 * uses, and generation continues as soon as a number is bought.
 *
 * "Use firm number" (admin only) still attaches the firm's own number from the server
 * config. The Embedded Signup popup is no longer offered here; its server route and
 * `lib/facebookSdk.ts` stay for the client registration page.
 */
export function WhatsAppSection({
  companyId,
  companyCountry,
  canUseFirmNumber,
}: {
  companyId: number;
  /** Seeds the buy-a-number popup's country. */
  companyCountry: string | null;
  /** Admin only: it hands the company the firm's shared token. */
  canUseFirmNumber: boolean;
}) {
  const { data: account, isLoading } = useWhatsAppAccount(companyId);
  const { data: config } = useWhatsAppConfig();
  const { data: supportNumber } = usePhoneNumber(companyId);
  const generate = useGenerateWhatsApp(companyId);
  const connectFirm = useConnectFirmWhatsApp(companyId);
  const disconnect = useDisconnectWhatsApp(companyId);

  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const runGenerate = () => {
    setError(null);
    setWarning(null);
    generate.mutate(undefined, {
      onError: (err) => {
        // The server is the authority on "no number" — the cached lookup can be stale.
        if (err instanceof WhatsAppRequestError && err.code === NO_SUPPORT_NUMBER) {
          setBuyOpen(true);
        } else {
          setError(errorText(err));
        }
      },
    });
  };

  const handleGenerate = () => {
    // `null` is the answered "no number"; `undefined` is still loading, so let the server say.
    if (supportNumber === null) {
      setError(null);
      setBuyOpen(true);
      return;
    }
    runGenerate();
  };

  const handleFirmNumber = () => {
    setError(null);
    setWarning(null);
    connectFirm.mutate(undefined, {
      onSuccess: (res) => setWarning(res.warning),
      onError: (err) => setError(errorText(err)),
    });
  };

  const busy = generate.isPending || connectFirm.isPending;
  const settingUp = isWhatsAppSettingUp(account);
  const failed = account?.setupStatus === 'FAILED';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle size={16} className="text-emerald-600" />
          WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : account && settingUp ? (
          <div className="flex items-start gap-3">
            <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-emerald-600" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Setting up WhatsApp on {account.displayPhoneNumber}
              </span>
              <span className="text-xs text-muted-foreground">
                {account.setupStatus === 'VERIFYING'
                  ? 'Verifying the number with WhatsApp…'
                  : "Waiting for Meta's verification text to reach the support number. This usually takes under a minute."}
              </span>
            </div>
          </div>
        ) : account && failed ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{account.displayPhoneNumber}</span>
              <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                {account.setupError ?? 'WhatsApp setup failed.'}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDisconnectOpen(true)}>
                Remove
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={busy}
                onClick={runGenerate}
              >
                <RotateCcw size={14} className="mr-1.5" />
                {generate.isPending ? 'Retrying…' : 'Try again'}
              </Button>
            </div>
          </div>
        ) : account ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{account.displayPhoneNumber}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {account.verifiedName && (
                  <Badge
                    variant="outline"
                    className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0"
                  >
                    {account.verifiedName}
                  </Badge>
                )}
                {account.origin === 'FIRM' && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                    Firm number
                  </Badge>
                )}
                {account.origin === 'GENERATED' && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                    Support number
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  connected {new Date(account.connectedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setDisconnectOpen(true)}>
              <Unplug size={14} className="mr-1.5" />
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">No WhatsApp number connected.</p>
            <div className="flex flex-wrap gap-2">
              {canUseFirmNumber && config?.firmNumberAvailable && (
                <Button size="sm" variant="outline" disabled={busy} onClick={handleFirmNumber}>
                  {connectFirm.isPending ? 'Attaching…' : 'Use firm number'}
                </Button>
              )}
              <span
                title={
                  config && !config.generateAvailable
                    ? 'WHATSAPP_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID must be set on the server.'
                    : undefined
                }
              >
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={busy || !config?.generateAvailable}
                  onClick={handleGenerate}
                >
                  <MessageCircle size={14} className="mr-1.5" />
                  {generate.isPending ? 'Generating…' : 'Generate WhatsApp account'}
                </Button>
              </span>
            </div>
          </div>
        )}

        {warning && (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            {warning}
          </p>
        )}
        {(error || disconnect.isError) && (
          <p className="mt-2 text-xs text-destructive">
            {error ?? errorText(disconnect.error)}
          </p>
        )}
      </CardContent>

      <ConnectNumberDialog
        open={buyOpen}
        onOpenChange={setBuyOpen}
        companyId={companyId}
        companyCountry={companyCountry}
        onAttached={runGenerate}
      />

      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{failed ? 'Remove this WhatsApp setup?' : 'Disconnect WhatsApp?'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            New WhatsApp messages to <strong>{account?.displayPhoneNumber}</strong> will stop
            arriving here, and replies can no longer be sent. The conversation history stays
            in the Communications tab, and you can reconnect at any time.
            {account?.origin === 'GENERATED' &&
              ' The number is also removed from WhatsApp, but it stays this company’s support number for calls and texts.'}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDisconnectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={disconnect.isPending}
              onClick={() =>
                disconnect.mutate(undefined, {
                  onSuccess: () => setDisconnectOpen(false),
                })
              }
            >
              {disconnect.isPending ? 'Removing…' : failed ? 'Remove' : 'Disconnect'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
