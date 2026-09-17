import { useState } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatE164 } from '@/lib/phone';
import type { AvailableNumber } from '@/api/phone';
import { useAttachNumber, useSearchAvailableNumbers } from '@/hooks/usePhoneNumber';
import { emptyResultMessage } from './connect-number-message';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Error';
}

const COUNTRIES = [
  { value: 'CANADA', label: 'Canada' },
  { value: 'USA', label: 'United States' },
];

/**
 * Search-and-pick, then buy. Two-step so the purchase is never a single click.
 *
 * Its own file so the WhatsApp card can open the SAME popup when a company has no support
 * number yet — a second copy of a dialog that spends money would drift.
 */
export function ConnectNumberDialog({
  open,
  onOpenChange,
  companyId,
  companyCountry,
  onAttached,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: number;
  companyCountry: string | null;
  /** Runs after a number was bought and the dialog closed. */
  onAttached?: () => void;
}) {
  const [country, setCountry] = useState(companyCountry === 'USA' ? 'USA' : 'CANADA');
  const [areaCode, setAreaCode] = useState('');
  const [selected, setSelected] = useState<AvailableNumber | null>(null);
  const [confirming, setConfirming] = useState(false);

  const search = useSearchAvailableNumbers();
  const attach = useAttachNumber(companyId);
  const results = search.data?.numbers ?? [];
  /**
   * The message comes from what was SEARCHED, not from the inputs as they stand now.
   * Typing a new area code after a search must not relabel the previous result — it would
   * describe a search that never ran.
   */
  const emptyMessage = emptyResultMessage({
    outcome: search.isError
      ? 'error'
      : search.isPending
        ? 'pending'
        : search.isSuccess
          ? 'success'
          : 'idle',
    totalFound: search.data?.totalFound ?? 0,
    eligibleCount: results.length,
    country: search.data?.searched.country === 'US' ? 'USA' : 'CANADA',
    areaCode: search.data?.searched.areaCode ?? '',
  });

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
                onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
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

          {search.isError && <p className="text-xs text-destructive">{errorText(search.error)}</p>}

          {/* One sentence per situation, decided by `emptyResultMessage`. The A2P 10DLC
              explanation is reachable ONLY when numbers were genuinely found and rejected
              on a US search — never for an empty result, and never for a failed request,
              both of which this used to blame on it. */}
          {emptyMessage && (
            <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              {emptyMessage}
            </p>
          )}

          {results.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-md border">
              {results.map((n) => (
                <label
                  key={n.phoneNumber}
                  className={[
                    'flex cursor-pointer items-center gap-3 border-b px-3 py-2.5 last:border-b-0 transition-colors',
                    selected?.phoneNumber === n.phoneNumber ? 'bg-teal-50/70' : 'hover:bg-muted/40',
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
                  <span className="flex-1 text-sm font-medium">{formatE164(n.phoneNumber)}</span>
                  {/*
                    The server only ever returns numbers that do BOTH, so this badge is
                    always shown — that is the point. The capability bar was invisible
                    here, which made a later purchase failure read as "it offered me a
                    number that cannot text". Rendered from n.voice/n.sms rather than
                    hardcoded, so if the filter ever regresses the badge goes missing
                    instead of lying.
                  */}
                  {n.voice && n.sms && (
                    <Badge
                      variant="outline"
                      className="bg-teal-50 text-teal-700 border-teal-200 text-[10px] px-1.5 py-0"
                    >
                      Voice + SMS
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {[n.locality, n.rateCenter, n.region].filter(Boolean).join(' · ')}
                  </span>
                </label>
              ))}
            </div>
          )}

          {attach.isError && <p className="text-xs text-destructive">{errorText(attach.error)}</p>}

          {confirming && selected ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-900">
                Buy <strong>{formatE164(selected.phoneNumber)}</strong>? This purchases the
                number immediately and starts a recurring monthly charge on your SignalWire
                account.
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                  Back
                </Button>
                <Button
                  size="sm"
                  disabled={attach.isPending}
                  onClick={() =>
                    attach.mutate(
                      { phoneNumber: selected.phoneNumber, region: selected.region },
                      {
                        onSuccess: () => {
                          reset();
                          onOpenChange(false);
                          onAttached?.();
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
