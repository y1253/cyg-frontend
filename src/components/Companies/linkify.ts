// Finds URLs, bare domains and email addresses inside plain text so they can be
// rendered as links — what Gmail and Outlook both do on display.
//
// Deliberately display-only: nothing here ever rewrites what the user typed or what
// we store, so a send can't be mangled and every message already in the database
// benefits without a migration.
//
// Pure and DOM-free on purpose. The two rendering adapters (the `Linkified` React
// component for plain text, and EmailBodyFrame's pass over the live iframe document)
// both sit on top of `findLinks`, so there is exactly one definition of "what counts
// as a link" to keep correct.

/**
 * TLDs a BARE domain may end in — i.e. `hello.com` with no scheme.
 *
 * An allowlist, not a full TLD table, because the failure that actually bites is a
 * filename turning blue: `.sh`, `.md`, `.ai`, `.it`, `.rs`, `.zip` and `.mov` are all
 * genuine TLDs, so `deploy.sh` and `steps.md` would linkify against the real list.
 * People type filenames in messages far more often than they type a Saint Helena
 * domain, so those are left out on purpose — spell out `https://` for one of those.
 *
 * Only bare domains are gated. Anything with an explicit `http://`, `https://` or
 * `www.` links whatever its ending, so intranet hosts still work.
 *
 * This is the one place to extend when a real domain doesn't light up.
 */
export const COMMON_TLDS = new Set([
  // generic
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'name', 'pro',
  // common newer gTLDs
  'app', 'dev', 'io', 'co', 'cloud', 'tech', 'online', 'site', 'website', 'page',
  'shop', 'store', 'agency', 'group', 'team', 'company', 'solutions', 'services',
  'consulting', 'finance', 'financial', 'tax', 'accountant', 'accountants',
  'digital', 'media', 'news', 'blog', 'email', 'link', 'live', 'life', 'world',
  'today', 'center', 'systems', 'software', 'network', 'expert', 'partners',
  // countries the firm and its clients actually deal with
  'ca', 'us', 'uk', 'fr', 'de', 'es', 'nl', 'be', 'ch', 'at', 'ie', 'pt', 'se',
  'no', 'dk', 'fi', 'eu', 'au', 'nz', 'jp', 'cn', 'in', 'br', 'mx', 'il', 'za',
  'kr', 'sg', 'hk', 'cz', 'gr', 'ro', 'hu', 'ua', 'tr', 'ru',
]);

/** Characters that end a sentence rather than a URL. */
const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', "'", '"']);

/** Closers we only strip when the match doesn't open them itself. */
const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

/**
 * A bare domain must start at a token boundary. Without this, the tail of a longer
 * word could match on its own — including the domain half of an email address, if the
 * email branch ever failed to fire first.
 */
const BOUNDARY_BEFORE = /[A-Za-z0-9@._-]/;

/**
 * The four things worth linking, tried in this order at each position.
 *
 * Order matters: `email` has to beat `bareDomain`, or `chaim@cygfinance.com` links as
 * `cygfinance.com`. Alternation is leftmost-first, so listing it earlier is what
 * settles it.
 *
 * The bare-domain branch matches loosely and is then filtered against COMMON_TLDS in
 * code — baking ~80 alternatives into the pattern would make it unreadable for no gain.
 */
const LINK_PATTERN = new RegExp(
  [
    /(?<scheme>https?:\/\/[^\s<>"']+)/.source,
    /(?<email>[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/
      .source,
    /(?<www>www\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:[/?#][^\s<>"']*)?)/.source,
    /(?<bare>[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?:[/?#][^\s<>"']*)?)/
      .source,
  ].join('|'),
  'g',
);

export interface LinkMatch {
  /** Index into the source string. */
  start: number;
  /** Exclusive. */
  end: number;
  /** Shown to the user exactly as they typed it — "hello.com", not the href. */
  text: string;
  /** Where the link goes: https:, http: or mailto:, never anything else. */
  href: string;
}

/**
 * Trim characters that belong to the sentence rather than the link.
 *
 * "see hello.com." must not link the full stop, and "(hello.com)" must not swallow the
 * closing paren — but `https://en.wikipedia.org/wiki/Foo_(bar)` has to keep its own,
 * which is why closers are only dropped when the match doesn't open them itself.
 *
 * Returns the length to keep.
 */
function trimTrailing(text: string): number {
  let end = text.length;
  while (end > 0) {
    const ch = text[end - 1];
    if (TRAILING_PUNCTUATION.has(ch)) {
      end--;
      continue;
    }
    const opener = CLOSERS[ch];
    if (opener) {
      const slice = text.slice(0, end);
      const opens = slice.split(opener).length - 1;
      const closes = slice.split(ch).length - 1;
      if (closes > opens) {
        end--;
        continue;
      }
    }
    break;
  }
  return end;
}

/** The last dot-separated label, lowercased — "com" for "mail.google.com". */
function topLevelDomain(host: string): string {
  const path = host.search(/[/?#]/);
  const bare = path === -1 ? host : host.slice(0, path);
  const labels = bare.split('.');
  return labels[labels.length - 1].toLowerCase();
}

/**
 * Every link in `text`, in order, with no overlaps.
 *
 * Bare domains and `www.` hosts get `https://` — the same rule the editor's own
 * Insert-Link button uses (RichTextEditor.tsx). The scheme is always one we construct,
 * never one copied out of the text, so `javascript:` and `data:` are unreachable here.
 */
export function findLinks(text: string): LinkMatch[] {
  const matches: LinkMatch[] = [];
  LINK_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = LINK_PATTERN.exec(text)) !== null) {
    const groups = match.groups ?? {};
    const start = match.index;

    // Guard against matching the tail of a longer token ("foo@bar.com" must not
    // yield "bar.com" if the email branch somehow didn't claim it first).
    if (start > 0 && BOUNDARY_BEFORE.test(text[start - 1])) continue;

    const raw = match[0];
    const keep = trimTrailing(raw);
    if (keep === 0) continue;
    const matched = raw.slice(0, keep);

    let href: string | null = null;
    if (groups.scheme) {
      href = matched;
    } else if (groups.email) {
      href = `mailto:${matched}`;
    } else if (groups.www) {
      href = `https://${matched}`;
    } else if (groups.bare && COMMON_TLDS.has(topLevelDomain(matched))) {
      href = `https://${matched}`;
    }
    if (!href) continue;

    matches.push({ start, end: start + matched.length, text: matched, href });

    // Trimming can leave the cursor past the kept text; rewind so a link that ends
    // in punctuation doesn't skip whatever follows it.
    LINK_PATTERN.lastIndex = start + matched.length;
  }

  return matches;
}

/** Split `text` into alternating plain and link pieces, in order. */
export function splitByLinks(
  text: string,
): Array<{ text: string; link: LinkMatch | null }> {
  const parts: Array<{ text: string; link: LinkMatch | null }> = [];
  let cursor = 0;
  for (const link of findLinks(text)) {
    if (link.start > cursor) {
      parts.push({ text: text.slice(cursor, link.start), link: null });
    }
    parts.push({ text: link.text, link });
    cursor = link.end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), link: null });
  return parts;
}

/**
 * Not `message-utils`' `escapeHtml`: this one also escapes `"`, because the output
 * lands in an `href="…"` attribute and not only in text content.
 */
function escapeAttrText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Plain text → escaped HTML with anchors. For the print window, which builds an HTML
 * string rather than React nodes. Everything is escaped first and the hrefs are ours,
 * so this can't smuggle markup through.
 */
export function linkifyEscapedText(text: string): string {
  return splitByLinks(text)
    .map(({ text: piece, link }) =>
      link
        ? `<a href="${escapeAttrText(link.href)}" target="_blank" rel="noopener noreferrer">${escapeAttrText(piece)}</a>`
        : escapeAttrText(piece),
    )
    .join('');
}
