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
import { useAuth } from '@/context/AuthContext';
import { isSuperAdmin } from '@/lib/roles';
import { ReleaseLockedError } from '@/api/phone';
import { ConnectNumberDialog } from './ConnectNumberDialog';

/** Mirrors the server's `SMS_VERIFY_GRACE_MS`: past it, NULL just means "not checked". */
const SMS_CHECK_WINDOW_MS = 30 * 60_000;

/** Is a NULL `smsCapable` still "being checked", rather than simply never checked? */
function smsStillChecking(number: {
  smsCapable?: boolean | null;
  createdAt: string;
}): boolean {
  return (
    number.smsCapable == null &&
    Date.now() - new Date(number.createdAt).getTime() < SMS_CHECK_WINDOW_MS
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Error';
}

/**
 * The A2P 10DLC campaign line under a US number, or null when there is nothing to say
 * (a Canadian number, or an older server that does not report the state).
 *
 * The state is the provider's RAW order state — its vocabulary beyond `pending` is
 * undocumented — so anything unrecognised is shown verbatim rather than guessed at.
 */
function campaignLine(
  country: string | null | undefined,
  state: string | null | undefined,
): { text: string; tone: 'muted' | 'ok' | 'error' } | null {
  if (country !== 'US') return null;
  const s = (state ?? '').toLowerCase();
  if (s === '') return { text: '10DLC: queued for assignment', tone: 'muted' };
  if (s === 'failed') {
    return { text: '10DLC assignment failed — retrying automatically', tone: 'error' };
  }
  if (['pending', 'processing', 'in_progress', 'submitted'].includes(s)) {
    return { text: '10DLC: assignment pending — texting starts once approved', tone: 'muted' };
  }
  if (['assigned', 'completed', 'complete', 'success', 'processed'].includes(s)) {
    return { text: '10DLC: assigned — texting enabled', tone: 'ok' };
  }
  return { text: `10DLC: ${state}`, tone: 'muted' };
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
  const { user } = useAuth();
  const admin = isSuperAdmin(user);
  const locked =
    release.error instanceof ReleaseLockedError ? release.error : null;

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
              {/* ⚠️ No positive "Voice + SMS" badge, deliberately — it used to be hardcoded
                  on every number, a claim with nothing behind it. What IS shown is the
                  NEGATIVE, once the server has re-read the number with GET after purchase
                  (`smsCapable`): four numbers bought 2026-09-15 arrived voice-only although
                  the search said otherwise, and every text silently failed. Null (not
                  checked yet) shows nothing. */}
              {/* Null on a just-bought number means "still checking": SignalWire reports
                  sms:false for a while after a purchase (2026-10-07), so the server stores
                  NULL until the 10-minute sweep settles it. Saying nothing here is what
                  let a half-provisioned number look finished. */}
              {smsStillChecking(number) && (
                <span className="text-xs text-muted-foreground">
                  Checking text messaging… this can take a few minutes after connecting.
                </span>
              )}
              {number.smsCapable === false && (
                <span className="text-xs text-destructive">
                  Calls only — this number cannot send or receive texts. Disconnect it
                  and connect a new number. SignalWire won't release a number for 14 days
                  after purchase, so disconnecting a new one does not stop its charge.
                </span>
              )}
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
              {(() => {
                const line = campaignLine(number.country, number.campaignState);
                if (!line) return null;
                return (
                  <span
                    title={number.campaignError ?? undefined}
                    className={[
                      'text-xs',
                      line.tone === 'error'
                        ? 'text-destructive'
                        : line.tone === 'ok'
                          ? 'text-teal-700'
                          : 'text-muted-foreground',
                    ].join(' ')}
                  >
                    {line.text}
                  </span>
                );
              })()}
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                release.reset();
                setDisconnectOpen(true);
              }}
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

        {release.isError && !locked && (
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
          {/* SignalWire locks a number for 14 days after purchase (code 22121), which
              used to make Disconnect a dead end: the company stayed stuck on the number
              and could not connect another. An ADMIN may detach it anyway; the server
              releases it automatically when the lock lifts. */}
          {locked && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              SignalWire can't release this number until{' '}
              <strong>{new Date(locked.releasableAt).toLocaleString()}</strong> — it was
              bought less than 14 days ago.{' '}
              {admin
                ? 'You can disconnect it from this company now; it stays on the account (and keeps billing) until then, and is released automatically.'
                : 'Ask an admin to disconnect it anyway.'}
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDisconnectOpen(false)}>
              Cancel
            </Button>
            {locked ? (
              admin && (
                <Button
                  variant="destructive"
                  disabled={release.isPending}
                  onClick={() =>
                    release.mutate(true, {
                      onSuccess: () => setDisconnectOpen(false),
                    })
                  }
                >
                  {release.isPending ? 'Disconnecting…' : 'Disconnect anyway'}
                </Button>
              )
            ) : (
              <Button
                variant="destructive"
                disabled={release.isPending}
                onClick={() =>
                  release.mutate(false, {
                    onSuccess: () => setDisconnectOpen(false),
                  })
                }
              >
                {release.isPending ? 'Disconnecting…' : 'Release number'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
