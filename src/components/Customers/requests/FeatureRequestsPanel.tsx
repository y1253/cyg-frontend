import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import { FEATURE_STATUSES, type FeatureRequest, type FeatureStatus } from '@/api/featureRequests';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFeatureRequests, useUpdateFeatureRequest } from '@/hooks/useFeatureRequests';
import { cn } from '@/lib/utils';
import { fmtDateTime } from '../customer-format';

const FEATURE_STATUS: Record<FeatureStatus, { label: string; className: string }> = {
  OPEN: { label: 'Open', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  PLANNED: { label: 'Planned', className: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  DONE: { label: 'Done', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  DECLINED: { label: 'Declined', className: 'border-slate-200 bg-slate-50 text-slate-600' },
};

const STATUS_ITEMS = Object.fromEntries(FEATURE_STATUSES.map((s) => [s, FEATURE_STATUS[s].label]));

/**
 * step12e: when a customer asks the customer site's AI for something the app cannot do yet,
 * it logs a feature request here (with the conversation it came from). Staff mark each one;
 * marking it Done tells the customer once, by text or email, and their "My requests" page
 * shows it as available.
 */
export function FeatureRequestsPanel() {
  const [filter, setFilter] = useState<FeatureStatus | null>(null);
  const { data = [], isLoading, isError } = useFeatureRequests(filter);
  return (
    <div className="flex flex-col gap-5">
      <Card className="border-indigo-100">
        <CardContent className="flex items-start gap-4 py-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <Lightbulb size={20} />
          </span>
          <div className="text-sm">
            <p className="font-medium">How it works</p>
            <p className="text-muted-foreground">
              When a customer asks the AI for something we don't do yet, it saves the request here and tells them they
              can follow it under "My requests" on cygfinance.com. Set a status and a note — the customer sees both.
              Marking a request Done also texts or emails them that it is available.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-1.5">
        {([null, ...FEATURE_STATUSES] as const).map((s) => (
          <Button
            key={s ?? 'all'}
            size="sm"
            variant={filter === s ? 'default' : 'outline'}
            onClick={() => setFilter(s)}
          >
            {s ? FEATURE_STATUS[s].label : 'All'}
          </Button>
        ))}
      </div>

      {isError && <p className="text-sm text-destructive">Could not load the requests.</p>}
      {isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      ) : !data.length ? (
        <p className="rounded-xl border border-dashed border-indigo-200 bg-white/60 px-4 py-6 text-center text-sm text-muted-foreground">
          {filter ? `No ${FEATURE_STATUS[filter].label.toLowerCase()} requests.` : 'No customer has asked for a new feature yet.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((r) => (
            <RequestRow key={r.id} request={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RequestRow({ request: r }: { request: FeatureRequest }) {
  const update = useUpdateFeatureRequest();
  const [status, setStatus] = useState<FeatureStatus>(r.status);
  const [note, setNote] = useState(r.staffNote ?? '');
  const dirty = status !== r.status || note.trim() !== (r.staffNote ?? '');
  const s = FEATURE_STATUS[r.status] ?? FEATURE_STATUS.OPEN;

  const save = () => update.mutate({ id: r.id, status, staffNote: note });

  return (
    <li className="rounded-xl border bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn('px-1.5 py-0 text-[11px]', s.className)}>
          {s.label}
        </Badge>
        <span className="font-medium">{r.summary}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        <Link to={`/admin/customers/${r.customer.id}`} className="font-medium text-foreground hover:underline">
          {r.customer.name}
        </Link>
        <span>· {r.bookName ?? 'personal books'}</span>
        <span>· {r.channel.toLowerCase()}</span>
        <span>· {fmtDateTime(r.createdAt)}</span>
        {r.conversationId !== null && <span>· conversation #{r.conversationId}</span>}
        {r.updatedBy && <span>· last changed by {r.updatedBy}</span>}
      </div>
      <p className="mt-2 whitespace-pre-line text-muted-foreground">“{r.request}”</p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <Select items={STATUS_ITEMS} value={status} onValueChange={(v) => v && setStatus(v as FeatureStatus)}>
          <SelectTrigger className="w-36 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FEATURE_STATUSES.map((v) => (
              <SelectItem key={v} value={v}>
                {FEATURE_STATUS[v].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note to the customer (optional) — e.g. where to find it"
          rows={2}
          maxLength={2000}
          className="min-h-9 flex-1"
        />
        <Button onClick={save} disabled={!dirty || update.isPending} className="shrink-0">
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {status === 'DONE' && r.status !== 'DONE' && (
        <p className="mt-1.5 text-xs text-emerald-700">The customer will be told it is available once you save.</p>
      )}
      {update.isError && <p className="mt-1.5 text-xs text-destructive">{update.error.message}</p>}
      {r.status === 'DONE' && (
        <p className={cn('mt-1.5 text-xs', r.notifyError ? 'text-destructive' : 'text-muted-foreground')}>
          {r.notifyError
            ? `Could not tell the customer: ${r.notifyError}`
            : r.notifiedAt
              ? `Customer told ${fmtDateTime(r.notifiedAt)}.`
              : 'Telling the customer…'}
        </p>
      )}
    </li>
  );
}
