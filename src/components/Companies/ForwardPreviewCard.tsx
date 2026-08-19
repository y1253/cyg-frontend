import type { ReactNode } from 'react';
import { EmailBodyFrame } from './EmailBodyFrame';
import { Linkified } from './Linkified';
import { formatEmailDate } from './message-utils';

/**
 * What was actually sent on a forward, expanded inline under the forward banner.
 *
 * Presentation only — both call sites fetch their own copy of the message and
 * build their own attachment URLs (Gmail/Graph attachment ids for a company
 * mailbox, our own attachment route for an internal message), then hand the
 * result here. Previously this card existed twice, and the internal copy's own
 * comment admitted it was mirroring the other.
 */
export function ForwardPreviewCard({
  from,
  to,
  cc,
  date,
  bodyHtml,
  bodyText,
  attachments,
}: {
  from: string;
  to: string;
  cc?: string | null;
  date: string;
  /** Already run through the caller's inline-image / base-target rewrites. */
  bodyHtml?: string | null;
  bodyText?: string | null;
  /** Rendered <AttachmentPreview> tiles — the URL scheme differs per source. */
  attachments?: ReactNode;
}) {
  return (
    <div className="mt-1 border rounded-md bg-muted/10 p-3 flex flex-col gap-2">
      <div className="text-xs text-muted-foreground space-y-0.5">
        <div><span className="font-medium">From:</span> {from}</div>
        <div><span className="font-medium">To:</span> {to}</div>
        {cc && <div><span className="font-medium">Cc:</span> {cc}</div>}
        <div><span className="font-medium">Date:</span> {formatEmailDate(date)}</div>
      </div>
      {attachments && <div className="flex flex-wrap gap-3">{attachments}</div>}
      <div className="border rounded-md overflow-hidden bg-background">
        {bodyHtml ? (
          <EmailBodyFrame html={bodyHtml} />
        ) : (
          <pre className="p-4 text-sm whitespace-pre-wrap font-sans">
            <Linkified text={bodyText ?? '(empty)'} />
          </pre>
        )}
      </div>
    </div>
  );
}

/** Shared loading / gone states, so both wrappers say the same thing. */
export function ForwardPreviewLoading() {
  return <div className="text-xs text-muted-foreground py-2">Loading forwarded message…</div>;
}

export function ForwardPreviewMissing() {
  return (
    <div className="text-xs text-muted-foreground py-2">
      This forwarded message is no longer available.
    </div>
  );
}
