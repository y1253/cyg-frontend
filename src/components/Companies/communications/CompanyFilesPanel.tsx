import { useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, ArrowUpDown, Download, ExternalLink, FileText, Folder,
  FolderOpen, Loader2, Paperclip,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/SearchInput';
import { useAuth } from '@/context/AuthContext';
import { useCompanyFiles } from '@/hooks/useCompanyFiles';
import {
  downloadCompanyFile, openCompanyFile,
  type CompanyAttachmentFile, type CompanyFileFolder, type CompanyFileKind,
  type CompanyStatementFile,
} from '@/api/companyFiles';
import { fmtDateTime, fmtPeriod } from '@/components/Customers/customer-format';
import { formatBytes } from '../message-utils';
import { FolderTabs } from './FolderTabs';

/** One table row, statement or attachment, flattened so a folder sorts as one list. */
interface FileRow {
  key: string;
  kind: CompanyFileKind;
  id: number;
  filename: string;
  /** "Statement", "Receipt", "Cheque", … */
  type: string;
  status: string;
  createdAt: string;
  size: number;
  detail: string;
}

type SortKey = 'filename' | 'type' | 'createdAt' | 'size';
type SortDir = 'asc' | 'desc';

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

function statementRow(s: CompanyStatementFile): FileRow {
  return {
    key: `s${s.id}`,
    kind: 'statements',
    id: s.id,
    filename: s.filename,
    type: 'Statement',
    status: s.status,
    createdAt: s.createdAt,
    size: s.sizeBytes,
    detail: fmtPeriod(s.periodStart, s.periodEnd),
  };
}

function attachmentRow(a: CompanyAttachmentFile): FileRow {
  const t = a.transaction;
  const amount = t ? Number(t.amount).toLocaleString(undefined, { style: 'currency', currency: 'CAD' }) : '';
  return {
    key: `a${a.id}`,
    kind: 'attachments',
    id: a.id,
    filename: a.filename,
    type: KIND_LABEL[a.kind] + (a.source === 'SMS' ? ' (texted)' : a.source === 'STATEMENT' ? ' (from statement)' : ''),
    status: a.status,
    createdAt: a.createdAt,
    size: a.size,
    detail: t ? [t.name ?? 'Unclarified name', amount, t.date ?? ''].filter(Boolean).join(' · ') : '',
  };
}

function compare(a: FileRow, b: FileRow, key: SortKey): number {
  if (key === 'size') return a.size - b.size;
  if (key === 'createdAt') return a.createdAt.localeCompare(b.createdAt);
  return a[key].localeCompare(b[key], undefined, { sensitivity: 'base', numeric: true });
}

/**
 * The Communications tab's "Attachments" folder: the bookkeeping files the customer
 * uploaded into THIS company on cygfinance.com, one folder per bank account (a receipt
 * sits in the folder of the statement its transaction is on). Read-only — open and
 * download only. Carries the folder strip itself, like `ContactsPanel`, because it
 * replaces the inbox and the strip is the only way back out.
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
  const query = useCompanyFiles(companyId);
  const folders = useMemo(() => query.data?.folders ?? [], [query.data]);
  const [openFolder, setOpenFolder] = useState<number>(0);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'createdAt', dir: 'desc' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const folder = folders[Math.min(openFolder, Math.max(folders.length - 1, 0))];

  const rows = useMemo(() => {
    if (!folder) return [];
    const q = search.trim().toLowerCase();
    const all = [...folder.statements.map(statementRow), ...folder.attachments.map(attachmentRow)];
    const shown = q
      ? all.filter((r) => `${r.filename} ${r.type} ${r.detail}`.toLowerCase().includes(q))
      : all;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return shown.sort((a, b) => sign * compare(a, b, sort.key));
  }, [folder, search, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'createdAt' || key === 'size' ? 'desc' : 'asc' },
    );

  const act = async (row: FileRow, mode: 'open' | 'download') => {
    if (!token) return;
    setError(null);
    setBusy(row.key + mode);
    try {
      if (mode === 'open') await openCompanyFile(token, companyId, row.kind, row.id);
      else await downloadCompanyFile(token, companyId, row.kind, row.id, row.filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the file');
    } finally {
      setBusy(null);
    }
  };

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
        Statements and receipts the client uploaded for this business on cygfinance.com,
        one folder per bank account.
      </p>

      {query.isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : query.isError ? (
        <p className="text-sm text-destructive">{query.error.message}</p>
      ) : folders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          <Paperclip size={20} />
          The client has not uploaded anything for this business yet.
        </div>
      ) : (
        <div className="flex flex-col gap-4 md:flex-row">
          <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-56 md:flex-col md:overflow-visible">
            {folders.map((f, i) => {
              const active = folder === f;
              const Icon = active ? FolderOpen : Folder;
              return (
                <button
                  key={f.name ?? '__none'}
                  type="button"
                  onClick={() => setOpenFolder(i)}
                  className={[
                    'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                    active
                      ? 'bg-teal-50 font-medium text-teal-800'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    f.name === null ? 'italic' : '',
                  ].join(' ')}
                >
                  <Icon size={15} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{folderLabel(f)}</span>
                  <span className="text-xs tabular-nums opacity-70">
                    {f.statements.length + f.attachments.length}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Search this folder…" />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    {header('filename', 'Name')}
                    {header('type', 'Type', 'hidden sm:table-cell')}
                    {header('createdAt', 'Uploaded', 'hidden md:table-cell')}
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
                    rows.map((r) => (
                      <tr key={r.key} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="max-w-0 px-3 py-2">
                          <div className="flex items-center gap-2">
                            {r.kind === 'statements' ? (
                              <FileText size={14} className="shrink-0 text-muted-foreground" />
                            ) : (
                              <Paperclip size={14} className="shrink-0 text-muted-foreground" />
                            )}
                            <span className="truncate font-medium">{r.filename}</span>
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              {STATUS_LABEL[r.status] ?? r.status}
                            </Badge>
                          </div>
                          {r.detail && (
                            <div className="truncate pl-6 text-xs text-muted-foreground">{r.detail}</div>
                          )}
                          <div className="truncate pl-6 text-xs text-muted-foreground sm:hidden">{r.type}</div>
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-2 text-muted-foreground sm:table-cell">
                          {r.type}
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-2 text-muted-foreground md:table-cell">
                          {fmtDateTime(r.createdAt)}
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground lg:table-cell">
                          {formatBytes(r.size)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
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
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
