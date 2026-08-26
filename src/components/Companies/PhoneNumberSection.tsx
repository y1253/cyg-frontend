import { useState } from 'react';
import { Phone, PhoneOff, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatE164 } from '@/lib/phone';
import type { AvailableNumber } from '@/api/phone';
import {
  useAttachNumber,
  usePhoneNumber,
  useReleaseNumber,
  useSearchAvailableNumbers,
} from '@/hooks/usePhoneNumber';

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
              <div className="flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="bg-teal-50 text-teal-700 border-teal-200 text-[10px] px-1.5 py-0"
                >
                  Voice + SMS
                </Badge>
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

const COUNTRIES = [
  { value: 'CANADA', label: 'Canada' },
  { value: 'USA', label: 'United States' },
];

/** Search-and-pick, then buy. Two-step so the purchase is never a single click. */
function ConnectNumberDialog({
  open,
  onOpenChange,
  companyId,
  companyCountry,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: number;
  companyCountry: string | null;
}) {
  const [country, setCountry] = useState(
    companyCountry === 'USA' ? 'USA' : 'CANADA',
  );
  const [areaCode, setAreaCode] = useState('');
  const [selected, setSelected] = useState<AvailableNumber | null>(null);
  const [confirming, setConfirming] = useState(false);

  const search = useSearchAvailableNumbers();
  const attach = useAttachNumber(companyId);
  const results = search.data ?? [];

  const reset = () => {
    setSelected(null);
    setConfirming(false);
    search.reset();
    attach.reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect a support number</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Country</Label>
            <div className="flex gap-2">
              {COUNTRIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => {
                    setCountry(c.value);
                    setSelected(null);
                    search.reset();
                  }}
                  className={[
                    'flex-1 rounded-md border px-3 py-2 text-sm transition-colors',
                    country === c.value
                      ? 'border-teal-500 bg-teal-50 font-medium text-teal-800'
                      : 'border-input hover:bg-muted/50',
                  ].join(' ')}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label className="text-xs">Area code (optional)</Label>
              <Input
                className="h-9 text-sm"
                inputMode="numeric"
                maxLength={3}
                placeholder="438"
                value={areaCode}
                onChange={(e) =>
                  setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))
                }
              />
            </div>
            <Button
              variant="outline"
              disabled={search.isPending}
              onClick={() => {
                setSelected(null);
                search.mutate({ country, areaCode: areaCode || undefined });
              }}
            >
              <Search size={14} className="mr-1.5" />
              {search.isPending ? 'Searching…' : 'Search'}
            </Button>
          </div>

          {search.isError && (
            <p className="text-xs text-destructive">{errorText(search.error)}</p>
          )}

          {search.isSuccess && results.length === 0 && (
            <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              No numbers available that support both calls and texts
              {areaCode ? ` in area code ${areaCode}` : ''}.
              {country === 'USA' && (
                <>
                  {' '}
                  US numbers stay voice-only until your A2P 10DLC registration
                  completes, so none qualify yet. Canadian numbers are unaffected.
                </>
              )}
            </p>
          )}

          {results.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-md border">
              {results.map((n) => (
                <label
                  key={n.phoneNumber}
                  className={[
                    'flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 last:border-b-0 transition-colors',
                    selected?.phoneNumber === n.phoneNumber
                      ? 'bg-teal-50/70'
                      : 'hover:bg-muted/40',
                  ].join(' ')}
                >
                  {/* Plain radio: there is no shadcn radio-group in components/ui. */}
                  <input
                    type="radio"
                    name="available-number"
                    className="accent-teal-600"
                    checked={selected?.phoneNumber === n.phoneNumber}
                    onChange={() => setSelected(n)}
                  />
                  <span className="flex-1 text-sm font-medium">
                    {formatE164(n.phoneNumber)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[n.locality, n.rateCenter, n.region]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </label>
              ))}
            </div>
          )}

          {attach.isError && (
            <p className="text-xs text-destructive">{errorText(attach.error)}</p>
          )}

          {confirming && selected ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-900">
                Buy <strong>{formatE164(selected.phoneNumber)}</strong>? This
                purchases the number immediately and starts a recurring monthly
                charge on your SignalWire account.
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirming(false)}
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  disabled={attach.isPending}
                  onClick={() =>
                    attach.mutate(
                      {
                        phoneNumber: selected.phoneNumber,
                        region: selected.region,
                      },
                      {
                        onSuccess: () => {
                          reset();
                          onOpenChange(false);
                        },
                      },
                    )
                  }
                >
                  {attach.isPending ? 'Buying…' : 'Buy and connect'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={!selected} onClick={() => setConfirming(true)}>
                Connect
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
