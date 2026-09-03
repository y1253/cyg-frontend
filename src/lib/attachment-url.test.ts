import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailAttachment } from '@/api/gmail';

/**
 * Freezing an attachment url across refetches.
 *
 * Gmail rotates `attachmentId` on every `threads.get`, and the 15s thread poll turned
 * that into a mutating `<img src>` — the browser dropped the decoded frame and
 * re-downloaded, which is the blink. These tests pin both halves of the contract: the
 * id is allowed to drift, and NOTHING ELSE is.
 */

// Rebuilt per test so the module-level cache starts empty.
async function load() {
  vi.resetModules();
  return import('./attachment-url');
}

const att = (over: Partial<EmailAttachment> = {}): EmailAttachment => ({
  filename: 'invoice.pdf',
  mimeType: 'application/pdf',
  size: 1234,
  attachmentId: 'id-1',
  contentId: null,
  isInline: false,
  ...over,
});

describe('stableEmailAttachmentUrl', () => {
  beforeEach(() => vi.resetModules());

  it('returns the same url after Gmail rotates the attachmentId', async () => {
    const { stableEmailAttachmentUrl } = await load();
    const first = stableEmailAttachmentUrl('tok', 1, 'msg', att(), 'inline');
    const second = stableEmailAttachmentUrl(
      'tok',
      1,
      'msg',
      att({ attachmentId: 'id-2-rotated' }),
      'inline',
    );
    expect(second).toBe(first); // identical string, so the <img> src never changes
    expect(second).toContain('id-1');
  });

  it('keeps inline and attachment dispositions apart', async () => {
    const { stableEmailAttachmentUrl } = await load();
    const inline = stableEmailAttachmentUrl('tok', 1, 'msg', att(), 'inline');
    const download = stableEmailAttachmentUrl('tok', 1, 'msg', att(), 'attachment');
    expect(inline).not.toBe(download);
    expect(inline).toContain('disposition=inline');
    expect(download).toContain('disposition=attachment');
  });

  it('treats two files of the same name but different size as different files', async () => {
    const { stableEmailAttachmentUrl } = await load();
    const a = stableEmailAttachmentUrl('tok', 1, 'msg', att({ size: 10 }), 'inline');
    const b = stableEmailAttachmentUrl('tok', 1, 'msg', att({ size: 20 }), 'inline');
    expect(a).not.toBe(b);
  });

  it('does not share an entry across messages or companies', async () => {
    const { stableEmailAttachmentUrl } = await load();
    const a = stableEmailAttachmentUrl('tok', 1, 'msg-a', att(), 'inline');
    const b = stableEmailAttachmentUrl('tok', 1, 'msg-b', att(), 'inline');
    const c = stableEmailAttachmentUrl('tok', 2, 'msg-a', att(), 'inline');
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('RE-MINTS when the token changes — a frozen dead token would 401 forever', async () => {
    const { stableEmailAttachmentUrl } = await load();
    const before = stableEmailAttachmentUrl('old-token', 1, 'msg', att(), 'inline');
    const after = stableEmailAttachmentUrl('new-token', 1, 'msg', att(), 'inline');
    expect(after).not.toBe(before);
    expect(after).toContain('new-token');
  });

  it('re-mints when the api base changes under it', async () => {
    // The base comes from a module-level provider map that fills in asynchronously. A
    // component rendering first gets the Gmail base by default; an Outlook company
    // must not stay frozen on the wrong host.
    vi.resetModules();
    const gmail = await import('@/api/gmail');
    const { stableEmailAttachmentUrl } = await import('./attachment-url');

    const first = stableEmailAttachmentUrl('tok', 77, 'msg', att(), 'inline');
    expect(first).toContain('/api/gmail/');

    gmail.setCompanyProvider(77, 'MICROSOFT');
    const second = stableEmailAttachmentUrl('tok', 77, 'msg', att(), 'inline');
    expect(second).toContain('/api/microsoft/');
  });

  it('is stable when called repeatedly, which is what every render does', async () => {
    const { stableEmailAttachmentUrl } = await load();
    const urls = Array.from({ length: 20 }, (_, i) =>
      stableEmailAttachmentUrl('tok', 1, 'msg', att({ attachmentId: `id-${i}` }), 'inline'),
    );
    expect(new Set(urls).size).toBe(1);
  });
});
