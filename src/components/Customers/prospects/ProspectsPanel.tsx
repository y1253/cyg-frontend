import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, MessageSquareText, Phone } from 'lucide-react';
import type { Prospect } from '@/api/prospects';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useProspectMessages, useProspects } from '@/hooks/useProspects';
import { cn } from '@/lib/utils';
import { fmtAgo, fmtDateTime } from '../customer-format';

const CHANNEL_LABEL: Record<string, string> = { SMS: 'Text', WHATSAPP: 'WhatsApp', CALL: 'Call' };

/**
 * step12f: phones with NO account that texted, WhatsApped or called a receipt number and talked
 * to the AI salesperson (Phone tab → AI salesperson). Read only: the customer API writes the
 * rows; a prospect who replied YES links to the account they opened.
 */
export function ProspectsPanel() {
  const { data = [], isLoading, isError } = useProspects();
  const [open, setOpen] = useState<Prospect | null>(null);
  const signedUp = data.filter((p) => p.customer).length;

  return (
    <div className="flex flex-col gap-5">
      <Card className="border-indigo-100">
        <CardContent className="flex items-start gap-4 py-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <Megaphone size={20} />
          </span>
          <div className="text-sm">
            <p className="font-medium">How it works</p>
            <p className="text-muted-foreground">
              When someone without an account texts, WhatsApps or calls a receipt number, the AI salesperson answers in
              that conversation only — it never calls or texts them first. When they want to sign up, they are texted
              "Reply YES" and the account opens on their phone. Turn it on or off on the Phone tab.
            </p>
            {data.length > 0 && (
              <p className="mt-1 font-medium">
                {data.length} prospect{data.length === 1 ? '' : 's'} · {signedUp} signed up
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {isError && <p className="text-sm text-destructive">Could not load the prospects.</p>}
      <div className="overflow-hidden rounded-xl border bg-card">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : !data.length ? (
          <p className="px-6 py-14 text-center text-sm text-muted-foreground">
            Nobody without an account has talked to the AI salesperson yet.
          </p>
        ) : (
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Phone</TableHead>
                <TableHead>First via</TableHead>
                <TableHead className="hidden md:table-cell">Last message</TableHead>
                <TableHead className="text-right">Messages</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4">Last contact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.id} onClick={() => setOpen(p)} className="cursor-pointer">
                  <TableCell className="pl-4 font-medium tabular-nums">{p.phone}</TableCell>
                  <TableCell>{CHANNEL_LABEL[p.firstChannel] ?? p.firstChannel}</TableCell>
                  <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell">
                    {p.lastText ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.messageCount}</TableCell>
                  <TableCell>
                    <StatusBadge p={p} />
                  </TableCell>
                  <TableCell className="pr-4 text-sm whitespace-nowrap text-muted-foreground">
                    {fmtAgo(p.lastContactAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-xl">{open && <Transcript prospect={open} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ p }: { p: Prospect }) {
  if (p.customer) {
    return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">Signed up</Badge>;
  }
  if (p.signupOfferedAt) {
    return <Badge className="border-amber-200 bg-amber-50 text-amber-800" variant="outline">Offered</Badge>;
  }
  return <Badge variant="outline">Talking</Badge>;
}

function Transcript({ prospect: p }: { prospect: Prospect }) {
  const { data = [], isLoading, isError } = useProspectMessages(p.id);
  return (
    <>
      <DialogHeader>
        <DialogTitle className="tabular-nums">{p.phone}</DialogTitle>
        <DialogDescription>
          First contact {fmtDateTime(p.createdAt)} by {(CHANNEL_LABEL[p.firstChannel] ?? p.firstChannel).toLowerCase()}
          {p.customer && (
            <>
              {' · signed up as '}
              <Link to={`/admin/customers/${p.customer.id}`} className="font-medium text-foreground hover:underline">
                {p.customer.name.trim() || `customer #${p.customer.id}`}
              </Link>
            </>
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
        {isLoading && <div className="h-16 animate-pulse rounded-md bg-muted" />}
        {isError && <p className="text-sm text-destructive">Could not load the conversation.</p>}
        {!isLoading && !data.length && <p className="text-sm text-muted-foreground">No messages.</p>}
        {data.map((m) => {
          const ai = m.role === 'ASSISTANT';
          return (
            <div key={m.id} className={cn('flex flex-col', ai ? 'items-end' : 'items-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3 py-2 whitespace-pre-line',
                  ai ? 'bg-indigo-600 text-white' : 'bg-muted',
                )}
              >
                {m.text}
              </div>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                {m.channel === 'CALL' ? <Phone size={11} /> : <MessageSquareText size={11} />}
                {ai ? 'AI' : 'Them'} · {CHANNEL_LABEL[m.channel] ?? m.channel} · {fmtDateTime(m.createdAt)}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
