import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, ChevronUp, Maximize2, Paperclip, Send, X } from 'lucide-react';
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
import { AttachmentChips, FileDropOverlay, UploadProgressBar } from './ComposerBits';
import {
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
  SIGNATURE_LEAD,
  htmlToText,
  mergeAttachments,
  splitSignature,
  textToHtml,
} from './message-utils';
import { useDraftPolish } from '@/hooks/useDraftPolish';
import { useDraggable } from '@/hooks/useDraggable';
import { useResizable } from '@/hooks/useResizable';
import { useFileDrop } from '@/hooks/useFileDrop';
import { useGmailContacts } from '@/hooks/useGmailContacts';
import { useSendEmail } from '@/hooks/useSendEmail';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { useSendInternalMessage } from '@/hooks/useSendInternalMessage';
import { slotRight } from './composer-layout';
import { cn } from '@/lib/utils';
import type { ComposerActions, Draft } from '@/context/ComposerContext';

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
 * One Gmail-style compose window, parked at the bottom-right until it is dragged.
 *
 * Deliberately NOT a `<Dialog>`: `DialogContent` hard-wires a blurred, click-to-close
 * backdrop that traps focus, which is exactly what made composing block the rest of
 * the app. Nothing here closes on Escape or an outside click — only Cancel, the ×,
 * or a successful send.
 *
 * `hidden` means "the user is on another page": the window is dropped from layout but
 * never unmounted, so its text, attachments and in-flight send are all still there
 * when they come back.
 */
export function DockedComposer({
  draft,
  hidden,
  slot,
  zIndex,
  actions,
}: {
  draft: Draft;
  /** Off its own page — `display:none`, still mounted. */
  hidden: boolean;
  /** Position in the row of parked windows; ignored once `draft.pos` is set. */
  slot: number;
  zIndex: number;
  actions: ComposerActions;
}) {
  const { close, setMinimized, setPos, setSize, setSending, raise, notifyInternalSent } =
    actions;
  const { id, minimized } = draft;
  const [dirty, setDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // The region below the title bar — what a resize actually gives a height to.
  const bodyRef = useRef<HTMLDivElement>(null);

  // Stable per draft. The bodies take these as effect dependencies, so an inline
  // arrow would get a fresh identity on every provider render, re-run the effect,
  // set state, and loop.
  const handleClose = useCallback(() => close(id), [close, id]);
  const handleMinimize = useCallback(
    (on: boolean) => setMinimized(id, on),
    [setMinimized, id],
  );
  const handleSendingChange = useCallback(
    (on: boolean) => setSending(id, on),
    [setSending, id],
  );

  // The confirm is portaled to <body> by base-ui, *outside* this window, so hiding
  // the window would not hide the dialog: it is only rendered while visible. Drop the
  // pending confirm on the way out too, or returning to the company reopens a modal
  // the user has long since walked away from. Adjusted during render — the pattern
  // React prescribes for "reset state when a prop changes".
  const [wasHidden, setWasHidden] = useState(hidden);
  if (hidden !== wasHidden) {
    setWasHidden(hidden);
    if (hidden && confirmOpen) setConfirmOpen(false);
  }

  // Both anchors are always spelled so an imperative write during a drag and a later
  // React render touch the same four properties. The flash rides along as an
  // animation whose *name* changes with `attention` — a repeat of the same name
  // would not replay, and the className can't carry it because these classes are
  // rewritten on every hide/show.
  const style: CSSProperties = {
    ...(draft.pos
      ? { left: draft.pos.x, top: draft.pos.y, right: 'auto', bottom: 'auto' }
      : { left: 'auto', top: 'auto', right: slotRight(slot), bottom: 0 }),
    zIndex,
    outline: '2px solid transparent',
    animation: draft.attention
      ? `${draft.attention % 2 ? 'composer-flash-a' : 'composer-flash-b'} 700ms ease-out`
      : undefined,
  };

  // A hand-set size is inline; the Tailwind width/height classes remain the
  // default for a window the user has never resized. Minimized ignores it: the
  // collapsed strip is a fixed width, and the size is remembered, not applied.
  const sized = !minimized ? draft.size : null;
  if (sized) style.width = sized.w;

  const drag = useDraggable({
    ref: rootRef,
    style: {
      left: style.left as number | 'auto',
      top: style.top as number | 'auto',
      right: style.right as number | 'auto',
      bottom: style.bottom as number | 'auto',
    },
    minimized,
    size: draft.size,
    onCommit: (pos) => setPos(id, pos),
  });

  const resize = useResizable({
    rootRef,
    bodyRef,
    onCommit: (size, pos) => setSize(id, size, pos),
  });

  // The drop target is this wrapper — the whole window body, so a file can be
  // dropped anywhere in it — but the attachment list lives in the composer body
  // below. The child registers its adder here rather than the state being lifted,
  // which would re-render the window on every keystroke in the editor.
  const addFilesRef = useRef<((incoming: File[]) => void) | null>(null);
  const registerAddFiles = useCallback((fn: (incoming: File[]) => void) => {
    addFilesRef.current = fn;
  }, []);
  const drop = useFileDrop({
    onFiles: (incoming) => addFilesRef.current?.(incoming),
    // Email only, per the feature's scope; internal messages keep the button.
    enabled: draft.kind === 'email',
  });

  // There is no draft autosave, so an accidental × is unrecoverable — unlike Gmail,
  // which is why an always-dismissable window needs the confirm.
  const requestClose = () => {
    if (dirty) setConfirmOpen(true);
    else handleClose();
  };

  const body =
    draft.kind === 'email' ? (
      <EmailComposerBody
        registerAddFiles={registerAddFiles}
        companyId={draft.companyId}
        cloudLabel={draft.cloudLabel}
        signatureHtml={draft.signatureHtml}
        onDirtyChange={setDirty}
        onSendingChange={handleSendingChange}
        onSent={handleClose}
      />
    ) : (
      <InternalComposerBody
        onDirtyChange={setDirty}
        onSendingChange={handleSendingChange}
        onSent={() => {
          notifyInternalSent();
          handleClose();
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
        style={style}
        onPointerDownCapture={() => raise(id)}
        className={cn(
          'pointer-events-auto absolute flex flex-col rounded-t-lg border bg-background shadow-2xl',
          'max-w-[calc(100vw-3rem)]',
          minimized ? 'w-[17rem]' : 'w-[30rem]',
          // Dropped from layout, never unmounted — this is what makes walking to
          // another company and back give the draft back untouched.
          hidden && 'hidden',
        )}
      >
        {/* Resize grip. Top-left because a parked window sits against the
            bottom-right of the screen, so that is the only corner facing into the
            page. A <button> so the drag hook's `closest('button')` guard skips it
            and the title bar underneath never starts a move at the same time. */}
        {!minimized && (
          <button
            type="button"
            {...resize}
            aria-label="Resize"
            title="Drag to resize"
            className="absolute left-0 top-0 z-10 flex h-6 w-6 cursor-nwse-resize touch-none items-center justify-center rounded-tl-lg text-white/40 hover:text-white/90"
          >
            {/* Rotated so the arrows run top-left to bottom-right, matching the
                corner being dragged. */}
            <Maximize2 size={11} className="rotate-90" />
          </button>
        )}

        <div
          {...drag}
          onDoubleClick={() => {
            setPos(id, null);
            setSize(id, null);
          }}
          title="Drag to move · double-click to dock"
          className={cn(
            'flex cursor-move touch-none select-none items-center gap-2 rounded-t-lg bg-slate-800 py-2 pr-3 text-white',
            // Room for the resize grip, which overlays this corner.
            minimized ? 'pl-3' : 'pl-7',
          )}
        >
          <button
            type="button"
            onClick={() => handleMinimize(!minimized)}
            className="min-w-0 flex-1 text-left"
            title={minimized ? 'Expand' : 'Minimize'}
          >
            <div className="truncate text-sm font-medium">New message</div>
            {draft.kind === 'email' && draft.fromAddress && (
              // Which mailbox this sends from — several windows can be open at once
              // and it stays open while the user walks to another company, so it must
              // say who it is writing as.
              <div className="truncate text-[11px] text-slate-300">
                from {draft.fromAddress}
              </div>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleMinimize(!minimized)}
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
          ref={bodyRef}
          {...drop.handlers}
          style={sized ? { height: sized.h } : undefined}
          className={
            minimized
              ? 'hidden'
              : 'relative flex h-[min(32rem,calc(100vh-9rem))] flex-col gap-3 p-3'
          }
        >
          {body}
          {drop.isOver && <FileDropOverlay />}
        </div>
      </div>

      {!hidden && (
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
                  handleClose();
                }}
              >
                Discard
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ── Email ────────────────────────────────────────────────────────────────────

function EmailComposerBody({
  companyId,
  cloudLabel,
  signatureHtml,
  registerAddFiles,
  onDirtyChange,
  onSendingChange,
  onSent,
}: BodyProps & {
  companyId: number;
  cloudLabel: string;
  signatureHtml?: string;
  /** Hands the window's drop target a way to add files to this list. */
  registerAddFiles: (fn: (incoming: File[]) => void) => void;
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

  // One path for every way a file arrives — the paperclip, a drop, a paste — so
  // the de-duping and per-file ceiling can't diverge between them.
  const addFiles = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return;
    setFiles((prev) => {
      const merged = mergeAttachments(prev, incoming);
      setAttachmentNotice(merged.notice);
      return merged.files;
    });
  }, []);
  useEffect(() => registerAddFiles(addFiles), [registerAddFiles, addFiles]);

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
        {/* Not `AttachRow`: that renders its own Attach button above the chips,
            and this window docks the trigger in the footer beside Send instead. */}
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
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

  // No reset-on-open effect is needed the way the old dialog had one: every open
  // creates its own window, and this body is mounted from then until that window is
  // closed or sent — navigating away only hides it.
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
    // An attachment on its own is a message — same rule as outbound email.
    if (!bodyText.trim() && files.length === 0) {
      setError('Write a message or attach a file before sending.');
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
        {/* See the email body above for why this isn't `AttachRow`. */}
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
              MAX_FILE_BYTES,
            );
            setFiles(merged.files);
            setAttachmentNotice(merged.notice);
            e.target.value = '';
          }}
        />
        {attachmentNotice && (
          <p className="text-xs text-amber-600">{attachmentNotice}</p>
        )}
        {/* Internal attachments are stored by us at any size, never off-loaded to
            Drive, so `null` suppresses the "sent as … link" badge. */}
        <AttachmentChips files={files} setFiles={setFiles} cloudLabel={null} />
        <UploadProgressBar progress={sendMutation.uploadProgress} />
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
          disabled={
            sendMutation.isPending ||
            to.length === 0 ||
            (!bodyText.trim() && files.length === 0)
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
