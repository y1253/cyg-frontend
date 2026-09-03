import { useGmailEmail } from '@/hooks/useGmailEmail';
import { stableEmailAttachmentUrl } from '@/lib/attachment-url';
import { AttachmentPreview } from '../AttachmentPreview';
import {
  ForwardPreviewCard,
  ForwardPreviewLoading,
  ForwardPreviewMissing,
} from '../ForwardPreviewCard';
import { injectBaseTarget, rewriteInlineImages } from './email-html';

/**
 * Inline preview of a sent forwarded message, shown under a forward banner entry.
 * Fetches the sent copy by its stored id (immutable=true so Outlook ids resolve)
 * and renders it through the shared card, reusing the email-body pipeline.
 */
export function ForwardPreview({
  companyId,
  messageId,
  token,
}: {
  companyId: number;
  messageId: string;
  token: string | null;
}) {
  const { data: fwd, isLoading, isError } = useGmailEmail(companyId, messageId, true);

  if (isLoading) return <ForwardPreviewLoading />;
  if (isError || !fwd) return <ForwardPreviewMissing />;

  const strip = (fwd.attachments ?? []).filter((a) => !a.isInline);
  return (
    <ForwardPreviewCard
      from={fwd.from}
      to={fwd.to}
      cc={fwd.cc}
      date={fwd.date}
      bodyHtml={
        fwd.bodyHtml
          ? injectBaseTarget(
              rewriteInlineImages(fwd.bodyHtml, fwd.attachments ?? [], (att) =>
                stableEmailAttachmentUrl(token ?? '', companyId, fwd.id, att, 'inline'),
              ),
            )
          : null
      }
      bodyText={fwd.bodyText}
      attachments={
        strip.length > 0
          ? strip.map((att) => (
              <AttachmentPreview
                // The file's own identity, not Gmail's ephemeral attachmentId —
                // same reason as ThreadMessage. `useGmailEmail` does not poll,
                // but any cache invalidation would otherwise remount these.
                key={`${fwd.id}:${att.filename}:${att.size ?? 0}`}
                url={stableEmailAttachmentUrl(token ?? '', companyId, fwd.id, att, 'inline')}
                downloadUrl={stableEmailAttachmentUrl(token ?? '', companyId, fwd.id, att, 'attachment')}
                mimeType={att.mimeType}
                filename={att.filename}
                size={att.size}
              />
            ))
          : undefined
      }
    />
  );
}
