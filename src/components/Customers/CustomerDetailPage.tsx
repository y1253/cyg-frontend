import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Landmark, Loader2, Mail, Phone, ExternalLink, ShieldCheck } from 'lucide-react';
import { openStatementPdf, type CustomerStatement } from '@/api/customers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatBytes } from '@/components/Companies/message-utils';
import { useAuth } from '@/context/AuthContext';
import { useCustomer } from '@/hooks/useCustomer';
import { cn } from '@/lib/utils';
import { CustomerAvatar } from './CustomerAvatar';
import { CustomerSiteShell } from './CustomerSiteShell';
import { StatementRowsDialog } from './StatementRowsDialog';
import { CustomerPaymentsCard } from './billing/CustomerPaymentsCard';
import { CustomerAiCard } from './ai/CustomerAiCard';
import { AUTH_LABEL, STATUS_STYLE, fmtAgo, fmtDateTime, fmtPeriod, pct } from './customer-format';

/** The customer's preferred contact method, as they chose it on cygfinance.com (step12). */
const CONTACT_LABEL = { EMAIL: 'Email', WHATSAPP: 'WhatsApp', SMS: 'Text message' } as const;

/** ADMIN: one public-site customer — profile, sales-tax setup and every statement they uploaded. */
export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const customerId = Number(id);
  const navigate = useNavigate();
  const { token } = useAuth();
  const { data: c, isLoading, isError } = useCustomer(customerId);
  const [open, setOpen] = useState<CustomerStatement | null>(null);
  const [pdfBusy, setPdfBusy] = useState<number | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  if (isLoading) return <div className="text-muted-foreground p-8 text-sm">Loading…</div>;
  if (isError || !c) return <div className="text-destructive p-8 text-sm">Customer not found.</div>;

  const live = c.statements.filter(s => !s.deletedAt);
  const rows = live.filter(s => s.status === 'DONE').reduce((n, s) => n + s.transactionCount, 0);

  const openPdf = async (s: CustomerStatement) => {
    setPdfError(null);
    setPdfBusy(s.id);
    try {
      await openStatementPdf(token!, c.id, s.id);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Could not open the file');
    } finally {
      setPdfBusy(null);
    }
  };

  return (
    <CustomerSiteShell active={null}>
    <div className="flex flex-col gap-5">
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground -ml-2 gap-1.5 self-start"
        onClick={() => navigate('/admin/customers')}
      >
        <ArrowLeft size={15} />
        Back to Customers
      </Button>

      {/* Header */}
      <div className="flex flex-wrap items-start gap-4">
        <CustomerAvatar name={c.name} url={c.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{c.name}</h1>
            <Badge variant="outline" className={c.authType === 'GOOGLE' ? 'border-sky-300 text-sky-700' : ''}>
              {AUTH_LABEL[c.authType]}
            </Badge>
            {c.deletedAt ? (
              <Badge variant="outline" className="border-red-300 text-red-700">Deleted {fmtDateTime(c.deletedAt)}</Badge>
            ) : (
              <Badge variant="outline" className="border-emerald-300 text-emerald-700">Active</Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">{c.email}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Signed up {fmtDateTime(c.createdAt)} · {fmtAgo(c.createdAt)}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Account */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck size={14} className="text-muted-foreground" />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Email" icon={<Mail size={11} />} value={c.email} />
            <Field label="Phone" icon={<Phone size={11} />} value={c.phone || '—'} />
            <Field
              label="Prefers"
              value={c.preferredContact ? CONTACT_LABEL[c.preferredContact] : 'No preference'}
            />
            <Field label="Signs in with" value={AUTH_LABEL[c.authType]} />
            <Field label="Signed up" value={fmtDateTime(c.createdAt)} />
            <Field label="Last login" value={c.lastLoginAt ? fmtDateTime(c.lastLoginAt) : 'Never'} />
            <Field label="Bookkeeping" value={`${live.length} statement${live.length === 1 ? '' : 's'} · ${rows.toLocaleString()} rows`} />
          </CardContent>
        </Card>

        {/* Sales tax */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Landmark size={14} className="text-muted-foreground" />
              Sales tax
              <Badge
                variant="outline"
                className={cn('ml-auto', c.salesTaxEnabled ? 'border-emerald-300 text-emerald-700' : 'text-muted-foreground')}
              >
                {c.salesTaxEnabled ? 'On' : 'Off'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!c.taxAgencies.length ? (
              <p className="text-muted-foreground text-sm">No tax agencies.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {c.taxAgencies.map(a => (
                  <li key={a.id} className={cn('rounded-lg border px-3 py-2', !a.active && 'opacity-55')}>
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{a.name}</span>
                      {!a.active && <Badge variant="outline" className="text-[10px]">Off</Badge>}
                    </div>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {a.rates.map(r => `${r.kind === 'SALES' ? 'Sales' : 'Purchase'} ${pct(r.rate)}`).join(' · ') || 'No rates'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Statements */}
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <FileText size={14} className="text-muted-foreground" />
            Statements
            <span className="text-muted-foreground font-normal">· {c.statements.length}</span>
          </CardTitle>
          <p className="text-muted-foreground text-xs">Click a statement to see the rows the AI read from it.</p>
        </CardHeader>
        {pdfError && <p className="text-destructive border-b px-4 py-2 text-sm">{pdfError}</p>}
        {!c.statements.length ? (
          <p className="text-muted-foreground p-8 text-center text-sm">This customer has not uploaded a statement yet.</p>
        ) : (
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">File</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="hidden md:table-cell">Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="hidden lg:table-cell">Read</TableHead>
                <TableHead className="pr-4 text-right">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.statements.map(s => {
                const status = STATUS_STYLE[s.status];
                return (
                  <TableRow
                    key={s.id}
                    onClick={() => setOpen(s)}
                    className={cn('cursor-pointer', s.deletedAt && 'opacity-55')}
                  >
                    <TableCell className="max-w-[16rem] pl-4">
                      <p className="truncate font-medium" title={s.filename}>{s.filename}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatBytes(s.sizeBytes)}
                        {s.deletedAt && <> · <span className="text-red-600">deleted {fmtDateTime(s.deletedAt)}</span></>}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-[12rem]">
                      <p className="truncate text-sm">{s.bankName || '—'}</p>
                      <p className="text-muted-foreground truncate text-xs">{s.accountName || ''}</p>
                    </TableCell>
                    <TableCell className="hidden text-sm whitespace-nowrap md:table-cell">
                      {fmtPeriod(s.periodStart, s.periodEnd)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', status.className)}
                        title={s.error ?? undefined}
                      >
                        {status.label}
                      </span>
                      {s.verification && s.status === 'DONE' && (
                        <p className="text-muted-foreground mt-0.5 text-[10px] tracking-wide uppercase">{s.verification.toLowerCase()}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.transactionCount.toLocaleString()}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{fmtDateTime(s.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground hidden text-sm whitespace-nowrap lg:table-cell">
                      {s.processedAt ? fmtDateTime(s.processedAt) : '—'}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={pdfBusy === s.id}
                        onClick={e => {
                          e.stopPropagation();
                          void openPdf(s);
                        }}
                      >
                        {pdfBusy === s.id ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <CustomerPaymentsCard customerId={c.id} />

      <CustomerAiCard customerId={c.id} />

      <StatementRowsDialog customerId={c.id} statement={open} onClose={() => setOpen(null)} />
    </div>
    </CustomerSiteShell>
  );
}

function Field({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground mb-0.5 flex items-center gap-1 text-xs">
        {icon}
        {label}
      </p>
      <p className="truncate text-sm font-medium" title={value}>{value}</p>
    </div>
  );
}
