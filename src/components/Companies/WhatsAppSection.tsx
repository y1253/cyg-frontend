import { useEffect, useState } from 'react';
import { MessageCircle, Unplug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useWhatsAppAccount } from '@/hooks/useWhatsAppAccount';
import { useWhatsAppConfig } from '@/hooks/useWhatsAppConfig';
import { useConnectWhatsApp } from '@/hooks/useConnectWhatsApp';
import { useConnectFirmWhatsApp } from '@/hooks/useConnectFirmWhatsApp';
import { useDisconnectWhatsApp } from '@/hooks/useDisconnectWhatsApp';
import { launchWhatsAppSignup, loadFacebookSdk, SignupCancelled } from '@/lib/facebookSdk';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Error';
}

/**
 * Connect a company's WhatsApp Business number.
 *
 * "Connect WhatsApp" runs Meta's Embedded Signup — the OAuth popup — and hands the code to
 * the server, which exchanges it for the business token and stores it encrypted. Written
 * to be droppable onto the public registration page later; only the POST's auth differs.
 *
 * "Use firm number" attaches the number configured on the server (WHATSAPP_TOKEN +
 * WHATSAPP_PHONE_NUMBER_ID) with no popup — what works before Embedded Signup is set up.
 */
export function WhatsAppSection({
  companyId,
  canUseFirmNumber,
}: {
  companyId: number;
  /** Admin only: it hands the company the firm's shared token. */
  canUseFirmNumber: boolean;
}) {
  const { data: account, isLoading } = useWhatsAppAccount(companyId);
  const { data: config } = useWhatsAppConfig();
  const connect = useConnectWhatsApp(companyId);
  const connectFirm = useConnectFirmWhatsApp(companyId);
  const disconnect = useDisconnectWhatsApp(companyId);

  const [signingUp, setSigningUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const signupReady = !!config?.appId && !!config?.configId;

  // Preload, so FB.login can run synchronously inside the click (popup blockers).
  useEffect(() => {
    if (!signupReady || account) return;
    void loadFacebookSdk(config!.appId!, config!.graphVersion).catch(() => undefined);
  }, [signupReady, account, config]);

  const handleConnect = () => {
    if (!config?.appId || !config.configId) return;
    setError(null);
    setWarning(null);
    setSigningUp(true);
    launchWhatsAppSignup({
      appId: config.appId,
      configId: config.configId,
      graphVersion: config.graphVersion,
    })
      .then((result) => connect.mutateAsync(result))
      .then((res) => setWarning(res.warning))
      .catch((err: unknown) => {
        if (!(err instanceof SignupCancelled)) setError(errorText(err));
      })
      .finally(() => setSigningUp(false));
  };

  const handleFirmNumber = () => {
    setError(null);
    setWarning(null);
    connectFirm.mutate(undefined, {
      onSuccess: (res) => setWarning(res.warning),
      onError: (err) => setError(errorText(err)),
    });
  };

  const busy = signingUp || connect.isPending || connectFirm.isPending;

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
                {account.usesFirmToken && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                    Firm number
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
                  signupReady
                    ? undefined
                    : 'WHATSAPP_CONFIG_ID is not set on the server, so the Meta signup popup cannot open.'
                }
              >
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={busy || !signupReady}
                  onClick={handleConnect}
                >
                  <MessageCircle size={14} className="mr-1.5" />
                  {signingUp || connect.isPending ? 'Connecting…' : 'Connect WhatsApp'}
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

      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect WhatsApp?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            New WhatsApp messages to <strong>{account?.displayPhoneNumber}</strong> will stop
            arriving here, and replies can no longer be sent. The conversation history stays
            in the Communications tab, and you can reconnect at any time.
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
              {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
