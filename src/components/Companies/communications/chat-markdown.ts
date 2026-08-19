/**
 * Convert the chat editor's HTML into Google Chat's formatting tokens
 * (*bold*, _italic_, ~strike~, "- " bullets). Chat has no HTML — it renders
 * these tokens — so we serialize the WYSIWYG editor output on send.
 *
 * Teams takes HTML directly and never goes through here.
 */
export function htmlToChatMarkdown(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;

  const walk = (node: Node): string => {
    let out = '';
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? '';
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === 'br') {
        out += '\n';
        return;
      }
      if (tag === 'ul' || tag === 'ol') {
        const lis = Array.from(el.children).filter(
          (c) => c.tagName.toLowerCase() === 'li',
        );
        lis.forEach((li, i) => {
          const liText = walk(li).trim();
          out += (tag === 'ul' ? '- ' : `${i + 1}. `) + liText + '\n';
        });
        return;
      }
      let inner = walk(el);
      const style = el.getAttribute('style') ?? '';
      const isBold =
        tag === 'b' || tag === 'strong' || /font-weight\s*:\s*(bold|[6-9]00)/i.test(style);
      const isItalic = tag === 'i' || tag === 'em' || /font-style\s*:\s*italic/i.test(style);
      const isStrike =
        tag === 's' || tag === 'strike' || tag === 'del' || /line-through/i.test(style);
      if (isBold) inner = `*${inner}*`;
      if (isItalic) inner = `_${inner}_`;
      if (isStrike) inner = `~${inner}~`;
      // Block-level elements start on their own line.
      out += tag === 'div' || tag === 'p' ? inner + '\n' : inner;
    });
    return out;
  };

  return walk(container)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');
}
