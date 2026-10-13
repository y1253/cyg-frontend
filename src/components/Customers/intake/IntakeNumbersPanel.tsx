import { useState } from 'react';
import { MessageSquareText, Phone, Plus, Unplug } from 'lucide-react';
import type { IntakeNumber } from '@/api/intakeNumbers';
import { ReleaseLockedError } from '@/api/phone';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConnectNumberDialog } from '@/components/Companies/ConnectNumberDialog';
import { useBuyIntakeNumber, useIntakeNumbers, useReleaseIntakeNumber } from '@/hooks/useIntakeNumbers';
import { formatE164 } from '@/lib/phone';
import { fmtDateTime } from '../customer-format';

/**
 * The numbers customers text receipts to. Each one is a SignalWire number bought here; a
 * text from the phone on a customer's account is filed into their bookkeeping like an
 * upload (picture, PDF, voice note or plain words). Every active number is listed on
 * cygfinance.com. Several numbers are fine — they all work the same.
 */
export function IntakeNumbersPanel() {
  const { data: numbers = [], isLoading, isError } = useIntakeNumbers();
  const buy = useBuyIntakeNumber();
  const [buying, setBuying] = useState(false);
  const active = numbers.filter((n) => !n.releasedAt);
  const released = numbers.filter((n) => n.releasedAt);

  return (
    <div className="flex flex-col gap-5">
      <Card className="border-indigo-100">
        <CardContent className="flex flex-wrap items-center gap-4 py-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <MessageSquareText size={20} />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">How it works</p>
            <p className="text-muted-foreground">
              Customers text a photo, PDF, voice note or a few words to any number below. We match the sender to the
              phone on their account and file it like an upload. Nothing is texted back.
            </p>
          </div>
          <Button onClick={() => setBuying(true)} className="gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700">
            <Plus size={15} /> Buy a number
          </Button>
        </CardContent>
      </Card>

      {isError && <p className="text-sm text-destructive">Could not load the numbers.</p>}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !active.length ? (
        <div className="rounded-xl border border-dashed border-indigo-200 bg-white/60 px-6 py-12 text-center">
          <p className="font-medium">No number connected</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Buy one and it appears on cygfinance.com for customers to text.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {active.map((n) => (
            <NumberCard key={n.id} n={n} />
          ))}
        </div>
      )}

      {released.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Disconnected</h3>
          <ul className="divide-y rounded-xl border bg-white/60 text-sm">
            {released.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-muted-foreground">
                <span className="font-medium tabular-nums">{formatE164(n.phoneNumber)}</span>
                {n.label && <span>{n.label}</span>}
                <span className="ml-auto text-xs">
                  {fmtDateTime(n.createdAt)} → {fmtDateTime(n.releasedAt!)}
                  {n.providerReleaseAfter && ' · released at SignalWire later'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConnectNumberDialog
        open={buying}
        onOpenChange={setBuying}
        companyId={0}
        companyCountry="CANADA"
        title="Buy a number for receipts"
        purchase={buy}
      />
    </div>
  );
}

function NumberCard({ n }: { n: IntakeNumber }) {
  const release = useReleaseIntakeNumber();
  const [confirm, setConfirm] = useState(false);
  const locked = release.error instanceof ReleaseLockedError ? release.error : null;

  return (
    <Card className="border-indigo-100">
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Phone size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold tabular-nums">{formatE164(n.phoneNumber)}</p>
            <p className="text-xs text-muted-foreground">
              {[n.label, n.region, n.country].filter(Boolean).join(' · ') || 'Receipt number'} · connected{' '}
              {fmtDateTime(n.createdAt)}
            </p>
          </div>
          <Badge variant="outline" className="border-emerald-300 text-emerald-700">
            Live
          </Badge>
        </div>

        {locked ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p>{locked.message}</p>
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => release.reset()}>
                Keep it
              </Button>
              <Button
                size="sm"
                disabled={release.isPending}
                onClick={() => release.mutate({ id: n.id, deferIfLocked: true })}
              >
                Disconnect anyway
              </Button>
            </div>
          </div>
        ) : confirm ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
            <p>Disconnect this number? Customers texting it will no longer reach us, and it is released at SignalWire.</p>
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={release.isPending}
                onClick={() => release.mutate({ id: n.id }, { onSettled: () => setConfirm(false) })}
              >
                {release.isPending ? 'Disconnecting…' : 'Disconnect'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirm(true)}
            >
              <Unplug size={14} /> Disconnect
            </Button>
          </div>
        )}
        {release.isError && !locked && (
          <p className="text-xs text-destructive">
            {release.error instanceof Error ? release.error.message : 'Failed to disconnect'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
