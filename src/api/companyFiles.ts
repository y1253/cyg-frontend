import { fetchWithAuth } from './client';

const API = '/api';

/**
 * The Communications tab's "Attachments" folder: the bookkeeping files a customer uploaded
 * into ONE company on cygfinance.com (bank statements, receipts, cheques, voice notes),
 * filed per bank account (server: `company-files`), and every file from the company's
 * email, chat, WhatsApp and texts (server: `communication-files`). Read-only.
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
 * Opens a guarded file url in a new tab. The bytes come as a blob; the tab is opened
 * BEFORE the await so a popup blocker still counts the click.
 */
async function openBlobUrl(token: string, path: string): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const res = await fetchWithAuth(token, path);
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

/** Saves a guarded file url under `filename`. */
async function downloadBlobUrl(token: string, path: string, filename: string): Promise<void> {
  const res = await fetchWithAuth(token, path);
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

/** Opens an uploaded statement / attachment in a new tab. */
export function openCompanyFile(
  token: string,
  companyId: number,
  kind: CompanyFileKind,
  id: number,
): Promise<void> {
  return openBlobUrl(token, fileUrl(companyId, kind, id, false));
}

/** Saves an uploaded statement / attachment under its original name. */
export function downloadCompanyFile(
  token: string,
  companyId: number,
  kind: CompanyFileKind,
  id: number,
  filename: string,
): Promise<void> {
  return downloadBlobUrl(token, fileUrl(companyId, kind, id, true), filename);
}

// ─── Files from the company's conversations (2026-11-09) ─────────────────────

/** Where a conversation file came from. Server: `communication-files` module. */
export type FileChannel = 'EMAIL' | 'CHAT' | 'WHATSAPP' | 'SMS';

/**
 * Opaque to the client: the server hands it out with each row and takes it back to fetch
 * the bytes (the same shape the AI agents use, `AgentFileSource`).
 */
export type ChannelFileSource = Record<string, unknown> & { kind: string };

export interface ChannelFile {
  key: string;
  channel: FileChannel;
  filename: string;
  mimeType: string;
  size: number | null;
  at: string;
  direction: 'inbound' | 'outbound' | null;
  /** Who sent it — a name, an address or a number ("Sent" for our own). */
  from: string;
  /** The email's subject, the chat space, the conversation's number. */
  context: string;
  /** Null = only reachable by `link` (a Drive / SharePoint file shared in a chat). */
  source: ChannelFileSource | null;
  link: string | null;
}

export interface ChannelFilesPage {
  /** False = the channel is not set up for this company (no mailbox, no number…). */
  connected: boolean;
  items: ChannelFile[];
  nextPageToken: string | null;
}

/** The Attachments folder's date filter: local days, YYYY-MM-DD, both inclusive. */
export interface FileDateRange {
  from?: string;
  to?: string;
}

export async function fetchChannelFiles(
  token: string,
  companyId: number,
  channel: FileChannel,
  pageToken?: string | null,
  range: FileDateRange = {},
): Promise<ChannelFilesPage> {
  const params = new URLSearchParams();
  if (pageToken) params.set('pageToken', pageToken);
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  const qs = params.size ? `?${params}` : '';
  const res = await fetchWithAuth(
    token,
    `${API}/companies/${companyId}/files/channels/${channel.toLowerCase()}${qs}`,
  );
  if (!res.ok) throw new Error('Failed to load the files');
  return res.json() as Promise<ChannelFilesPage>;
}

const channelFileUrl = (companyId: number, source: ChannelFileSource, download: boolean) =>
  `${API}/companies/${companyId}/files/channels/file?source=${encodeURIComponent(
    JSON.stringify(source),
  )}${download ? '&download=1' : ''}`;

export function openChannelFile(
  token: string,
  companyId: number,
  source: ChannelFileSource,
): Promise<void> {
  return openBlobUrl(token, channelFileUrl(companyId, source, false));
}

export function downloadChannelFile(
  token: string,
  companyId: number,
  source: ChannelFileSource,
  filename: string,
): Promise<void> {
  return downloadBlobUrl(token, channelFileUrl(companyId, source, true), filename);
}
