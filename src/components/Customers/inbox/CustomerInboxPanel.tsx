import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Mail, RefreshCw, Unplug } from 'lucide-react';
import { customerInboxAuthUrl } from '@/api/customerInbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/context/AuthContext';
import { useCustomerInbox, useDisconnectCustomerInbox, useSyncCustomerInbox } from '@/hooks/useCustomerInbox';
import { cn } from '@/lib/utils';
import { fmtAgo, fmtDateTime } from '../customer-format';

const STATUS: Record<string, { label: string; tone: string }> = {
  ANSWERED: { label: 'Answered', tone: 'bg-emerald-50 text-emerald-700' },
  FILED: { label: 'Filed', tone: 'bg-sky-50 text-sky-700' },
  UNKNOWN_SENDER: { label: 'No account', tone: 'bg-amber-50 text-amber-700' },
  SKIPPED: { label: 'Skipped', tone: 'bg-slate-100 text-slate-600' },
  FAILED: { label: 'Failed', tone: 'bg-red-50 text-red-700' },
};

/**
 * ADMIN: the customer inbox (step12) — ONE firm mailbox customers email statements, receipts
 * and questions to. Connect it with Google or Outlook; every minute new mail is read, the
 * sender matched to a customer by their account email, files go into their books and the
 * AI answers in the thread. A sender with no account is told to sign up on cygfinance.com.
 */
export function CustomerInboxPanel() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inbox = useCustomerInbox(connecting);
  // Look fast only until the popup's work shows up.
  const waiting = connecting && !inbox.data?.connected;
  const sync = useSyncCustomerInbox();
  const disconnect = useDisconnectCustomerInbox();
  const data = inbox.data;

  // Give up the fast refresh after 10 minutes (the popup was abandoned).
  useEffect(() => {
    if (!connecting) return;
    const t = setTimeout(() => setConnecting(false), 10 * 60_000);
    return () => clearTimeout(t);
  }, [connecting]);

  async function connect(provider: 'google' | 'microsoft', kind: 'work' | 'personal' = 'personal') {
    setError(null);
    // Open the window inside the click, or popup blockers eat it.
    const popup = window.open('', 'customer-inbox-connect', 'width=520,height=680');
    try {
      const url = await customerInboxAuthUrl(token!, provider, kind);
      if (popup) popup.location.href = url;
      else window.location.href = url;
      setConnecting(true);
    } catch (e) {
      popup?.close();
      setError(e instanceof Error ? e.message : 'Could not start the connection');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="border-indigo-100">
        <CardContent className="flex items-start gap-4 py-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <Mail size={18} />
          </span>
          <div className="text-sm">
            <p className="font-medium">How it works</p>
            <p className="text-muted-foreground">
              Customers email this address from the email on their cygfinance.com account. Attachments (statements,
              receipts, cheques, voice notes) go straight into their books, and the AI assistant answers their
              questions in the same thread. Anyone without an account is told to create one. Auto-replies and
              newsletters are ignored.
            </p>
          </div>
        </CardContent>
      </Card>

      {inbox.isLoading ? null : data?.connected ? (
        <Card>
          <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-base font-semibold">{data.emailAddress}</p>
                <Badge variant="secondary">{data.provider === 'GOOGLE' ? 'Google' : 'Outlook'}</Badge>
                {!data.replying && (
                  <Badge className="bg-amber-50 text-amber-700" title="INTAKE_AI_REPLY is off on the server">
                    Filing only — AI replies off
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Connected {fmtDateTime(data.connectedAt)} · last checked {fmtAgo(data.lastSyncAt)}
              </p>
              {data.lastError && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-red-700">
                  <AlertTriangle size={14} className="mt-px shrink-0" />
                  <span>
                    The last check failed: {data.lastError}. Reconnect if it keeps failing.
                  </span>
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={sync.isPending} onClick={() => sync.mutate()}>
                <RefreshCw size={14} className={cn('mr-1.5', sync.isPending && 'animate-spin')} /> Check now
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={disconnect.isPending}
                onClick={() => disconnect.mutate()}
                className="text-red-700 hover:text-red-800"
              >
                <Unplug size={14} className="mr-1.5" /> Disconnect
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3 py-6 text-center sm:items-center">
            <p className="font-medium">No inbox connected</p>
            <p className="text-sm text-muted-foreground">
              Sign in to the mailbox customers should write to (e.g. receipts@cygfinance.com).
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => connect('google')} disabled={waiting}>
                Connect Google
              </Button>
              <Button variant="outline" onClick={() => connect('microsoft')} disabled={waiting}>
                Connect Outlook
              </Button>
            </div>
            {waiting && <p className="text-xs text-muted-foreground">Finish signing in in the window that opened…</p>}
          </CardContent>
        </Card>
      )}
      {(error || inbox.error || disconnect.error) && (
        <p className="text-sm text-destructive">{error ?? inbox.error?.message ?? disconnect.error?.message}</p>
      )}

      {data?.connected && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">From</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4 text-right">Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.messages.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      Nothing yet — emails show up here within a minute of arriving.
                    </TableCell>
                  </TableRow>
                )}
                {data.messages.map(m => {
                  const s = STATUS[m.status] ?? { label: m.status, tone: 'bg-slate-100 text-slate-600' };
                  return (
                    <TableRow
                      key={m.id}
                      className={cn(m.customerId && 'cursor-pointer')}
                      onClick={() => m.customerId && navigate(`/admin/customers/${m.customerId}`)}
                    >
                      <TableCell className="pl-4">
                        <p className="font-medium">{m.customerName ?? m.fromEmail}</p>
                        {m.customerName && <p className="text-xs text-muted-foreground">{m.fromEmail}</p>}
                      </TableCell>
                      <TableCell className="max-w-72 truncate text-sm">{m.subject ?? '—'}</TableCell>
                      <TableCell>
                        <Badge className={s.tone} title={m.error ?? undefined}>
                          {s.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-4 text-right text-xs text-muted-foreground">{fmtDateTime(m.receivedAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
