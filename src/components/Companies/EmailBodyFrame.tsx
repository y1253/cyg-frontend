import { useEffect, useRef, useState } from 'react';

// Kill the frame's own vertical scrollbar — the frame is sized to fit its content,
// so the page scrolls instead. Horizontal scroll stays available for wide emails.
const FRAME_RESET = '<style>html{overflow-y:hidden}body{margin:0;padding:8px}</style>';

const INITIAL_HEIGHT = 384;
const HEIGHT_BUFFER = 24;

// Renders an email body in a sandboxed iframe whose height tracks its content, so a
// long email lays out at full height instead of scrolling inside a fixed-size box.
// `html` must already be run through injectBaseTarget/rewriteInlineImages.
export function EmailBodyFrame({ html, title = 'Email body' }: { html: string; title?: string }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(INITIAL_HEIGHT);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let observer: ResizeObserver | null = null;

    const measure = () => {
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      const content = Math.max(doc.body.scrollHeight, doc.documentElement?.scrollHeight ?? 0);
      if (content <= 0) return;
      const next = content + HEIGHT_BUFFER;
      // Resizing the frame reflows the document, which re-fires the observer — only
      // react to real changes so the two don't chase each other.
      setHeight((prev) => (Math.abs(prev - next) > 2 ? next : prev));
    };

    const attach = () => {
      const doc = frame.contentDocument;
      if (!doc?.documentElement) return;
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
    };
  }, [html]);

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
