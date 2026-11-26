import { fetchWithAuth } from './client';

/**
 * step11.md (2026-11-25): the QuickBooks import popup. Mirrors the internal server's
 * `quickbooks-import/qbo-import.types.ts` (`ImportSnapshot`) — keep the two in step.
 */
export type ImportState = 'PERIOD' | 'LOADING' | 'REVIEW' | 'APPLYING' | 'DONE' | 'FAILED';

export const SPLIT = '__SPLIT__';
export const SKIP = '__SKIP__';

export interface ImportQuestion {
  id: string;
  kind: 'NAME_CATEGORIES' | 'DESCRIPTION_CONFLICT' | 'RULE_CONFLICT' | 'AI';
  title: string;
  detail: string | null;
  options: Array<{ value: string; label: string; detail?: string }>;
  answer: string | null;
  note: string | null;
  suggested: string | null;
}

export interface ImportNameRule {
  id: string;
  payee: string;
  categories: Array<{ category: string; count: number }>;
  category: string | null;
  split: boolean;
  aliases: string[];
  count: number;
  skip: boolean;
  keepCategory?: boolean;
}

export interface ImportDescriptionRule {
  id: string;
  key: string;
  example: string;
  payee: string;
  category: string | null;
  count: number;
  skip: boolean;
}

export interface ImportSnapshot {
  companyId: number;
  state: ImportState;
  since: string | null;
  turnOn: boolean;
  startedBy: string;
  log: string[];
  stats: { qboTransactions: number; bookRows: number; matched: number; payees: number } | null;
  questions: ImportQuestion[];
  names: ImportNameRule[];
  descriptions: ImportDescriptionRule[];
  aiAvailable: boolean;
  aiBusy: boolean;
  aiChanges: string[];
  chat: Array<{ from: 'admin' | 'ai'; text: string }>;
  historyFix: { recategorize: number; toMix: number };
  result: {
    rules: number;
    categoriesCreated: string[];
    subNames: number;
    errors: string[];
    historyFixed: number;
    historyErrors: string[];
    turnedOn: boolean;
  } | null;
  error: string | null;
}

export type ImportAction =
  | { action: 'open'; turnOn: boolean }
  | { action: 'period'; since: string | null }
  | { action: 'answer'; questionId: string; value: string; note?: string }
  | { action: 'answer-rest' }
  | { action: 'message'; text: string }
  | { action: 'apply'; fixHistory: boolean }
  | { action: 'skip-import' }
  | { action: 'cancel' }
  | { action: 'snapshot' };

/** The same command over HTTP, for a tab with no WebSocket. Answers the snapshot. */
export async function sendImportCommandHttp(
  token: string,
  companyId: number,
  cmd: ImportAction,
): Promise<ImportSnapshot> {
  const res = await fetchWithAuth(
    token,
    `/api/quickbooks-import/companies/${companyId}/command`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    },
  );
  const body = (await res.json().catch(() => ({}))) as ImportSnapshot & {
    message?: string | string[];
  };
  if (!res.ok) {
    const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new Error(msg || 'The QuickBooks import failed');
  }
  return body;
}
