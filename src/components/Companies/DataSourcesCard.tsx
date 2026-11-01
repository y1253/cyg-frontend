import { useState } from 'react';
import { Database, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  DATA_SOURCE_KINDS,
  DATA_SOURCE_KIND_LABEL,
  type DataSource,
  type DataSourceKind,
} from '@/api/dataSources';
import { useDataSourceActions, useDataSources } from '@/hooks/useDataSources';
import { useLinks } from '@/hooks/useLinks';

/** The Select's "no login" value (base-ui wants a string, never ''). */
const NO_LINK = 'none';

/**
 * step11 (2026-11-01): "Where the data is" — per company, where its books, invoices, bank
 * etc. live ("QuickBooks Online — company CYG INC, invoices under Sales → Invoices") and
 * the saved login that opens each. The AI agents read it first for any data question, and
 * on a phone call the owner's questions are answered from it. Management edits it.
 */
export function DataSourcesCard({
  companyId,
  canEdit,
}: {
  companyId: number;
  canEdit: boolean;
}) {
  const sources = useDataSources(companyId);
  const { remove } = useDataSourceActions(companyId);
  const [editing, setEditing] = useState<DataSource | 'new' | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="text-sm font-semibold">Where the data is</CardTitle>
          <p className="text-xs text-muted-foreground">
            Where this company keeps its books, invoices, bank and documents — the AI agent
            looks here first.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Add
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {sources.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : sources.isError ? (
          <p className="text-sm text-destructive">{(sources.error as Error).message}</p>
        ) : !sources.data?.length ? (
          <p className="text-sm text-muted-foreground">
            Nothing saved yet{canEdit ? ' — add where the books and invoices are.' : '.'}
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {sources.data.map((s) => (
              <li key={s.id} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
                <Database className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{DATA_SOURCE_KIND_LABEL[s.kind]}</Badge>
                    <span className="text-sm font-medium">{s.system}</span>
                    {s.linkLabel && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <KeyRound className="size-3" />
                        {s.linkLabel}
                      </span>
                    )}
                  </div>
                  {s.details && (
                    <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {s.details}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Edit"
                      onClick={() => setEditing(s)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Delete"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(s.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editing && (
        <DataSourceDialog
          companyId={companyId}
          source={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function DataSourceDialog({
  companyId,
  source,
  onClose,
}: {
  companyId: number;
  source: DataSource | null;
  onClose: () => void;
}) {
  const links = useLinks(companyId);
  const { create, update } = useDataSourceActions(companyId);
  const [kind, setKind] = useState<DataSourceKind>(source?.kind ?? 'BOOKS');
  const [system, setSystem] = useState(source?.system ?? '');
  const [details, setDetails] = useState(source?.details ?? '');
  const [linkId, setLinkId] = useState<string>(
    source?.linkId ? String(source.linkId) : NO_LINK,
  );
  const saving = create.isPending || update.isPending;
  const error = (create.error ?? update.error) as Error | null;

  const kindItems = Object.fromEntries(
    DATA_SOURCE_KINDS.map((k) => [k, DATA_SOURCE_KIND_LABEL[k]]),
  );
  const linkItems: Record<string, string> = {
    [NO_LINK]: 'No login',
    ...Object.fromEntries((links.data ?? []).map((l) => [String(l.id), l.label])),
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!system.trim()) return;
    const input = {
      kind,
      system: system.trim(),
      details: details.trim(),
      linkId: linkId === NO_LINK ? null : Number(linkId),
    };
    const done = { onSuccess: onClose };
    if (source) update.mutate({ id: source.id, input }, done);
    else create.mutate(input, done);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{source ? 'Edit' : 'Add'} where the data is</DialogTitle>
            <DialogDescription>
              Say exactly where it is — the AI agent follows this to answer questions, also
              on the phone.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">What</Label>
              <Select
                items={kindItems}
                value={kind}
                onValueChange={(v) => setKind((v as DataSourceKind) ?? kind)}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATA_SOURCE_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {DATA_SOURCE_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs" htmlFor="data-source-system">
                System
              </Label>
              <Input
                id="data-source-system"
                className="h-8 text-sm"
                placeholder="QuickBooks Online"
                value={system}
                maxLength={191}
                onChange={(e) => setSystem(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs" htmlFor="data-source-details">
              Where exactly
            </Label>
            <Textarea
              id="data-source-details"
              rows={3}
              maxLength={5000}
              placeholder="Company CYG INC — invoices under Sales → Invoices, customers under Sales → Customers"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Login that opens it</Label>
            <Select
              items={linkItems}
              value={linkId}
              onValueChange={(v) => setLinkId(v ?? NO_LINK)}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(linkItems).map(([v, label]) => (
                  <SelectItem key={v} value={v}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">From the company's Links tab.</p>
          </div>
          {error && <p className="text-sm text-destructive">{error.message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !system.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
