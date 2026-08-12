import { splitByLinks } from './linkify';

/**
 * Plain message text with its URLs, bare domains and email addresses made clickable.
 *
 * Emits React elements rather than an HTML string, so the surrounding text is escaped
 * by React itself — this path introduces no `dangerouslySetInnerHTML` anywhere. Used
 * for every body we render as text: chat and Teams bubbles, plain-text email bodies,
 * and internal messages. HTML bodies are handled in EmailBodyFrame instead, against
 * the live iframe document.
 *
 * Whitespace and newlines come through untouched because every call site already sits
 * inside a `whitespace-pre-wrap` container.
 */
export function Linkified({
  text,
  /**
   * Anchor styling. Defaults to the blue underline the editor uses for links
   * (RichTextEditor). Own chat bubbles are teal with white text, where blue is
   * unreadable — they pass their own classes.
   */
  className = 'text-blue-600 underline hover:text-blue-700',
}: {
  text: string;
  className?: string;
}) {
  const parts = splitByLinks(text);

  return (
    <>
      {parts.map((part, i) =>
        part.link ? (
          <a
            key={i}
            href={part.link.href}
            target="_blank"
            rel="noopener noreferrer"
            // `break-words` so a long URL wraps instead of pushing a 75%-wide chat
            // bubble past the edge of the thread.
            className={`break-words ${className}`}
          >
            {part.text}
          </a>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
