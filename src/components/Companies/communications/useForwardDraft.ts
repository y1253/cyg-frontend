import { useRef, useState } from 'react';
import { emailAttachmentUrl } from '@/api/gmail';
import type { EmailAttachment, EmailDetail } from '@/api/gmail';
import {
  MAX_FILE_BYTES,
  SIGNATURE_LEAD,
  buildForwardQuote,
  buildForwardedBody,
  prefixFwdSubject,
  replaceForwardQuote,
} from '../message-utils';

export type ForwardScope = 'message' | 'thread';
export type ForwardForm = { to: string[]; subject: string; body: string; cc: string[] };

// Same ceiling as a manually picked file — a large original is re-uploaded and
// linked from Drive/OneDrive rather than dropped from the forward.
const MAX_FORWARD_FILE_BYTES = MAX_FILE_BYTES;

// Multer caps a single form field at 25 MB (OUTBOUND_MULTER_LIMITS). A quoted
// conversation can approach that, since every reply usually embeds the messages
// before it — so fall back to header-only stubs for the older messages rather
// than let the send fail at the far end.
export const FORWARD_BODY_BUDGET = 20 * 1024 * 1024;

/** Dedupe key. Not `attachmentId`: the same physical file quoted down a thread
 *  gets a different id in every message. `contentId` is stable for inline parts
 *  (a signature logo), so prefer it when present. */
const attachKey = (att: EmailAttachment) =>
  att.contentId
    ? `cid:${att.contentId}`
    : `${att.filename}:${att.size}:${att.mimeType}`;

/**
 * Everything the inline forward form needs: its draft, the originals it pulls back
 * down and re-uploads, and the scope switch between "this message" and the whole
 * conversation.
 *
 * `nativeQuote` (Outlook) changes two things — the server builds the quoted block
 * itself via Graph's createForward, and Graph re-attaches the originals — so the
 * hydration below is skipped for a single-message Outlook forward and re-enabled
 * the moment the scope widens to the whole thread, which createForward can't do.
 */
export function useForwardDraft({
  companyId,
  token,
  nativeQuote,
  signatureHtml,
  threadEmails,
  onResetPolish,
}: {
  companyId: number;
  token: string | null;
  nativeQuote: boolean;
  signatureHtml: string | undefined;
  /** The loaded conversation, used when the scope is 'thread'. */
  threadEmails: EmailDetail[];
  onResetPolish: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ForwardForm>({ to: [], subject: '', body: '', cc: [] });
  const [files, setFiles] = useState<File[]>([]);
  const [attLoading, setAttLoading] = useState(false);
  const [attError, setAttError] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [source, setSource] = useState<EmailDetail | null>(null);
  // Whether the forward carries just the opened message or the whole back-and-forth.
  // 'thread' quotes every message in `threadEmails` and pulls attachments from all
  // of them.
  const [scope, setScope] = useState<ForwardScope>('message');

  // Bumped on every forward open AND every scope switch — an in-flight attachment
  // fetch whose token no longer matches has been superseded (dialog closed, reopened
  // elsewhere, or the user changed how much of the conversation to send).
  const reqRef = useRef(0);
  // `name:size` keys of the files hydrated from the original messages. Everything
  // else in `files` was picked by hand and must survive a scope switch.
  const autoKeysRef = useRef<Set<string>>(new Set());

  const close = () => {
    reqRef.current++;
    setOpen(false);
    setForm({ to: [], subject: '', body: '', cc: [] });
    setFiles([]);
    setSkipped([]);
    setAttError(false);
    setAttLoading(false);
    setSource(null);
    setScope('message');
    autoKeysRef.current = new Set();
    onResetPolish();
  };

  /** The messages a forward carries, in conversation order. */
  const forwardMessages = (s: ForwardScope, src: EmailDetail | null) =>
    s === 'thread' && threadEmails.length > 0 ? threadEmails : src ? [src] : [];

  // Pull the original attachments back down through the authed attachment
  // endpoint (the JWT rides in the query string) and turn them into Files so
  // they re-upload with the forward. Inline images come along too — their
  // `cid:` <img> tags were stripped from the quoted body.
  //
  // Takes the whole set of messages being forwarded, because each attachment has
  // to be fetched with ITS OWN message id: Gmail scopes attachment ids to their
  // message, and Graph's path is /me/messages/{messageId}/attachments/{id}.
  const hydrateAttachments = async (details: EmailDetail[], reqId: number) => {
    const candidates: { message: EmailDetail; att: EmailAttachment }[] = [];
    const seenKeys = new Set<string>();
    // Real files before inline ones, so a signature logo repeated down the thread
    // can't consume the 10-file cap ahead of an actual document.
    for (const inlinePass of [false, true]) {
      for (const message of details) {
        for (const att of message.attachments ?? []) {
          if (!!att.isInline !== inlinePass) continue;
          const key = attachKey(att);
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          candidates.push({ message, att });
        }
      }
    }
    if (candidates.length === 0) return;

    const tooBig = candidates.filter((c) => c.att.size > MAX_FORWARD_FILE_BYTES);
    // No count cap on outbound email, so every attachment under the per-file
    // ceiling is forwarded; only oversized ones are skipped.
    const keep = candidates.filter((c) => c.att.size <= MAX_FORWARD_FILE_BYTES);
    const skippedNames = tooBig.map((c) => c.att.filename || 'attachment');
    if (skippedNames.length) setSkipped(skippedNames);
    if (keep.length === 0) return;

    setAttLoading(true);
    try {
      const fetched = await Promise.all(
        keep.map(async ({ message, att }) => {
          const res = await fetch(
            emailAttachmentUrl(token ?? '', companyId, message.id, att, 'attachment'),
          );
          if (!res.ok) throw new Error('Failed to fetch attachment');
          const blob = await res.blob();
          return new File([blob], att.filename || 'attachment', { type: att.mimeType });
        }),
      );
      if (reqRef.current !== reqId) return; // superseded
      const nextKeys = new Set(fetched.map((f) => `${f.name}:${f.size}`));
      // Merge, don't replace: this lands asynchronously, and anything the user
      // attached manually while the originals were downloading would otherwise be
      // silently discarded. Originals first, then the user's picks, capped.
      //
      // Files hydrated for a PREVIOUS scope are dropped rather than kept — without
      // the auto-key set they'd look like manual picks, so switching from the whole
      // conversation back to one message would strand the other messages' files.
      setFiles((prev) => {
        const auto = autoKeysRef.current;
        const manual = prev.filter((f) => {
          const key = `${f.name}:${f.size}`;
          return !nextKeys.has(key) && !auto.has(key);
        });
        return [...fetched, ...manual];
      });
      autoKeysRef.current = nextKeys;
    } catch {
      if (reqRef.current !== reqId) return;
      setAttError(true);
    } finally {
      if (reqRef.current === reqId) setAttLoading(false);
    }
  };

  const openFor = (detail: EmailDetail) => {
    const reqId = ++reqRef.current;
    setForm({
      to: [],
      cc: [],
      subject: prefixFwdSubject(detail.subject || ''),
      body: nativeQuote
        ? signatureHtml
          ? `${SIGNATURE_LEAD}${signatureHtml}`
          : ''
        : buildForwardedBody(detail, signatureHtml ?? ''),
    });
    setFiles([]);
    setSkipped([]);
    setAttError(false);
    setSource(detail);
    // Always reopen on the single message — the per-message Forward button
    // re-enters here, and inheriting the previous scope would silently change what
    // gets sent.
    setScope('message');
    autoKeysRef.current = new Set();
    setOpen(true);
    onResetPolish();
    // Non-blocking: the dialog is usable while attachments stream in. Skipped for
    // Outlook — createForward already carries the originals, so re-uploading them
    // would attach every file twice.
    if (!nativeQuote) void hydrateAttachments([detail], reqId);
  };

  // Switch between forwarding the opened message and the whole conversation.
  // Rebuilds only the quoted block: the caret space, the signature (which the user
  // may have edited) and anything they've typed all sit above the marker and are
  // preserved verbatim.
  const changeScope = (next: ForwardScope) => {
    if (next === scope) return;
    const messages = forwardMessages(next, source);
    setScope(next);
    setForm((f) => ({
      ...f,
      body: replaceForwardQuote(
        f.body,
        // Outlook's single-message draft carries no quote at all — the server adds
        // it — so switching back to 'message' there removes ours again.
        next === 'message' && nativeQuote ? '' : buildForwardQuote(messages),
      ),
    }));
    // Supersede the previous scope's downloads before starting this scope's.
    const reqId = ++reqRef.current;
    setSkipped([]);
    setAttError(false);
    if (next === 'thread' || !nativeQuote) {
      void hydrateAttachments(messages, reqId);
    } else {
      // Back to Outlook's native forward: Graph re-attaches the originals itself.
      setFiles((prev) => prev.filter((f) => !autoKeysRef.current.has(`${f.name}:${f.size}`)));
      autoKeysRef.current = new Set();
    }
  };

  /** The body to actually send, with older messages stubbed if it blew the budget. */
  const bodyForSend = (): string => {
    if (form.body.length <= FORWARD_BODY_BUDGET) return form.body;
    const messages = forwardMessages(scope, source);
    const newest = messages[messages.length - 1];
    return replaceForwardQuote(
      form.body,
      buildForwardQuote(
        messages.map((m) => (m === newest ? m : { ...m, bodyHtml: null, bodyText: m.snippet })),
      ),
    );
  };

  return {
    open,
    form,
    setForm,
    files,
    setFiles,
    attLoading,
    attError,
    skipped,
    source,
    scope,
    openFor,
    close,
    changeScope,
    bodyForSend,
    forwardMessages,
  };
}
