import { describe, expect, it } from 'vitest';
import { findLinks, linkifyEscapedText, splitByLinks } from './linkify';

/** The hrefs found in `text`, in order — the shape most assertions care about. */
const hrefs = (text: string) => findLinks(text).map((l) => l.href);
/** The visible text of each link, i.e. what stays on screen. */
const shown = (text: string) => findLinks(text).map((l) => l.text);

describe('findLinks — what links', () => {
  it('links a bare domain in an allowed TLD', () => {
    expect(hrefs('go to hello.com now')).toEqual(['https://hello.com']);
    expect(shown('go to hello.com now')).toEqual(['hello.com']);
  });

  it('links a www host with no scheme', () => {
    expect(hrefs('www.example.ca')).toEqual(['https://www.example.ca']);
  });

  it('keeps an explicit scheme untouched', () => {
    expect(hrefs('http://example.com/x')).toEqual(['http://example.com/x']);
  });

  it('links a path, query and fragment', () => {
    expect(hrefs('cygfinance.com/portal?id=1#top')).toEqual([
      'https://cygfinance.com/portal?id=1#top',
    ]);
  });

  it('links a subdomain', () => {
    expect(hrefs('mail.google.com')).toEqual(['https://mail.google.com']);
  });

  it('links a schemed URL even when its TLD is not in the allowlist', () => {
    // The allowlist only gates BARE domains — an explicit scheme is unambiguous.
    expect(hrefs('https://foo.internal/x')).toEqual(['https://foo.internal/x']);
  });

  it('turns an email address into a mailto link', () => {
    expect(hrefs('mail chaim@cygfinance.com please')).toEqual([
      'mailto:chaim@cygfinance.com',
    ]);
  });

  it('finds several links in one string', () => {
    expect(hrefs('hello.com and www.example.ca and a@b.com')).toEqual([
      'https://hello.com',
      'https://www.example.ca',
      'mailto:a@b.com',
    ]);
  });
});

describe('findLinks — what must NOT link', () => {
  it.each([
    ['deploy.sh', 'a real TLD, but far more often a shell script'],
    ['steps.md', 'likewise a markdown file'],
    ['report.xlsx', 'not a TLD'],
    ['Node.js', 'not a TLD'],
    ['v1.2', 'numeric last label'],
    ['3.5', 'numeric'],
    ['1.000,00', 'formatted number'],
    ['e.g.', 'single-letter last label'],
    ['see the file.zip attached', 'zip is excluded on purpose'],
  ])('leaves %s alone (%s)', (input) => {
    expect(findLinks(input)).toEqual([]);
  });

  it('does not pull the domain out of an email address', () => {
    // The email branch has to win, or this yields "cygfinance.com" instead.
    expect(hrefs('chaim@cygfinance.com')).toEqual(['mailto:chaim@cygfinance.com']);
  });

  it('returns nothing for text with no links', () => {
    expect(findLinks('just some ordinary words')).toEqual([]);
    expect(findLinks('')).toEqual([]);
  });
});

describe('findLinks — punctuation around a link', () => {
  it('leaves a sentence-ending full stop outside the link', () => {
    expect(shown('see hello.com.')).toEqual(['hello.com']);
  });

  it('leaves a trailing comma outside the link', () => {
    expect(shown('hello.com, then')).toEqual(['hello.com']);
  });

  it('does not swallow a wrapping paren', () => {
    expect(shown('(hello.com)')).toEqual(['hello.com']);
    expect(shown('(https://example.com)')).toEqual(['https://example.com']);
  });

  it("keeps a URL's own balanced parens", () => {
    const url = 'https://en.wikipedia.org/wiki/Foo_(bar)';
    expect(shown(`see ${url} ok`)).toEqual([url]);
  });

  it('keeps scanning after a trimmed link', () => {
    // The trim rewinds the scanner; if that went wrong the second link would be lost.
    expect(hrefs('hello.com. also example.org.')).toEqual([
      'https://hello.com',
      'https://example.org',
    ]);
  });

  it('trims other sentence punctuation', () => {
    expect(shown('really? hello.com!')).toEqual(['hello.com']);
    expect(shown('list: hello.com;')).toEqual(['hello.com']);
  });
});

describe('splitByLinks', () => {
  it('interleaves plain text with links and loses nothing', () => {
    const text = 'go to hello.com now';
    const parts = splitByLinks(text);
    expect(parts.map((p) => p.text).join('')).toBe(text);
    expect(parts.map((p) => p.link !== null)).toEqual([false, true, false]);
  });

  it('returns one plain part when there is no link', () => {
    expect(splitByLinks('nothing here')).toEqual([
      { text: 'nothing here', link: null },
    ]);
  });

  it('handles a link at the very start and end', () => {
    const parts = splitByLinks('hello.com');
    expect(parts).toHaveLength(1);
    expect(parts[0].link?.href).toBe('https://hello.com');
  });
});

describe('linkifyEscapedText', () => {
  it('escapes the surrounding text', () => {
    expect(linkifyEscapedText('a < b & c')).toBe('a &lt; b &amp; c');
  });

  it('wraps a link in an anchor that opens a new tab', () => {
    expect(linkifyEscapedText('hello.com')).toBe(
      '<a href="https://hello.com" target="_blank" rel="noopener noreferrer">hello.com</a>',
    );
  });

  it('cannot be used to inject markup', () => {
    const out = linkifyEscapedText('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });
});
