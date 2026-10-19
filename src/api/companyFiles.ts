import { fetchWithAuth } from './client';

const API = '/api';

/**
 * The bookkeeping files a customer uploaded into ONE company on cygfinance.com (bank
 * statements, receipts, cheques, voice notes), filed per bank account. Read-only — the
 * Communications tab's "Attachments" folder. Server: `company-files` module.
 */
export type FileStatementStatus =
  | 'UPLOADED'
  | 'PENDING'
  | 'PROCESSING'
  | 'DONE'
  | 'FAILED'
  | 'NEEDS_REVIEW';

export interface CompanyStatementFile {
  id: number;
  filename: string;
  status: FileStatementStatus;
  /** `YYYY-MM-DD` — parse at local midnight. */
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
  sizeBytes: number;
  folder: string | null;
}

export type FileAttachmentKind = 'RECEIPT' | 'CHECK' | 'AUDIO' | 'TEXT' | 'OTHER';
export type FileAttachmentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'MATCHED'
  | 'UNMATCHED'
  | 'FAILED';

export interface CompanyAttachmentFile {
  id: number;
  filename: string;
  kind: FileAttachmentKind;
  status: FileAttachmentStatus;
  mimeType: string;
  size: number;
  createdAt: string;
  /** UPLOAD | SMS | STATEMENT */
  source: string;
  /** The transaction it was matched to; null = not matched yet. */
  transaction: { date: string | null; amount: string; name: string | null } | null;
  folder: string | null;
}

export interface CompanyFileFolder {
  /** Null = not sorted / not matched yet. */
  name: string | null;
  statements: CompanyStatementFile[];
  attachments: CompanyAttachmentFile[];
}

export async function fetchCompanyFiles(
  token: string,
  companyId: number,
): Promise<{ folders: CompanyFileFolder[] }> {
  const res = await fetchWithAuth(token, `${API}/companies/${companyId}/files`);
  if (!res.ok) throw new Error('Failed to load the attachments');
  return res.json() as Promise<{ folders: CompanyFileFolder[] }>;
}

export type CompanyFileKind = 'statements' | 'attachments';

const fileUrl = (companyId: number, kind: CompanyFileKind, id: number, download: boolean) =>
  `${API}/companies/${companyId}/files/${kind}/${id}/file${download ? '?download=1' : ''}`;

/**
 * Opens a file in a new tab. The route is guarded, so the bytes come as a blob; the tab
 * is opened BEFORE the await so a popup blocker still counts the click.
 */
export async function openCompanyFile(
  token: string,
  companyId: number,
  kind: CompanyFileKind,
  id: number,
): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const res = await fetchWithAuth(token, fileUrl(companyId, kind, id, false));
    if (!res.ok) throw new Error('The file is no longer available');
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/** Saves a file under its original name. */
export async function downloadCompanyFile(
  token: string,
  companyId: number,
  kind: CompanyFileKind,
  id: number,
  filename: string,
): Promise<void> {
  const res = await fetchWithAuth(token, fileUrl(companyId, kind, id, true));
  if (!res.ok) throw new Error('The file is no longer available');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
