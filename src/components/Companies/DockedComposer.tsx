import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RichTextEditor } from './RichTextEditor';
import { RecipientAutocomplete } from './RecipientAutocomplete';
import { UserAutocomplete } from './UserAutocomplete';
import { PolishButton, PolishPanel } from './PolishPanel';
import { AttachmentChips, UploadProgressBar } from './ComposerBits';
import {
  SIGNATURE_LEAD,
  htmlToText,
  mergeAttachments,
  splitSignature,
  textToHtml,
} from './message-utils';
import { useDraftPolish } from '@/hooks/useDraftPolish';
import { useGmailContacts } from '@/hooks/useGmailContacts';
import { useSendEmail } from '@/hooks/useSendEmail';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { useSendInternalMessage } from '@/hooks/useSendInternalMessage';
import type { Draft } from '@/context/ComposerContext';

// Outbound email: matches FilesInterceptor('attachments', MAX_ATTACHMENTS) in
// gmail.controller.ts / microsoft.controller.ts. The per-file byte cap lives in
// message-utils as MAX_FILE_BYTES.
const MAX_ATTACHMENTS = 10;
// Internal attachments live on our own disk, so they keep the smaller cap
// (internal-messages/uploads.ts).
const MAX_INTERNAL_FILE_BYTES = 15 * 1024 * 1024;

const INTERNAL_POLISH_CONTEXT =
  'An internal message between colleagues at a bookkeeping firm.';

interface BodyProps {
  /** Reports whether there is anything worth confirming before a discard. */
  onDirtyChange: (dirty: boolean) => void;
  /** Reports an in-flight send, so navigating away can't close mid-upload. */
  onSendingChange: (sending: boolean) => void;
  onSent: () => void;
}

/**
 * The Gmail-style compose window docked at the bottom-right.
 *
 * Deliberately NOT a `<Dialog>`: `DialogContent` hard-wires a blurred, click-to-close
 * backdrop that traps focus, which is exactly what made composing block the rest of
 * the app. Nothing here closes on Escape or an outside click — only Cancel, the ×,
 * or a successful send.
 */
export function DockedComposer({
  draft,
  minimized,
  onMinimize,
  onClose,
  onSendingChange,
  attention,
}: {
  draft: Draft;
  minimized: boolean;
  onMinimize: (on: boolean) => void;
  onClose: () => void;
  onSendingChange: (sending: boolean) => void;
  /** Bumped when an already-open composer is re-requested; flashes the window. */
  attention: number;
}) {
  const [dirty, setDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Flash by touching the DOM rather than through state: a re-render here is both
  // unnecessary and risky, since the composer body must never be re-created.
  useEffect(() => {
    if (attention === 0) return;
    const el = rootRef.current;
    if (!el) return;
    const ring = ['ring-2', 'ring-teal-400'];
    el.classList.add(...ring);
    const t = setTimeout(() => el.classList.remove(...ring), 700);
    return () => clearTimeout(t);
  }, [attention]);

  // There is no draft autosave, so an accidental × is unrecoverable — unlike Gmail,
  // which is why an always-dismissable window needs the confirm.
  const requestClose = () => {
    if (dirty) setConfirmOpen(true);
    else onClose();
  };

  const body =
    draft.kind === 'email' ? (
      <EmailComposerBody
        key={draft.companyId}
        companyId={draft.companyId}
        cloudLabel={draft.cloudLabel}
        signatureHtml={draft.signatureHtml}
        onDirtyChange={setDirty}
        onSendingChange={onSendingChange}
        onSent={onClose}
      />
    ) : (
      <InternalComposerBody
        onDirtyChange={setDirty}
        onSendingChange={onSendingChange}
        onSent={() => {
          draft.onSent?.();
          onClose();
        }}
      />
    );

  return (
    <>
      {/* No `overflow-hidden` on the root: RecipientAutocomplete's dropdown is
          `absolute top-full` rather than portaled, so a clipping ancestor eats it.
          The header rounds its own corners instead. */}
      <div
        ref={rootRef}
        className="fixed bottom-0 right-0 z-40 flex w-full flex-col rounded-t-lg border bg-background shadow-2xl sm:right-6 sm:w-[30rem] sm:max-w-[calc(100vw-3rem)]"
      >
        <div className="flex items-center gap-2 rounded-t-lg bg-slate-800 px-3 py-2 text-white">
          <button
            type="button"
            onClick={() => onMinimize(!minimized)}
            className="min-w-0 flex-1 text-left"
            title={minimized ? 'Expand' : 'Minimize'}
          >
            <div className="truncate text-sm font-medium">New message</div>
            {draft.kind === 'email' && draft.fromAddress && (
              // Which mailbox this sends from — it stays open while the user walks
              // to another company, so the window must say who it is writing as.
              <div className="truncate text-[11px] text-slate-300">
                from {draft.fromAddress}
              </div>
            )}
          </button>
          <button
            type="button"
            onClick={() => onMinimize(!minimized)}
            aria-label={minimized ? 'Expand' : 'Minimize'}
            className="shrink-0 rounded p-1 hover:bg-white/10"
          >
            {minimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="shrink-0 rounded p-1 hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>

        {/* Hidden, never unmounted — rendering it conditionally would destroy the
            draft, which is the whole point of a window you can minimize. */}
        <div
          className={
            minimized
              ? 'hidden'
              : 'flex h-[min(32rem,calc(100vh-9rem))] flex-col gap-3 p-3'
          }
        >
          {body}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Discard this draft?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Your message hasn't been sent and won't be saved.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
              Keep writing
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onClose();
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Email ────────────────────────────────────────────────────────────────────

function EmailComposerBody({
  companyId,
  cloudLabel,
  signatureHtml,
  onDirtyChange,
  onSendingChange,
  onSent,
}: BodyProps & {
  companyId: number;
  cloudLabel: string;
  signatureHtml?: string;
}) {
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState(
    signatureHtml ? `${SIGNATURE_LEAD}${signatureHtml}` : '',
  );
  const [files, setFiles] = useState<File[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Its OWN send mutation and polish state. CommunicationsTab shares one of each
  // across compose/reply/forward on the assumption that only one is ever open —
  // an assumption this window breaks, so a docked compose would otherwise show the
  // inline reply's upload bar, error and polished text.
  const sendMutation = useSendEmail(companyId);
  const polish = useDraftPolish();
  const { data: contacts } = useGmailContacts(companyId, true);

  const bodyText = htmlToText(body);
  // The seeded signature is not the user's own writing, so it doesn't count.
  const draftPlain = htmlToText(splitSignature(body).body);

  useEffect(() => {
    onDirtyChange(
      draftPlain.trim().length > 0 ||
        files.length > 0 ||
        to.length > 0 ||
        subject.trim().length > 0,
    );
  }, [draftPlain, files.length, to.length, subject, onDirtyChange]);

  useEffect(() => {
    onSendingChange(sendMutation.isPending);
  }, [sendMutation.isPending, onSendingChange]);

  // A successful send unmounts this body from inside `onSuccess`, before the effect
  // above ever sees `isPending` go false — without this the flag would stay stuck on
  // and close-on-navigate would never fire again.
  useEffect(() => () => onSendingChange(false), [onSendingChange]);

  const polishContext =
    `Subject: ${subject || '(no subject)'}\n` +
    `To: ${to.join(', ') || '(unspecified)'}\n\n(New email — no prior conversation.)`;

  const handleSend = () => {
    if (to.length === 0) return;
    sendMutation.mutate(
      {
        to: to.join(', '),
        subject,
        body: bodyText,
        bodyHtml: body,
        cc: cc.length ? cc.join(', ') : undefined,
        files,
      },
      { onSuccess: onSent },
    );
  };

  return (
    <>
      {/* Recipients sit OUTSIDE the scroll area so their autocomplete dropdowns can
          overlay the message below instead of being clipped by it. */}
      <div className="flex shrink-0 flex-col gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">To</Label>
          <RecipientAutocomplete
            value={to}
            onChange={setTo}
            contacts={contacts ?? []}
            placeholder="recipient@example.com"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">CC</Label>
          <RecipientAutocomplete
            value={cc}
            onChange={setCc}
            contacts={contacts ?? []}
            placeholder="Optional"
          />
        </div>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <RichTextEditor
          html={body}
          onChange={setBody}
          placeholder="Write your message…"
          minHeight={160}
        />
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const merged = mergeAttachments(
              files,
              Array.from(e.target.files ?? []),
              MAX_ATTACHMENTS,
            );
            setFiles(merged.files);
            setAttachmentNotice(merged.notice);
            // Clear so picking the same file twice still fires onChange.
            e.target.value = '';
          }}
        />
        {attachmentNotice && (
          <p className="text-xs text-amber-600">{attachmentNotice}</p>
        )}
        <AttachmentChips files={files} setFiles={setFiles} cloudLabel={cloudLabel} />
        <UploadProgressBar progress={sendMutation.uploadProgress} />
        {sendMutation.isError && (
          <p className="text-xs text-destructive">
            {(sendMutation.error as Error)?.message ?? 'Failed to send'}
          </p>
        )}
        <PolishPanel
          polish={polish}
          context={polishContext}
          onAccept={(polished) => setBody(textToHtml(polished))}
        />
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip size={14} /> Attach
        </Button>
        <PolishButton
          polish={polish}
          draftPlain={draftPlain}
          context={polishContext}
        />
        <Button
          size="sm"
          className="ml-auto gap-1 bg-teal-600 text-white hover:bg-teal-700"
          disabled={
            sendMutation.isPending || to.length === 0 || (!bodyText && files.length === 0)
          }
          onClick={handleSend}
        >
          <Send size={14} />
          {sendMutation.isPending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </>
  );
}

// ── Internal ─────────────────────────────────────────────────────────────────

function InternalComposerBody({
  onDirtyChange,
  onSendingChange,
  onSent,
}: BodyProps) {
  const [to, setTo] = useState<number[]>([]);
  const [cc, setCc] = useState<number[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: directory = [] } = useUserDirectory(true);
  const polish = useDraftPolish();
  const sendMutation = useSendInternalMessage();

  const bodyText = htmlToText(body);

  // No reset-on-open effect is needed the way the old dialog had one: this mounts
  // fresh every time the composer opens and unmounts when it closes.
  useEffect(() => {
    onDirtyChange(
      bodyText.trim().length > 0 ||
        files.length > 0 ||
        to.length > 0 ||
        subject.trim().length > 0,
    );
  }, [bodyText, files.length, to.length, subject, onDirtyChange]);

  useEffect(() => {
    onSendingChange(sendMutation.isPending);
  }, [sendMutation.isPending, onSendingChange]);

  // See the same pair in EmailComposerBody: a send that succeeds unmounts this
  // before the effect above can clear the flag.
  useEffect(() => () => onSendingChange(false), [onSendingChange]);

  const handleSend = () => {
    setError(null);
    if (to.length === 0) {
      setError('Add at least one recipient.');
      return;
    }
    if (!bodyText.trim()) {
      setError('Write a message before sending.');
      return;
    }
    sendMutation.mutate(
      {
        to,
        cc,
        subject: subject.trim() || '(no subject)',
        body: bodyText,
        bodyHtml: body,
        files,
      },
      {
        onSuccess: onSent,
        onError: (e: unknown) =>
          setError((e as Error)?.message ?? 'Failed to send message'),
      },
    );
  };

  return (
    <>
      <div className="flex shrink-0 flex-col gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">To</Label>
          <UserAutocomplete
            value={to}
            onChange={setTo}
            users={directory}
            placeholder="Start typing a name…"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Cc</Label>
          <UserAutocomplete
            value={cc}
            onChange={setCc}
            users={directory}
            placeholder="Optional"
          />
        </div>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <RichTextEditor
          html={body}
          onChange={setBody}
          placeholder="Write your message…"
          minHeight={160}
        />
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const merged = mergeAttachments(
              files,
              Array.from(e.target.files ?? []),
              MAX_ATTACHMENTS,
              MAX_INTERNAL_FILE_BYTES,
            );
            setFiles(merged.files);
            setAttachmentNotice(merged.notice);
            e.target.value = '';
          }}
        />
        {attachmentNotice && (
          <p className="text-xs text-amber-600">{attachmentNotice}</p>
        )}
        {/* Internal attachments are stored by us, never off-loaded to Drive — the
            cloudLabel is unreachable here because nothing exceeds the inline budget. */}
        <AttachmentChips files={files} setFiles={setFiles} cloudLabel="Drive" />
        <PolishPanel
          polish={polish}
          context={INTERNAL_POLISH_CONTEXT}
          onAccept={(polished) => setBody(textToHtml(polished))}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip size={14} /> Attach
        </Button>
        <PolishButton
          polish={polish}
          draftPlain={bodyText}
          context={INTERNAL_POLISH_CONTEXT}
        />
        <Button
          size="sm"
          className="ml-auto gap-1 bg-teal-600 text-white hover:bg-teal-700"
          disabled={sendMutation.isPending || to.length === 0 || !bodyText.trim()}
          onClick={handleSend}
        >
          <Send size={14} />
          {sendMutation.isPending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </>
  );
}
