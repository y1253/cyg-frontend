import { useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, ArrowUpDown, CloudUpload, Download, ExternalLink, FileText, Files,
  Folder, FolderOpen, Link2, Loader2, Mail, MessageCircle, MessagesSquare, Paperclip,
  Smartphone, type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/SearchInput';
import { useAuth } from '@/context/AuthContext';
import { useCompanyFiles } from '@/hooks/useCompanyFiles';
import { useCompanyChannelFiles } from '@/hooks/useCompanyChannelFiles';
import {
  downloadChannelFile, downloadCompanyFile, openChannelFile, openCompanyFile,
  type ChannelFile, type ChannelFileSource, type CompanyAttachmentFile,
  type CompanyFileFolder, type CompanyFileKind, type CompanyStatementFile, type FileChannel,
} from '@/api/companyFiles';
import { fmtDateTime, fmtPeriod } from '@/components/Customers/customer-format';
import { formatBytes } from '../message-utils';
import { FolderTabs } from './FolderTabs';

/** How a row's bytes are reached. */
type Opener =
  | { kind: 'upload'; fileKind: CompanyFileKind; id: number }
  | { kind: 'channel'; source: ChannelFileSource }
  | { kind: 'link'; url: string }
  | null;

/** One table row — an upload or a file from a conversation — so a view sorts as one list. */
interface FileRow {
  key: string;
  /** EMAIL / CHAT / WHATSAPP / SMS, or UPLOAD for the customer's cygfinance.com files. */
  origin: FileChannel | 'UPLOAD';
  filename: string;
  /** "Statement", "Receipt", "PDF", "Image", … */
  type: string;
  status: string | null;
  at: string;
  size: number | null;
  /** Who sent it, the subject / space / number — or the matched transaction. */
  detail: string;
  open: Opener;
}

type SortKey = 'filename' | 'type' | 'at' | 'size';
type SortDir = 'asc' | 'desc';

/** What the left-hand list has selected. */
type View =
  | { kind: 'all' }
  | { kind: 'channel'; channel: FileChannel }
  | { kind: 'upload'; index: number };

const CHANNELS: { id: FileChannel; label: string; icon: LucideIcon; notConnected: string }[] = [
  { id: 'EMAIL', label: 'Email', icon: Mail, notConnected: 'No mailbox is connected for this company.' },
  { id: 'CHAT', label: 'Chat', icon: MessagesSquare, notConnected: 'No mailbox is connected, so there is no chat.' },
  { id: 'WHATSAPP', label: 'WhatsApp', icon: MessageCircle, notConnected: 'WhatsApp is not connected for this company.' },
  { id: 'SMS', label: 'Texts', icon: Smartphone, notConnected: 'This company has no phone number.' },
];

const ORIGIN_LABEL: Record<FileRow['origin'], string> = {
  EMAIL: 'Email',
  CHAT: 'Chat',
  WHATSAPP: 'WhatsApp',
  SMS: 'Text',
  UPLOAD: 'Uploaded',
};

const ORIGIN_ICON: Record<FileRow['origin'], LucideIcon> = {
  EMAIL: Mail,
  CHAT: MessagesSquare,
  WHATSAPP: MessageCircle,
  SMS: Smartphone,
  UPLOAD: CloudUpload,
};

const KIND_LABEL: Record<CompanyAttachmentFile['kind'], string> = {
  RECEIPT: 'Receipt',
  CHECK: 'Cheque',
  AUDIO: 'Voice note',
  TEXT: 'Text',
  OTHER: 'Attachment',
};

const STATUS_LABEL: Record<string, string> = {
  UPLOADED: 'Uploaded',
  PENDING: 'Waiting',
  PROCESSING: 'Reading',
  DONE: 'Read',
  FAILED: 'Failed',
  NEEDS_REVIEW: 'Needs review',
  MATCHED: 'Matched',
  UNMATCHED: 'Not matched',
};

/** Null = statements not read yet and attachments not matched to a transaction yet. */
const folderLabel = (f: CompanyFileFolder) => f.name ?? 'Not sorted yet';

/** A short type for a file from a conversation, from its MIME type. */
function typeOf(mime: string, filename: string): string {
  const m = mime.toLowerCase();
  if (m === 'application/pdf' || /\.pdf$/i.test(filename)) return 'PDF';
  if (m.startsWith('image/')) return 'Image';
  if (m.startsWith('video/')) return 'Video';
  if (m.startsWith('audio/')) return 'Audio';
  if (/sheet|excel|csv/.test(m) || /\.(xlsx?|csv)$/i.test(filename)) return 'Spreadsheet';
  if (/word|document/.test(m) || /\.docx?$/i.test(filename)) return 'Document';
  return 'File';
}

function statementRow(s: CompanyStatementFile): FileRow {
  return {
    key: `s${s.id}`,
    origin: 'UPLOAD',
    filename: s.filename,
    type: 'Statement',
    status: s.status,
    at: s.createdAt,
    size: s.sizeBytes,
    detail: fmtPeriod(s.periodStart, s.periodEnd),
    open: { kind: 'upload', fileKind: 'statements', id: s.id },
  };
}

function attachmentRow(a: CompanyAttachmentFile): FileRow {
  const t = a.transaction;
  const amount = t ? Number(t.amount).toLocaleString(undefined, { style: 'currency', currency: 'CAD' }) : '';
  return {
    key: `a${a.id}`,
    origin: 'UPLOAD',
    filename: a.filename,
    type: KIND_LABEL[a.kind] + (a.source === 'SMS' ? ' (texted)' : a.source === 'STATEMENT' ? ' (from statement)' : ''),
    status: a.status,
    at: a.createdAt,
    size: a.size,
    detail: t ? [t.name ?? 'Unclarified name', amount, t.date ?? ''].filter(Boolean).join(' · ') : '',
    open: { kind: 'upload', fileKind: 'attachments', id: a.id },
  };
}

function channelRow(f: ChannelFile): FileRow {
  return {
    key: f.key,
    origin: f.channel,
    filename: f.filename,
    type: typeOf(f.mimeType, f.filename),
    status: null,
    at: f.at,
    size: f.size,
    detail: [f.from, f.context].filter(Boolean).join(' · '),
    open: f.source
      ? { kind: 'channel', source: f.source }
      : f.link
        ? { kind: 'link', url: f.link }
        : null,
  };
}

function compare(a: FileRow, b: FileRow, key: SortKey): number {
  if (key === 'size') return (a.size ?? -1) - (b.size ?? -1);
  if (key === 'at') return a.at.localeCompare(b.at);
  return a[key].localeCompare(b[key], undefined, { sensitivity: 'base', numeric: true });
}

/**
 * The Communications tab's "Attachments" folder: every file in this company's
 * conversations — email, Google Chat / Teams, WhatsApp, texts (2026-11-09) — plus the
 * bookkeeping files the customer uploaded on cygfinance.com, one folder per bank account.
 * Read-only — open and download only. Each channel loads on its own, so a slow chat crawl
 * never holds up the rest. Carries the folder strip itself, like `ContactsPanel`, because
 * it replaces the inbox and the strip is the only way back out.
 */
export function CompanyFilesPanel({
  companyId,
  account,
  selectedLabel,
  onSelectFolder,
  unreadCount,
  uncompletedCount,
}: {
  companyId: number;
  account: unknown;
  selectedLabel: string;
  onSelectFolder: (id: string) => void;
  unreadCount: number;
  uncompletedCount: number;
}) {
  const { token } = useAuth();
  const uploads = useCompanyFiles(companyId);
  const email = useCompanyChannelFiles(companyId, 'EMAIL');
  const chat = useCompanyChannelFiles(companyId, 'CHAT');
  const whatsapp = useCompanyChannelFiles(companyId, 'WHATSAPP');
  const sms = useCompanyChannelFiles(companyId, 'SMS');
  const channelQueries = { EMAIL: email, CHAT: chat, WHATSAPP: whatsapp, SMS: sms };

  const folders = useMemo(() => uploads.data?.folders ?? [], [uploads.data]);
  const [view, setView] = useState<View>({ kind: 'all' });
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'at', dir: 'desc' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const channelRows = useMemo(() => {
    const rowsOf = (pages: { items: ChannelFile[] }[] | undefined) =>
      (pages ?? []).flatMap((p) => p.items.map(channelRow));
    return {
      EMAIL: rowsOf(email.data?.pages),
      CHAT: rowsOf(chat.data?.pages),
      WHATSAPP: rowsOf(whatsapp.data?.pages),
      SMS: rowsOf(sms.data?.pages),
    } satisfies Record<FileChannel, FileRow[]>;
  }, [email.data, chat.data, whatsapp.data, sms.data]);

  const uploadRows = useMemo(
    () => folders.map((f) => [...f.statements.map(statementRow), ...f.attachments.map(attachmentRow)]),
    [folders],
  );

  const rows = useMemo(() => {
    let all: FileRow[];
    if (view.kind === 'all') all = [...Object.values(channelRows).flat(), ...uploadRows.flat()];
    else if (view.kind === 'channel') all = channelRows[view.channel];
    else all = uploadRows[view.index] ?? [];
    const q = search.trim().toLowerCase();
    const shown = q
      ? all.filter((r) => `${r.filename} ${r.type} ${r.detail}`.toLowerCase().includes(q))
      : [...all];
    const sign = sort.dir === 'asc' ? 1 : -1;
    return shown.sort((a, b) => sign * compare(a, b, sort.key));
  }, [view, channelRows, uploadRows, search, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'at' || key === 'size' ? 'desc' : 'asc' },
    );

  const act = async (row: FileRow, mode: 'open' | 'download') => {
    const o = row.open;
    if (!token || !o) return;
    if (o.kind === 'link') {
      window.open(o.url, '_blank', 'noopener,noreferrer');
      return;
    }
    setError(null);
    setBusy(row.key + mode);
    try {
      if (o.kind === 'upload') {
        if (mode === 'open') await openCompanyFile(token, companyId, o.fileKind, o.id);
        else await downloadCompanyFile(token, companyId, o.fileKind, o.id, row.filename);
      } else if (mode === 'open') {
        await openChannelFile(token, companyId, o.source);
      } else {
        await downloadChannelFile(token, companyId, o.source, row.filename);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the file');
    } finally {
      setBusy(null);
    }
  };

  // What the current view is still waiting for, and whether it can load more.
  const viewChannels: FileChannel[] =
    view.kind === 'all' ? CHANNELS.map((c) => c.id) : view.kind === 'channel' ? [view.channel] : [];
  const loading = viewChannels.filter((c) => channelQueries[c].isLoading);
  const failed = viewChannels.filter((c) => channelQueries[c].isError);
  const canLoadMore = viewChannels.some((c) => channelQueries[c].hasNextPage);
  const loadingMore = viewChannels.some((c) => channelQueries[c].isFetchingNextPage);
  const loadMore = () => {
    for (const c of viewChannels) {
      const q = channelQueries[c];
      if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
    }
  };
  const uploadsLoading = (view.kind === 'all' || view.kind === 'upload') && uploads.isLoading;
  const anyLoading = loading.length > 0 || uploadsLoading;
  const notConnected =
    view.kind === 'channel' && channelQueries[view.channel].data?.pages[0]?.connected === false
      ? CHANNELS.find((c) => c.id === view.channel)!.notConnected
      : null;

  const header = (key: SortKey, label: string, className = '') => {
    const Icon = sort.key !== key ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th className={`px-3 py-2 text-left font-medium ${className}`}>
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          {label}
          <Icon size={12} className={sort.key === key ? 'text-teal-700' : 'opacity-40'} />
        </button>
      </th>
    );
  };

  const navButton = (
    key: string,
    active: boolean,
    onClick: () => void,
    Icon: LucideIcon,
    label: string,
    count: number | null,
    opts: { italic?: boolean; pending?: boolean; dim?: boolean } = {},
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={[
        'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
        active
          ? 'bg-teal-50 font-medium text-teal-800'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        opts.italic ? 'italic' : '',
        opts.dim && !active ? 'opacity-60' : '',
      ].join(' ')}
    >
      <Icon size={15} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {opts.pending ? (
        <Loader2 size={12} className="animate-spin opacity-70" />
      ) : count !== null ? (
        <span className="text-xs tabular-nums opacity-70">{count}</span>
      ) : null}
    </button>
  );

  const totalCount =
    Object.values(channelRows).reduce((n, r) => n + r.length, 0) +
    uploadRows.reduce((n, r) => n + r.length, 0);

  const emptyText =
    notConnected ??
    (view.kind === 'all'
      ? 'No files in this company’s conversations or uploads yet.'
      : view.kind === 'upload'
        ? 'Nothing in this folder.'
        : 'No files in this channel yet.');

  return (
    <div className="flex flex-col gap-4">
      <FolderTabs
        account={account}
        selectedLabel={selectedLabel}
        onSelectFolder={onSelectFolder}
        unreadCount={unreadCount}
        uncompletedCount={uncompletedCount}
      />

      <p className="text-sm text-muted-foreground">
        Every file sent or received by email, chat, WhatsApp and text, plus what the client
        uploaded for this business on cygfinance.com.
      </p>

      <div className="flex flex-col gap-4 md:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-56 md:flex-col md:overflow-visible">
          {navButton('all', view.kind === 'all', () => setView({ kind: 'all' }), Files, 'All files', totalCount, {
            pending: CHANNELS.some((c) => channelQueries[c.id].isLoading) || uploads.isLoading,
          })}
          {CHANNELS.map((c) => {
            const q = channelQueries[c.id];
            return navButton(
              c.id,
              view.kind === 'channel' && view.channel === c.id,
              () => setView({ kind: 'channel', channel: c.id }),
              c.icon,
              c.label,
              channelRows[c.id].length,
              { pending: q.isLoading, dim: q.data?.pages[0]?.connected === false },
            );
          })}
          <div className="hidden px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:block">
            Uploaded on cygfinance.com
          </div>
          {uploads.isLoading ? (
            <div className="hidden px-3 py-2 text-muted-foreground md:block">
              <Loader2 size={14} className="animate-spin" />
            </div>
          ) : folders.length === 0 ? (
            <div className="hidden px-3 py-1 text-xs text-muted-foreground md:block">Nothing uploaded yet.</div>
          ) : (
            folders.map((f, i) => {
              const active = view.kind === 'upload' && view.index === i;
              return navButton(
                `upload:${f.name ?? '__none'}`,
                active,
                () => setView({ kind: 'upload', index: i }),
                active ? FolderOpen : Folder,
                folderLabel(f),
                f.statements.length + f.attachments.length,
                { italic: f.name === null },
              );
            })
          )}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search files…" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          {uploads.isError && view.kind !== 'channel' && (
            <p className="text-sm text-destructive">{uploads.error.message}</p>
          )}
          {failed.length > 0 && (
            <p className="text-sm text-destructive">
              Could not load {failed.map((c) => CHANNELS.find((x) => x.id === c)!.label).join(', ')} files.
            </p>
          )}
          {loading.length > 0 && rows.length > 0 && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Still loading {loading.map((c) => CHANNELS.find((x) => x.id === c)!.label).join(', ')}…
            </p>
          )}

          {rows.length === 0 && (anyLoading || (view.kind === 'channel' && channelQueries[view.channel].isLoading)) ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : rows.length === 0 && !search ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              <Paperclip size={20} />
              {emptyText}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    {header('filename', 'Name')}
                    {header('type', 'Type', 'hidden sm:table-cell')}
                    {header('at', 'Date', 'hidden md:table-cell')}
                    {header('size', 'Size', 'hidden lg:table-cell')}
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                        Nothing matches.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const OriginIcon = r.origin === 'UPLOAD' && r.type === 'Statement' ? FileText : ORIGIN_ICON[r.origin];
                      return (
                        <tr key={r.key} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="max-w-0 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <OriginIcon size={14} className="shrink-0 text-muted-foreground" />
                              <span className="truncate font-medium">{r.filename}</span>
                              {view.kind === 'all' && (
                                <Badge variant="secondary" className="shrink-0 text-[10px]">
                                  {ORIGIN_LABEL[r.origin]}
                                </Badge>
                              )}
                              {r.status && (
                                <Badge variant="outline" className="shrink-0 text-[10px]">
                                  {STATUS_LABEL[r.status] ?? r.status}
                                </Badge>
                              )}
                            </div>
                            {r.detail && (
                              <div className="truncate pl-6 text-xs text-muted-foreground">{r.detail}</div>
                            )}
                            <div className="truncate pl-6 text-xs text-muted-foreground md:hidden">
                              {r.type} · {fmtDateTime(r.at)}
                            </div>
                          </td>
                          <td className="hidden whitespace-nowrap px-3 py-2 text-muted-foreground sm:table-cell">
                            {r.type}
                          </td>
                          <td className="hidden whitespace-nowrap px-3 py-2 text-muted-foreground md:table-cell">
                            {fmtDateTime(r.at)}
                          </td>
                          <td className="hidden whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground lg:table-cell">
                            {r.size ? formatBytes(r.size) : '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            {r.open?.kind === 'link' ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Open the shared link"
                                onClick={() => void act(r, 'open')}
                              >
                                <Link2 />
                              </Button>
                            ) : r.open ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Open"
                                  disabled={busy !== null}
                                  onClick={() => void act(r, 'open')}
                                >
                                  {busy === r.key + 'open' ? <Loader2 className="animate-spin" /> : <ExternalLink />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Download"
                                  disabled={busy !== null}
                                  onClick={() => void act(r, 'download')}
                                >
                                  {busy === r.key + 'download' ? <Loader2 className="animate-spin" /> : <Download />}
                                </Button>
                              </>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {canLoadMore && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" disabled={loadingMore} onClick={loadMore}>
                {loadingMore && <Loader2 className="animate-spin" />}
                Load older files
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
