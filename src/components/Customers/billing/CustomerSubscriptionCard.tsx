import { useState } from 'react';
import { Check, CreditCard, Loader2, RotateCcw } from 'lucide-react';
import { money, type TrialUsage } from '@/api/customerBilling';
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
import { useBillingTransactions } from '@/hooks/useBillingTransactions';
import { useCustomerPayments } from '@/hooks/useCustomerPayments';
import { useCustomerSubscription } from '@/hooks/useCustomerSubscription';
import { useRestartCustomerTrial } from '@/hooks/useRestartCustomerTrial';
import { useSetCustomerTransactionLimit } from '@/hooks/useSetCustomerTransactionLimit';
import { useSubscriptionPlan } from '@/hooks/useSubscriptionPlan';
import { fmtAgo, fmtDateTime } from '../customer-format';
import { num, periodText, priceText } from './billing-format';
import { PaymentsTable } from './PaymentsTable';
import { AccessBadge, TrialUsageList, UsageChip } from './SubscriptionBits';
import { TransactionsTable } from './TransactionsTable';

/**
 * Customer detail page: their subscription — status, renewal / free months, a failing card,
 * this month's transactions against their limit (editable), the free trial (restartable),
 * every subscription transaction, and any legacy per-Generate payments.
 */
export function CustomerSubscriptionCard({ customerId }: { customerId: number }) {
  const sub = useCustomerSubscription(customerId);
  const plan = useSubscriptionPlan();
  const txs = useBillingTransactions({ customerId });
  const legacy = useCustomerPayments(customerId);
  const r = sub.data;
  const price = r ? priceText(r) : null;
  const legacyPayments = legacy.data?.payments ?? [];

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b py-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <CreditCard size={14} className="text-muted-foreground" />
            Subscription
            {r && <AccessBadge row={r} />}
          </CardTitle>
          <p className="text-muted-foreground text-xs">The monthly plan on cygfinance.com — what this customer can use right now.</p>
        </div>
        {price && (
          <div className="text-right">
            <p className="text-lg leading-tight font-semibold tabular-nums">{price}</p>
            <p className="text-muted-foreground text-xs">Stripe: {r?.status.toLowerCase().replace(/_/g, ' ')}</p>
          </div>
        )}
      </CardHeader>

      {sub.isLoading ? (
        <div className="p-4">
          <div className="bg-muted h-24 animate-pulse rounded-md" />
        </div>
      ) : sub.isError || !r ? (
        <p className="text-destructive p-6 text-center text-sm">Could not load the subscription.</p>
      ) : (
        <CardContent className="grid gap-5 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <Fact label="Renewal / free until" value={periodText(r)} />
            <Fact label="Ever paid" value={r.everPaid ? 'Yes' : 'No'} />
            <Fact label="Trial started" value={r.trialStartedAt ? fmtDateTime(r.trialStartedAt) : 'Not yet'} />
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">Stripe customer</p>
              {r.customer.stripeCustomerId ? (
                <a
                  href={`https://dashboard.stripe.com/customers/${r.customer.stripeCustomerId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate font-mono text-sm text-blue-600 hover:underline"
                >
                  {r.customer.stripeCustomerId}
                </a>
              ) : (
                <p className="text-sm">Not made yet</p>
              )}
            </div>
          </div>

          {r.failedSince && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <p className="font-medium">Payment failing since {fmtDateTime(r.failedSince)} ({fmtAgo(r.failedSince)})</p>
              {r.lastFailureMessage && <p>{r.lastFailureMessage}</p>}
            </div>
          )}

          <LimitEditor
            customerId={customerId}
            used={r.month.used}
            limit={r.month.limit}
            own={r.transactionLimit}
            planLimit={plan.data?.monthlyTransactionLimit ?? null}
          />

          {r.trial && <TrialBlock customerId={customerId} trial={r.trial} />}

          <div className="grid gap-2">
            <p className="text-sm font-medium">
              Transactions
              {txs.data && (
                <span className="text-muted-foreground font-normal">
                  {' '}
                  · {txs.data.transactions.length} · {money(txs.data.totals.succeededCents30d)} paid in the last 30 days
                </span>
              )}
            </p>
            <div className="overflow-hidden rounded-lg border">
              {txs.isLoading ? (
                <div className="bg-muted m-3 h-12 animate-pulse rounded-md" />
              ) : txs.isError ? (
                <p className="text-destructive p-4 text-center text-sm">Could not load transactions.</p>
              ) : (
                <TransactionsTable
                  transactions={txs.data?.transactions ?? []}
                  hideCustomer
                  emptyText="No subscription payments yet."
                />
              )}
            </div>
          </div>

          {legacyPayments.length > 0 && (
            <div className="grid gap-2">
              <p className="text-sm font-medium">
                Old pay-per-Generate payments
                <span className="text-muted-foreground font-normal">
                  {' '}
                  · {legacyPayments.length} · {money(legacy.data?.totalCents ?? 0, legacyPayments[0]?.currency)} total
                </span>
              </p>
              <div className="overflow-hidden rounded-lg border">
                <PaymentsTable payments={legacyPayments} hideCustomer />
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

/** This month's usage and the customer's own limit (blank = the plan's). */
function LimitEditor({
  customerId,
  used,
  limit,
  own,
  planLimit,
}: {
  customerId: number;
  used: number;
  limit: number;
  own: number | null;
  planLimit: number | null;
}) {
  const save = useSetCustomerTransactionLimit(customerId);
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const text = draft ?? (own !== null ? String(own) : '');
  const t = text.trim().replace(/,/g, '');
  const value = t === '' ? null : Number(t);
  const invalid = t !== '' && (!/^\d+$/.test(t) || value! < 1 || value! > 10_000_000);
  const dirty = !invalid && value !== own;

  const submit = (next: number | null) => {
    setSaved(false);
    save.mutate(next, {
      onSuccess: () => {
        setDraft(null);
        setSaved(true);
      },
    });
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">This month</span>
        <UsageChip used={used} limit={limit} />
        <span className="text-muted-foreground text-xs">new transactions (Toronto month)</span>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={e => {
          e.preventDefault();
          if (dirty) submit(value);
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="customer-limit">Monthly transaction limit</Label>
          <Input
            id="customer-limit"
            inputMode="numeric"
            value={text}
            onChange={e => {
              setDraft(e.target.value);
              setSaved(false);
            }}
            placeholder={planLimit !== null ? `Plan default (${num(planLimit)})` : 'Plan default'}
            className="w-56 tabular-nums"
          />
        </div>
        <Button type="submit" disabled={!dirty || save.isPending} className="gap-2">
          {save.isPending && <Loader2 size={14} className="animate-spin" />}
          Save
        </Button>
        {own !== null && (
          <Button type="button" variant="outline" disabled={save.isPending} onClick={() => submit(null)}>
            Use plan default
          </Button>
        )}
        {saved && !dirty && (
          <span className="flex items-center gap-1 pb-2 text-sm text-emerald-700">
            <Check size={14} /> Saved
          </span>
        )}
      </form>
      {invalid && <p className="text-destructive text-xs">A whole number from 1 to 10,000,000 — or blank for the plan default.</p>}
      {save.error && <p className="text-destructive text-xs">{save.error.message}</p>}
    </div>
  );
}

function TrialBlock({ customerId, trial }: { customerId: number; trial: TrialUsage }) {
  const restart = useRestartCustomerTrial(customerId);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="grid gap-3 rounded-lg border border-violet-100 bg-violet-50/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Free trial
          {trial.usedUp.length > 0 && <span className="ml-2 text-xs font-medium text-red-700">used up</span>}
        </p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setConfirm(true)}>
          <RotateCcw size={13} /> Restart trial
        </Button>
      </div>
      <TrialUsageList trial={trial} bars />
      {restart.error && <p className="text-destructive text-xs">{restart.error.message}</p>}

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restart the free trial?</DialogTitle>
            <DialogDescription>
              The customer gets the whole trial again — usage counts from now, and they are told again when it runs out.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              disabled={restart.isPending}
              className="gap-2"
              onClick={() => restart.mutate(undefined, { onSuccess: () => setConfirm(false) })}
            >
              {restart.isPending && <Loader2 size={14} className="animate-spin" />}
              Restart trial
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
