/**
 * The advanced-search panel's fields.
 *
 * Deliberately mirrors `server/src/communications/email-search.ts` — the values
 * travel structured and each provider compiles them into its own query language
 * (Gmail operators vs Graph KQL). Keep the two in step.
 */
export interface SearchFilters {
  from: string;
  to: string;
  subject: string;
  /** "Has the words" */
  words: string;
  /** "Doesn't have" */
  notWords: string;
  sizeOp: 'gt' | 'lt';
  /** Raw number as typed; paired with `sizeUnit` to make bytes. */
  sizeValue: string;
  sizeUnit: 'MB' | 'KB' | 'B';
  within: '' | '1d' | '3d' | '1w' | '2w' | '1m' | '2m' | '6m' | '1y';
  /** yyyy-mm-dd the window is centred on. Empty = today. */
  anchor: string;
  hasAttachment: boolean;
  excludeChats: boolean;
  scope: 'all' | 'inbox' | 'sent' | 'spam' | 'trash';
}

export const EMPTY_FILTERS: SearchFilters = {
  from: '',
  to: '',
  subject: '',
  words: '',
  notWords: '',
  sizeOp: 'gt',
  sizeValue: '',
  sizeUnit: 'MB',
  within: '',
  anchor: '',
  hasAttachment: false,
  excludeChats: false,
  scope: 'inbox',
};

const UNIT_BYTES: Record<SearchFilters['sizeUnit'], number> = {
  MB: 1024 * 1024,
  KB: 1024,
  B: 1,
};

/** Fields that actually narrow the search — `excludeChats` is applied client-side. */
function serverFields(f: SearchFilters): string[] {
  const size = Number(f.sizeValue);
  return [
    f.from.trim(),
    f.to.trim(),
    f.subject.trim(),
    f.words.trim(),
    f.notWords.trim(),
    Number.isFinite(size) && size > 0 ? String(size) : '',
    f.within,
    f.hasAttachment ? 'y' : '',
    // Inbox is the default view, so it alone doesn't count as a filter.
    f.scope !== 'inbox' ? f.scope : '',
  ].filter(Boolean);
}

/** How many filters are set — drives the badge on the toolbar button. */
export function activeFilterCount(f: SearchFilters): number {
  return serverFields(f).length + (f.excludeChats ? 1 : 0);
}

export function hasActiveFilters(f: SearchFilters): boolean {
  return activeFilterCount(f) > 0;
}

/**
 * True when the search is structured rather than plain text.
 *
 * Chat search is a substring scan over sender/space/text, so feeding it an
 * advanced query would only ever produce garbage matches — callers use this to
 * stop passing the term to the chat query.
 */
export function isStructuredSearch(f: SearchFilters): boolean {
  return serverFields(f).length > 0;
}

/** The query params the email endpoints read. Omits anything unset. */
export function filterParams(f: SearchFilters): Record<string, string> {
  const params: Record<string, string> = {};
  const put = (key: string, value: string) => {
    if (value.trim()) params[key] = value.trim();
  };
  put('from', f.from);
  put('to', f.to);
  put('subject', f.subject);
  put('words', f.words);
  put('notWords', f.notWords);

  const size = Number(f.sizeValue);
  if (Number.isFinite(size) && size > 0) {
    params.sizeOp = f.sizeOp;
    params.sizeBytes = String(Math.floor(size * UNIT_BYTES[f.sizeUnit]));
  }
  if (f.within) {
    params.within = f.within;
    if (f.anchor) params.anchor = f.anchor;
  }
  if (f.hasAttachment) params.hasAttachment = 'true';
  if (f.scope !== 'inbox') params.scope = f.scope;
  return params;
}

/**
 * Stable key for React Query. Two filter objects that produce the same request
 * must produce the same key, or the cache serves another search's pages.
 */
export function filterKey(f: SearchFilters): string {
  const params = filterParams(f);
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
}
