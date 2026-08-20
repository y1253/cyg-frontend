import { useEffect, useRef, useState } from 'react';
import { findLinks } from './linkify';
import { useAttachmentViewer, type ViewerItem } from './AttachmentViewerContext';

// Kill the frame's own vertical scrollbar — the frame is sized to fit its content,
// so the page scrolls instead. Horizontal scroll stays available for wide emails.
const FRAME_RESET =
  '<style>html{overflow-y:hidden}body{margin:0;padding:8px}img{cursor:zoom-in}</style>';

const INITIAL_HEIGHT = 384;
const HEIGHT_BUFFER = 24;

// Below this, an image is a spacer, a bullet or a tracking pixel — not something
// anyone wants full-screen. Signature logos are above it and stay clickable,
// which is fine: opening one is harmless, and it is the only way to save an
// image that the body embeds rather than lists as an attachment.
const MIN_VIEWABLE_PX = 48;

// Text inside these never becomes a link: <a> is already one (and re-linking it would
// nest anchors), the rest isn't prose. <pre>/<code> are NOT here — a URL in a
// monospace block is still a URL, and Gmail links those too.
const NO_LINK_INSIDE = new Set(['A', 'SCRIPT', 'STYLE', 'TEXTAREA', 'TITLE']);

/**
 * Make links work inside a rendered message body.
 *
 * Two jobs, both against the frame's LIVE document rather than the HTML string:
 *
 * 1. Point every existing anchor at a new tab. Emails get this from the `<base>` tag
 *    injected upstream, but internal messages don't — a link a colleague added with
 *    the editor's Link button would otherwise load inside this little frame.
 * 2. Linkify bare URLs sitting in text nodes.
 *
 * Doing it here rather than by transforming the HTML string is deliberate: a
 * DOMParser round-trip that returns `body.innerHTML` (the way `sanitizeForwardHtml`
 * does) drops `<style>`, which would strip the styling out of every HTML email we
 * display, and would also swallow the injected `<base>`.
 *
 * Idempotent — the second pass finds nothing because it skips text inside anchors.
 */
function enhanceLinks(doc: Document): void {
  if (!doc.body) return;

  doc.querySelectorAll('a').forEach((anchor) => {
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
  });

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      for (let el = node.parentElement; el; el = el.parentElement) {
        if (NO_LINK_INSIDE.has(el.tagName)) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  // Collect before mutating — replacing nodes mid-walk invalidates the walker.
  const targets: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    targets.push(node as Text);
  }

  for (const node of targets) {
    const text = node.nodeValue ?? '';
    const links = findLinks(text);
    if (links.length === 0) continue;

    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    for (const link of links) {
      if (link.start > cursor) {
        fragment.append(doc.createTextNode(text.slice(cursor, link.start)));
      }
      const anchor = doc.createElement('a');
      // `href` is always one we built (https/http/mailto), never copied out of the
      // text, so no javascript:/data: URL can reach this.
      anchor.href = link.href;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = link.text;
      fragment.append(anchor);
      cursor = link.end;
    }
    if (cursor < text.length) {
      fragment.append(doc.createTextNode(text.slice(cursor)));
    }
    node.replaceWith(fragment);
  }
}

/**
 * Turn one of our own attachment URLs into its force-a-download twin.
 *
 * Returns undefined for anything else (a remote image, a data: URL), which the
 * viewer reads as "no separate download URL" and falls back to the src itself.
 */
function downloadVariantOf(src: string): string | undefined {
  try {
    const u = new URL(src, window.location.origin);
    // Every attachment URL we build carries the JWT as a query param; a tracking
    // pixel from example.com does not.
    if (!u.searchParams.has('token')) return undefined;
    u.searchParams.set('disposition', 'attachment');
    return u.toString();
  } catch {
    return undefined;
  }
}

function viewerItemForImage(img: HTMLImageElement): ViewerItem | null {
  const url = img.currentSrc || img.src;
  if (!url) return null;
  let filename = img.getAttribute('alt')?.trim() || '';
  let mimeType = 'image/*';
  try {
    const params = new URL(url, window.location.origin).searchParams;
    filename = params.get('filename') || filename;
    mimeType = params.get('mimeType') || mimeType;
  } catch {
    // a data: URL or similar — the alt text is the best name available
  }
  return {
    url,
    downloadUrl: downloadVariantOf(url),
    mimeType,
    filename: filename || 'image',
    kind: 'image',
  };
}

/**
 * Make an image embedded in the body openable and downloadable.
 *
 * An image the HTML references with `cid:` is deliberately kept out of the
 * attachment strip (otherwise every signature logo becomes a tile), which left it
 * with no download affordance at all — it rendered here and nowhere else. Clicking
 * it now opens the same app-level viewer the attachment tiles use, and that viewer
 * carries a Download button.
 *
 * Delegated rather than per-image so it survives images that load or change after
 * this runs, and so there is exactly one listener to clean up.
 */
function enhanceImages(
  doc: Document,
  open: (item: ViewerItem) => void,
): () => void {
  const onClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target || target.tagName !== 'IMG') return;
    const img = target as HTMLImageElement;
    // An image wrapped in a link is a button — let the anchor win.
    if (img.closest('a')) return;
    // naturalWidth is 0 while the image is still loading; don't reject on that.
    if (
      img.naturalWidth > 0 &&
      img.naturalWidth < MIN_VIEWABLE_PX &&
      img.naturalHeight < MIN_VIEWABLE_PX
    ) {
      return;
    }
    const item = viewerItemForImage(img);
    if (!item) return;
    event.preventDefault();
    open(item);
  };

  doc.addEventListener('click', onClick);
  return () => doc.removeEventListener('click', onClick);
}

// Renders an email body in a sandboxed iframe whose height tracks its content, so a
// long email lays out at full height instead of scrolling inside a fixed-size box.
// `html` must already be run through injectBaseTarget/rewriteInlineImages.
export function EmailBodyFrame({ html, title = 'Email body' }: { html: string; title?: string }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(INITIAL_HEIGHT);
  const { open: openViewer } = useAttachmentViewer();

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let observer: ResizeObserver | null = null;
    let detachImages: (() => void) | null = null;

    const measure = () => {
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      // Measure the BODY only. documentElement.scrollHeight stretches to the
      // iframe's own height, so folding it into a max() made the frame able to
      // grow but never shrink — every short message stayed stuck at
      // INITIAL_HEIGHT. body.scrollHeight still reports the full height when the
      // content overflows, so tall emails are unaffected.
      const content = Math.max(doc.body.scrollHeight, doc.body.offsetHeight);
      if (content <= 0) return;
      const next = content + HEIGHT_BUFFER;
      // Resizing the frame reflows the document, which re-fires the observer — only
      // react to real changes so the two don't chase each other.
      setHeight((prev) => (Math.abs(prev - next) > 2 ? next : prev));
    };

    const attach = () => {
      const doc = frame.contentDocument;
      if (!doc?.documentElement) return;
      // Before measuring: turning a long URL into an anchor can change how the text
      // wraps, and therefore the height we're about to report.
      enhanceLinks(doc);
      detachImages?.();
      detachImages = enhanceImages(doc, openViewer);
      measure();
      observer?.disconnect();
      observer = new ResizeObserver(measure);
      observer.observe(doc.documentElement);
    };

    frame.addEventListener('load', attach);
    // srcDoc can finish before this effect runs — don't wait for a load that already fired.
    if (frame.contentDocument?.readyState === 'complete') attach();

    return () => {
      frame.removeEventListener('load', attach);
      observer?.disconnect();
      detachImages?.();
    };
  }, [html, openViewer]);

  return (
    <iframe
      ref={frameRef}
      srcDoc={FRAME_RESET + html}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="w-full border-0 block"
      style={{ height }}
      title={title}
    />
  );
}
