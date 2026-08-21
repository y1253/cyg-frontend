import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Forward, MailOpen, Printer, Reply } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EmailDetail, GmailAccount } from '@/api/gmail';
import { emailAttachmentUrl } from '@/api/gmail';
import { useGmailContacts } from '@/hooks/useGmailContacts';
import { useGmailEmail } from '@/hooks/useGmailEmail';
import { useGmailEmailThread } from '@/hooks/useGmailEmailThread';
import { useSendEmail } from '@/hooks/useSendEmail';
import { useMarkEmailUnread } from '@/hooks/useMarkEmailUnread';
import { useDraftPolish } from '@/hooks/useDraftPolish';
import { InlineComposerPanel } from '../InlineComposerPanel';
import { RecipientAutocomplete } from '../RecipientAutocomplete';
import {
  SIGNATURE_LEAD,
  extractEmail,
  formatEmailDate,
  htmlToText,
  mergeAttachments,
  openPrintWindow,
  prefixReSubject,
  splitSignature,
  textToHtml,
} from '../message-utils';
import { ThreadMessage } from './ThreadMessage';
import { buildEmailThreadPrintHtml } from './print-html';
import { FORWARD_BODY_BUDGET, useForwardDraft } from './useForwardDraft';
import type { CompleteTarget } from './types';

type ReplyForm = { to: string[]; subject: string; body: string; cc: string[] };

/**
 * An opened email conversation: the whole thread, with the message the user
 * clicked expanded and everything newer than it dimmed as the "future" of that
 * moment.
 *
 * Reply and forward drafts live here rather than in the shell. This view mounts
 * when a message is opened and unmounts on Back, which is exactly the reset that
 * `handleOpenEmail` and the Back handler used to perform by hand.
 *
 * ⚠️ Do NOT key this component on `selectedMsgId`. Re-anchoring to an earlier
 * message deliberately moves that id while the view stays mounted; a key would
 * remount and destroy the scroll offset and the expand bookkeeping.
 */
export function EmailThreadView({
  companyId,
  token,
  account,
  accountAddress,
  provider,
  active,
  pollEnabled,
  selectedMsgId,
  selectedThreadId,
  selectedMsgIsRead,
  inboxIsCompleted,
  cloudLabel,
  onAnchorChange,
  onClose,
  onRequestComplete,
  onUncomplete,
}: {
  companyId: number;
  token: string | null;
  account: GmailAccount;
  accountAddress: string;
  provider: 'GOOGLE' | 'MICROSOFT';
  active: boolean;
  /** False while the tab is hidden or an attachment preview is open. */
  pollEnabled: boolean;
  selectedMsgId: string;
  /** Captured from the clicked row so the whole thread loads in one request. */
  selectedThreadId: string | null;
  selectedMsgIsRead: boolean;
  inboxIsCompleted: boolean;
  cloudLabel: string;
  /** Re-anchor the conversation to an earlier message. */
  onAnchorChange: (id: string) => void;
  onClose: () => void;
  onRequestComplete: (target: CompleteTarget) => void;
  onUncomplete: (kind: 'email' | 'chat', id: string) => void;
}) {
  // Ids of the thread messages currently expanded (Gmail-style: older replies
  // collapsed, latest expanded). Click a message header to toggle.
  const [expandedThreadIds, setExpandedThreadIds] = useState<Set<string>>(new Set());
  // Sent-forward message ids whose inline preview is expanded (clicked from a
  // forwarded-banner entry).
  const [expandedForwardIds, setExpandedForwardIds] = useState<Set<string>>(new Set());
  const [replyOpen, setReplyOpen] = useState(false);
  // The message this reply answers, captured when the form opened. Held rather
  // than recomputed at send time: the thread polls every 15s, and a message
  // arriving mid-compose must not move the target out from under the user.
  const [replyTarget, setReplyTarget] = useState<EmailDetail | null>(null);
  const [replyForm, setReplyForm] = useState<ReplyForm>({ to: [], subject: '', body: '', cc: [] });
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  // Feedback when a pick is rejected (already attached, or over the server's cap) —
  // otherwise the picker just closes and the file appears to vanish.
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);

  const replyPolish = useDraftPolish();
  const forwardPolish = useDraftPolish();

  const detailScrollRef = useRef<HTMLDivElement>(null);
  // Inline reply forms render below a (potentially tall) message/thread; scroll
  // them into view when opened so the user doesn't have to scroll down to reply.
  const replyFormRef = useRef<HTMLDivElement>(null);
  const forwardFormRef = useRef<HTMLDivElement>(null);

  const sendMutation = useSendEmail(companyId);
  const markUnreadMutation = useMarkEmailUnread(companyId);

  // Not gated on `active`: it's a one-shot fetch with no polling, and its data is
  // already cached — gating it would just refetch the open email on every return.
  const {
    data: emailDetail,
    isLoading: emailDetailLoading,
    isError: emailDetailError,
  } = useGmailEmail(companyId, selectedMsgId);
  // The conversation thread for the opened email. `selectedThreadId` is set from
  // the clicked row; on a restored open (page reload) it's null, so fall back to
  // the single message's own threadId once `emailDetail` loads.
  const activeThreadId = selectedThreadId ?? emailDetail?.threadId ?? null;
  const { data: emailThread } = useGmailEmailThread(companyId, activeThreadId, pollEnabled);

  // Past recipients for To/CC autocomplete. Only fetched (once, then cached) when
  // the user is actually replying/forwarding — the endpoint scans many messages.
  const forward = useForwardDraft({
    companyId,
    token,
    // Outlook builds the quoted original server-side via Graph's createForward,
    // which keeps the original's own formatting AND its inline `cid:` images — both
    // of which sanitizeForwardHtml has to discard. Quoting here too would duplicate
    // the message for the recipient. Only holds for a single-message forward.
    nativeQuote: provider === 'MICROSOFT',
    signatureHtml: account.signatureHtml,
    threadEmails: emailThread?.messages ?? [],
    onResetPolish: () => forwardPolish.reset(),
  });
  const { data: contacts } = useGmailContacts(companyId, replyOpen || forward.open);

  // Messages to show in the detail pane: the full thread when loaded, else the
  // single opened message (so a still-loading or 1-message thread renders fine).
  const threadEmails: EmailDetail[] =
    emailThread?.messages && emailThread.messages.length > 0
      ? emailThread.messages
      : emailDetail
        ? [emailDetail]
        : [];
  // The newest message in the conversation. Only a target when nothing is open.
  const latestThreadEmail: EmailDetail | null =
    threadEmails.length > 0 ? threadEmails[threadEmails.length - 1] : null;

  // Index of the message the user actually clicked. Everything after it is the
  // "future" of that moment — dimmed, mirroring the chat thread view. -1 when the
  // opened id isn't in the loaded thread (still loading, or a provider quirk):
  // then nothing dims, but the reply target still resolves to the opened message
  // via `emailDetail` below — it must never drift to a newer one.
  const anchorIdx = threadEmails.findIndex((m) => m.id === selectedMsgId);
  // Which message to expand before the init effect below has run, so the pane is
  // never all-collapsed — the anchor when we have one, else the newest.
  const fallbackExpandId =
    anchorIdx >= 0
      ? threadEmails[anchorIdx].id
      : (threadEmails[threadEmails.length - 1]?.id ?? null);
  // Reply/Forward act on the message the user opened — the state of the
  // conversation they're looking at — never on whatever arrived after it.
  //
  // The miss case matters: when the opened id isn't in `threadEmails` (thread still
  // loading or refetching, a restored selection whose thread hasn't arrived, a
  // provider id mismatch) this used to fall through to the NEWEST message, so a
  // reply silently jumped forward in the conversation. `emailDetail` is that opened
  // message — useGmailEmail is keyed on `selectedMsgId` — so it is the correct
  // stand-in. `latestThreadEmail` is only reached with nothing open at all.
  const anchorEmail: EmailDetail | null =
    anchorIdx >= 0 ? threadEmails[anchorIdx] : (emailDetail ?? latestThreadEmail);

  // Expand the message the user clicked, once per opened thread. Keyed so the 15s
  // poll (a new array each time) doesn't collapse what the user manually expanded;
  // a genuinely new message won't auto-expand. Messages newer than the clicked one
  // are the dimmed "future" and stay collapsed — auto-expanding them would defeat
  // the point of freezing the thread at that moment.
  const threadInitKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const msgs = emailThread?.messages;
    if (!msgs || msgs.length === 0) return;
    const key = `${activeThreadId}|${selectedMsgId}|${msgs.length}`;
    if (threadInitKeyRef.current === key) return;
    threadInitKeyRef.current = key;
    const idx = msgs.findIndex((m) => m.id === selectedMsgId);
    const initial = new Set<string>();
    if (idx >= 0) initial.add(msgs[idx].id);
    // No anchor in the thread (or the anchor *is* the newest) — expand the newest.
    if (idx === -1 || idx === msgs.length - 1) initial.add(msgs[msgs.length - 1].id);
    setExpandedThreadIds(initial);
  }, [emailThread?.messages, activeThreadId, selectedMsgId]);

  // Scroll offset of the email detail box. Two things to get right:
  //  · switching from one email to another reuses the same box, so a new message
  //    must start at the top rather than inherit the previous one's offset;
  //  · hiding the tab (display:none) destroys the box's offset — it comes back at 0 —
  //    so the live offset is tracked on scroll and re-applied when the tab is shown.
  // It has to be captured as the user scrolls: by the time an effect cleanup could
  // read it, display:none has already been committed and scrollTop reads 0.
  const detailScrollTop = useRef(0);
  const shownMsgId = useRef<string | null>(null);

  useLayoutEffect(() => {
    const el = detailScrollRef.current;
    if (!active || !el) return;
    if (shownMsgId.current !== selectedMsgId) {
      shownMsgId.current = selectedMsgId;
      detailScrollTop.current = 0;
    }
    el.scrollTop = detailScrollTop.current;
  }, [active, selectedMsgId]);

  // When a reply or forward form opens, scroll it into view (it mounts on the
  // flag flip, so the effect runs after it's in the DOM and the ref is populated).
  useEffect(() => {
    if (replyOpen) replyFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (forward.open) forwardFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [replyOpen, forward.open]);

  const toggleThreadMessage = (id: string) => {
    setExpandedThreadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleForwardPreview = (id: string) => {
    setExpandedForwardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Merge newly-picked files into an existing selection, de-duped by name+size.
  //
  // The Array.from MUST happen here, synchronously — not inside the updater below.
  // `picked` is the live `e.target.files`, and every call site clears the input
  // (`e.target.value = ''`) the moment this returns, which empties that FileList.
  // React only evaluates a useState updater eagerly when nothing else is pending on
  // the fiber; once anything is in flight (the 15s inbox poll, the rich-text editor)
  // the updater is deferred to the render phase — by which point the list was empty
  // and the file was silently dropped. That was the "can't add a second attachment" bug.
  const addFiles = (
    setter: React.Dispatch<React.SetStateAction<File[]>>,
    current: File[],
    // A FileList from the picker, or a plain array from a drop / paste.
    picked: FileList | File[] | null,
  ) => {
    const incoming = Array.from(picked ?? []);
    if (incoming.length === 0) return;

    // Shared with InternalMessagesTab: enforces the file count, the per-file byte
    // ceiling, and de-dupes — the server rejects the same three things.
    // No cap: outbound email takes any number of attachments.
    const { files, notice } = mergeAttachments(current, incoming);
    setter(files);
    setAttachmentNotice(notice);
  };

  const closeReply = () => {
    setReplyOpen(false);
    setReplyTarget(null);
    setReplyFiles([]);
    setAttachmentNotice(null);
    replyPolish.reset();
  };

  const handleOpenReply = (detail: EmailDetail) => {
    // Reply and forward share the same inline slot below the message.
    forward.close();
    // Replying to a message WE sent (common now that Reply targets the opened
    // message, which may be one of ours) has to go to its recipients — addressing
    // it back to ourselves is what Gmail avoids here too.
    const isOwn =
      !!accountAddress &&
      extractEmail(detail.from).toLowerCase() === accountAddress.toLowerCase();
    // `to` can be a comma-joined list — the first recipient is the one to answer.
    const replyTo = extractEmail(isOwn ? (detail.to.split(',')[0] ?? '') : detail.from);
    setReplyTarget(detail);
    setReplyForm({
      to: replyTo ? [replyTo] : [],
      subject: prefixReSubject(detail.subject || ''),
      // Seed the editable signature a few lines below the caret (matches Gmail;
      // server no longer appends it).
      body: account.signatureHtml ? `${SIGNATURE_LEAD}${account.signatureHtml}` : '',
      cc: [],
    });
    setReplyFiles([]);
    setAttachmentNotice(null);
    setReplyOpen(true);
    replyPolish.reset();
  };

  const handleOpenForward = (detail: EmailDetail) => {
    // Reply and forward share the same inline slot below the message.
    setReplyOpen(false);
    setReplyTarget(null);
    setReplyFiles([]);
    setAttachmentNotice(null);
    forward.openFor(detail);
  };

  /**
   * Re-anchor the open conversation to an earlier message and reply there — the
   * email counterpart of re-anchoring in the chat view.
   *
   * Moving the anchor is what re-points everything derived from it: the toolbar
   * Reply/Forward, and the dimming that marks every later message as the "future"
   * of this moment. The handler still gets `m` directly, because `anchorEmail`
   * won't reflect the new id until the next render.
   */
  const reanchor = (m: EmailDetail) => {
    // The init effect keys on selectedMsgId and would collapse everything the user
    // has expanded. Claim its key first and fold the new anchor into the current
    // set, the same trick opening a message uses to hand the effect a clean slate.
    const msgs = emailThread?.messages;
    if (msgs && msgs.length > 0) {
      threadInitKeyRef.current = `${activeThreadId}|${m.id}|${msgs.length}`;
      setExpandedThreadIds((prev) => new Set(prev).add(m.id));
    }
    onAnchorChange(m.id);
  };

  const handleNavigateToEmailMessage = (m: EmailDetail) => {
    reanchor(m);
    handleOpenReply(m);
  };

  const handleNavigateToEmailMessageForward = (m: EmailDetail) => {
    reanchor(m);
    handleOpenForward(m);
  };

  const handleSendReply = () => {
    // Reply to the message the user opened, even when newer ones exist below it.
    const target = replyTarget ?? anchorEmail;
    if (!target) return;
    if (replyForm.to.length === 0) return;
    sendMutation.mutate(
      {
        to: replyForm.to.join(', '),
        subject: replyForm.subject,
        body: htmlToText(replyForm.body),
        bodyHtml: replyForm.body,
        cc: replyForm.cc.length ? replyForm.cc.join(', ') : undefined,
        inReplyTo: target.messageId || undefined,
        references: target.references || undefined,
        threadId: target.threadId || undefined,
        // Gmail threads on the two fields above. Outlook can't set those headers
        // at all, so it needs the resource id to build a createReply draft.
        replyToMessageId: target.id || undefined,
        files: replyFiles,
      },
      {
        onSuccess: () => {
          setReplyOpen(false);
          setReplyTarget(null);
          setReplyForm({ to: [], subject: '', body: '', cc: [] });
          setReplyFiles([]);
          setAttachmentNotice(null);
        },
      },
    );
  };

  const handleSendForward = () => {
    if (forward.form.to.length === 0) return;
    const bodyHtml = forward.bodyForSend();
    // No inReplyTo/threadId — a forward starts its own conversation.
    sendMutation.mutate(
      {
        to: forward.form.to.join(', '),
        subject: forward.form.subject,
        body: htmlToText(bodyHtml),
        bodyHtml,
        cc: forward.form.cc.length ? forward.form.cc.join(', ') : undefined,
        // Record the original message id so the inbox shows a "forwarded" marker.
        // Kept to the opened message even for a whole-conversation forward, so the
        // banner appears once, on the message the user acted from.
        forwardedFrom: forward.source?.id,
        // Tells the server we quoted the conversation ourselves — Outlook must not
        // add Graph's own quote on top.
        forwardScope: forward.scope,
        files: forward.files,
      },
      { onSuccess: forward.close },
    );
  };

  // Assemble the context sent to the AI: the whole email / whole conversation.
  const buildEmailContext = (detail: EmailDetail): string =>
    `Subject: ${detail.subject || '(no subject)'}\n` +
    `From: ${detail.from}\n` +
    `To: ${detail.to}\n\n` +
    (detail.bodyText?.trim() || htmlToText(detail.bodyHtml ?? ''));

  // A forward polishes against whatever is being forwarded — the one email, or the
  // whole conversation when that is what's going out, so the AI isn't reasoning
  // about a single reply while the user sends twelve. Kept non-empty so it
  // satisfies the polish endpoint's required `context` field.
  const forwardPolishContext = (): string => {
    const messages = forward.forwardMessages(forward.scope, forward.source);
    return messages.length > 0
      ? messages.map(buildEmailContext).join('\n\n---\n\n')
      : '(Forwarded email — no prior conversation.)';
  };

  // Print / download-as-PDF (Gmail-style) for the whole opened conversation.
  const handlePrintEmail = () => {
    if (threadEmails.length === 0) return;
    const html = buildEmailThreadPrintHtml(threadEmails, (email, att) =>
      emailAttachmentUrl(token ?? '', companyId, email.id, att, 'inline'),
    );
    openPrintWindow(threadEmails[threadEmails.length - 1].subject || '(no subject)', html);
  };

  const replyContextSource = replyTarget ?? anchorEmail;

  return (
    // Fills the tab's scroll container exactly, so the toolbar sits outside the
    // scroll box and can never overlap the email at any scroll position.
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 -mx-6 -mt-5 px-6 pt-5 pb-3 bg-background border-b flex flex-wrap items-center gap-2">
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground shrink-0"
          onClick={onClose}
        >
          <ArrowLeft size={14} /> Back
        </button>
        {anchorEmail && !replyOpen && !forward.open && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => handleOpenReply(anchorEmail)}>
              <Reply size={14} /> Reply
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => handleOpenForward(anchorEmail)}>
              <Forward size={14} /> Forward
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={handlePrintEmail}>
              <Printer size={14} /> Print
            </Button>
            {selectedMsgIsRead && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-muted-foreground"
                disabled={markUnreadMutation.isPending}
                onClick={() => markUnreadMutation.mutate(selectedMsgId, { onSuccess: onClose })}
              >
                <MailOpen size={14} /> Mark as unread
              </Button>
            )}
            {inboxIsCompleted ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-blue-600 border-blue-200 hover:text-blue-700"
                onClick={() => onUncomplete('email', selectedMsgId)}
              >
                <CheckCircle2 size={14} className="fill-blue-100" /> Completed
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => onRequestComplete({ kind: 'email', id: selectedMsgId, fromDetail: true })}
              >
                <CheckCircle2 size={14} /> Mark complete
              </Button>
            )}
          </div>
        )}
      </div>

      <div
        ref={detailScrollRef}
        onScroll={(e) => { detailScrollTop.current = e.currentTarget.scrollTop; }}
        className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 pt-3 flex flex-col gap-3"
      >
        {emailDetailLoading && threadEmails.length === 0 && (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        )}

        {/* A restored message may have been deleted or moved since it was opened.
            Say so rather than leaving an empty pane. */}
        {emailDetailError && threadEmails.length === 0 && (
          <div className="py-8 flex flex-col items-center gap-3 text-sm text-muted-foreground">
            This message is no longer available — it may have been deleted or moved.
            <Button size="sm" variant="outline" onClick={onClose}>
              Back to inbox
            </Button>
          </div>
        )}

        {threadEmails.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="font-semibold text-base">
              {(latestThreadEmail?.subject || threadEmails[0]?.subject) || '(no subject)'}
            </h2>
            {/* Conversation thread — the opened message expanded, anything newer
                than it collapsed and dimmed (still clickable to read). */}
            <div className="flex flex-col gap-2">
              {threadEmails.map((m, i) => (
                <ThreadMessage
                  key={m.id}
                  message={m}
                  isFuture={anchorIdx >= 0 && i > anchorIdx}
                  // Fall back to one message expanded before the init effect has run
                  // (thread still loading, or the single-message fallback), so the
                  // pane is never all-collapsed — and never auto-opens a dimmed one.
                  expanded={
                    expandedThreadIds.has(m.id) ||
                    (expandedThreadIds.size === 0 && m.id === fallbackExpandId)
                  }
                  isAnchor={m.id === selectedMsgId}
                  expandedForwardIds={expandedForwardIds}
                  companyId={companyId}
                  token={token}
                  accountAddress={accountAddress}
                  onToggle={toggleThreadMessage}
                  onToggleForwardPreview={toggleForwardPreview}
                  onReplyToThis={handleNavigateToEmailMessage}
                  onForwardThis={handleNavigateToEmailMessageForward}
                />
              ))}
            </div>

            {/* Inline reply form */}
            {replyOpen && replyContextSource && (
              <InlineComposerPanel
                variant="reply"
                formRef={replyFormRef}
                subtitle={
                  // The form sits below the dimmed later messages, so name the
                  // message being answered rather than leaving it implied.
                  replyTarget
                    ? `Replying to ${replyTarget.from} · ${formatEmailDate(replyTarget.date)}`
                    : undefined
                }
                toField={
                  <RecipientAutocomplete
                    value={replyForm.to}
                    onChange={(v) => setReplyForm((f) => ({ ...f, to: v }))}
                    contacts={contacts ?? []}
                  />
                }
                ccField={
                  <RecipientAutocomplete
                    value={replyForm.cc}
                    onChange={(v) => setReplyForm((f) => ({ ...f, cc: v }))}
                    contacts={contacts ?? []}
                    placeholder="Optional"
                  />
                }
                subject={replyForm.subject}
                onSubjectChange={(v) => setReplyForm((f) => ({ ...f, subject: v }))}
                body={replyForm.body}
                onBodyChange={(h) => setReplyForm((f) => ({ ...f, body: h }))}
                bodyPlaceholder="Write your reply…"
                messageLabel="Message"
                minHeight={140}
                maxHeight={320}
                files={replyFiles}
                setFiles={setReplyFiles}
                onPickFiles={(picked) => addFiles(setReplyFiles, replyFiles, picked)}
                onDropFiles={(dropped) => addFiles(setReplyFiles, replyFiles, dropped)}
                attachmentNotice={attachmentNotice}
                cloudLabel={cloudLabel}
                uploadProgress={sendMutation.uploadProgress}
                error={
                  sendMutation.isError
                    ? ((sendMutation.error as Error)?.message ?? 'Failed to send')
                    : null
                }
                polish={replyPolish}
                polishContext={buildEmailContext(replyContextSource)}
                polishDraftPlain={htmlToText(splitSignature(replyForm.body).body)}
                onPolishAccept={(polished) => {
                  // Re-attach the original (unpolished) signature after the polished text.
                  const html = textToHtml(polished);
                  const { sig } = splitSignature(replyForm.body);
                  setReplyForm((f) => ({ ...f, body: sig ? `${html}<div><br></div>${sig}` : html }));
                }}
                sendLabel="Send Reply"
                sendDisabled={
                  sendMutation.isPending || (!htmlToText(replyForm.body) && replyFiles.length === 0)
                }
                isSending={sendMutation.isPending}
                onSend={handleSendReply}
                onCancel={closeReply}
              />
            )}

            {/* Inline forward form — seeded from the open email */}
            {forward.open && (
              <InlineComposerPanel
                variant="forward"
                formRef={forwardFormRef}
                subtitle={
                  // The form sits below the dimmed later messages, so name what is
                  // being forwarded rather than leaving it implied.
                  forward.source
                    ? forward.scope === 'thread'
                      ? `Forwarding all ${threadEmails.length} messages · ${formatEmailDate(threadEmails[0].date)} – ${formatEmailDate(threadEmails[threadEmails.length - 1].date)}`
                      : `Forwarding ${forward.source.from} · ${formatEmailDate(forward.source.date)}`
                    : undefined
                }
                beforeFields={
                  // How much of the back-and-forth goes with it. Hidden when there is
                  // nothing else in the conversation to add.
                  threadEmails.length > 1 ? (
                    <div className="flex flex-wrap items-center gap-4 rounded-md border bg-background px-3 py-2">
                      {([
                        { value: 'message', label: 'This message' },
                        { value: 'thread', label: `Whole conversation (${threadEmails.length} messages)` },
                      ] as const).map((opt) => (
                        <label key={opt.value} className="flex cursor-pointer items-center gap-1.5 text-xs">
                          {/* A real focusable radio on purpose: RichTextEditor only
                              writes the `html` prop into the DOM while it is NOT
                              focused, so a control that kept focus in the editor
                              would swap the quote in state and never repaint it. */}
                          <input
                            type="radio"
                            name="forward-scope"
                            className="accent-teal-600"
                            checked={forward.scope === opt.value}
                            onChange={() => forward.changeScope(opt.value)}
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  ) : undefined
                }
                toField={
                  <RecipientAutocomplete
                    value={forward.form.to}
                    onChange={(v) => forward.setForm((f) => ({ ...f, to: v }))}
                    contacts={contacts ?? []}
                    placeholder="recipient@example.com"
                  />
                }
                ccField={
                  <RecipientAutocomplete
                    value={forward.form.cc}
                    onChange={(v) => forward.setForm((f) => ({ ...f, cc: v }))}
                    contacts={contacts ?? []}
                    placeholder="Optional"
                  />
                }
                subject={forward.form.subject}
                onSubjectChange={(v) => forward.setForm((f) => ({ ...f, subject: v }))}
                subjectPlaceholder="Subject"
                body={forward.form.body}
                onBodyChange={(h) => forward.setForm((f) => ({ ...f, body: h }))}
                bodyPlaceholder="Add a message…"
                messageLabel="Message"
                minHeight={200}
                // Seeded with the whole quoted original — cap it so Send stays close.
                maxHeight={360}
                files={forward.files}
                setFiles={forward.setFiles}
                onPickFiles={(picked) => addFiles(forward.setFiles, forward.files, picked)}
                onDropFiles={(dropped) => addFiles(forward.setFiles, forward.files, dropped)}
                attachmentNotice={attachmentNotice}
                attachNotices={
                  <>
                    {forward.attLoading && (
                      <p className="text-xs text-muted-foreground">Loading attachments…</p>
                    )}
                    {forward.attError && (
                      <p className="text-xs text-destructive">
                        Couldn't load the original attachments. You can attach files manually.
                      </p>
                    )}
                    {forward.skipped.length > 0 && (
                      <p className="text-xs text-amber-600">
                        Not forwarded (too large): {forward.skipped.join(', ')}
                      </p>
                    )}
                    {forward.form.body.length > FORWARD_BODY_BUDGET && (
                      <p className="text-xs text-amber-600">
                        This conversation is too long to quote in full — the older
                        messages will be sent as headers and a one-line preview.
                      </p>
                    )}
                  </>
                }
                cloudLabel={cloudLabel}
                uploadProgress={sendMutation.uploadProgress}
                error={
                  sendMutation.isError
                    ? ((sendMutation.error as Error)?.message ?? 'Failed to send')
                    : null
                }
                polish={forwardPolish}
                polishContext={forwardPolishContext()}
                polishDraftPlain={htmlToText(splitSignature(forward.form.body).body)}
                onPolishAccept={(polished) => {
                  // `sig` carries the signature AND the quoted forwarded block below
                  // it — polish only ever rewrites the user's own text above it.
                  const html = textToHtml(polished);
                  const { sig } = splitSignature(forward.form.body);
                  forward.setForm((f) => ({ ...f, body: sig ? `${html}<div><br></div>${sig}` : html }));
                }}
                sendLabel="Send"
                sendDisabled={
                  sendMutation.isPending || forward.form.to.length === 0 || forward.attLoading
                }
                isSending={sendMutation.isPending}
                onSend={handleSendForward}
                onCancel={forward.close}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
