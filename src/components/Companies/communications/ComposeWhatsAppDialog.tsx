import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSendWhatsAppSmart } from '@/hooks/useSendWhatsAppSmart';
import { useSendWhatsAppMedia } from '@/hooks/useSendWhatsAppMedia';
import { useWhatsAppThread } from '@/hooks/useWhatsAppThread';
import { useFileDrop } from '@/hooks/useFileDrop';
import {
  WHATSAPP_CAPTION_LIMIT,
  fileAcceptsCaption,
  type WhatsAppSmartSendResult,
} from '@/api/whatsapp';
import { AttachRow } from '../AttachRow';
import {
  PolishBudgetToggle,
  PolishButton,
  PolishPanel,
} from '../PolishPanel';
import { useDraftPolish } from '@/hooks/useDraftPolish';
import { whatsappBudget } from './polish-budget';
import { DictateButton } from '../DictateButton';
import { FileDropOverlay, UploadProgressBar } from '../ComposerBits';
import { mergeAttachments } from '../message-utils';
import { formatE164, toE164 } from '@/lib/phone';

/**
 * Template messages cap the body at 1024 characters; the server refuses longer outside
 * the window, so the box stops there too.
 */
const TEMPLATE_TEXT_LIMIT = 1024;

/**
 * Start a new WhatsApp conversation — the twin of `ComposeSmsDialog`.
 *
 * ── THE USER ONLY EVER WRITES A MESSAGE ──────────────────────────────────────
 * Meta accepts free-form text only within 24 hours of the customer's last message, and an
 * approved TEMPLATE outside it. This dialog used to make the user pick one and fill in
 * `{{1}}` values, which the people using it could not be expected to understand. Now
 * every send goes through smart send: the server sends a text when it can, and otherwise
 * matches or creates a template in the background (`WhatsAppOutboxService`). The thread
 * shows the message's progress.
 *
 * The window still decides two things here: whether a FILE can go (a template carries
 * none), and the length cap.
 */
export function ComposeWhatsAppDialog({
  open,
  onOpenChange,
  companyId,
  displayNumber,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: number;
  displayNumber: string;
  /** Hands back the peer and the moment, so the caller can open the conversation. */
  onSent: (peer: string, at: string) => void;
}) {
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attached, setAttached] = useState<File[]>([]);
  const [attachNotice, setAttachNotice] = useState<string | null>(null);

  const sendText = useSendWhatsAppSmart(companyId);
  const sendFile = useSendWhatsAppMedia(companyId);

  // A WhatsApp id is the E.164 number without its "+". Resolved here so the lookup below
  // only fires once the number is actually valid.
  const e164 = toE164(to);
  const peer = e164 ? e164.slice(1) : null;

  // Reuses the thread endpoint rather than adding a "can I write to this number" route:
  // it already returns `windowOpenUntil`, and it answers for an unknown peer with null.
  // `active: false` — this is a one-off question, not something to poll every 15s.
  const {
    data: thread,
    isLoading: checking,
    dataUpdatedAt,
  } = useWhatsAppThread(companyId, open ? peer : null, false);

  // Judged against WHEN THE SERVER ANSWERED, not `Date.now()`. Both sides of the
  // comparison then come from the same moment, where a live clock could be read against a
  // cached `windowOpenUntil` from minutes ago. It is also pure, so no ticking state is
  // needed here — unlike `WhatsAppThreadView`, which is open for as long as somebody reads
  // a conversation and really does have to close its composer mid-view.
  const windowOpen =
    !!thread?.windowOpenUntil &&
    new Date(thread.windowOpenUntil).getTime() > dataUpdatedAt;

  /**
   * ⚠️ DERIVED from the window, not synced to it.
   *
   * The number is typed AFTER a file may have been picked, so `windowOpen` can turn false
   * with an attachment already sitting in the dialog — and a template send cannot carry
   * one. Deriving means the file simply stops counting the moment the window shuts (with
   * the notice below saying so), where an effect that cleared the state would be a
   * render-triggering write, and would also throw the file away if the window flickered
   * while the thread query settled.
   */
  const file = windowOpen ? (attached[0] ?? null) : null;
  const captionAllowed = file ? fileAcceptsCaption(file) : true;
  const polish = useDraftPolish('whatsapp');
  const [keepShort, setKeepShort] = useState(true);
  // Recomputed per render: attaching a file drops the cap to Meta's caption limit.
  const polishBudget = whatsappBudget(keepShort, !!file && captionAllowed);
  // No thread to read from in a NEW message -- the static-context precedent.
  const POLISH_CONTEXT =
    'A new WhatsApp message to a client of a bookkeeping firm.';

  /** One file per message — WhatsApp has no multi-attachment message. */
  const addFiles = (incoming: FileList | File[] | null) => {
    if (!incoming) return;
    const list = Array.from(incoming);
    const { files, notice } = mergeAttachments(attached, list, 1);
    setAttached(files);
    setAttachNotice(
      notice ??
        (list.length > 1 || attached.length
          ? 'WhatsApp sends one file per message.'
          : null),
    );
  };

  const { isOver, handlers } = useFileDrop({ onFiles: addFiles });

  const reset = () => {
    setTo('');
    setBody('');
    setError(null);
    setAttached([]);
    setAttachNotice(null);
  };

  const pending = sendText.isPending || sendFile.isPending;
  const sendError =
    (sendText.error as Error)?.message ??
    (sendFile.error as Error)?.message ??
    null;

  const handleSend = () => {
    if (!peer) {
      setError('Enter a valid phone number, e.g. (438) 256-1210');
      return;
    }
    setError(null);
    if (file) {
      sendFile.mutate(
        { to: peer, file, caption: captionAllowed ? body.trim() : '' },
        { onSuccess: (sent) => { reset(); onSent(peer, sent.at); } },
      );
      return;
    }
    if (!body.trim()) {
      setError(windowOpen ? 'Write a message or attach a file first' : 'Write a message first');
      return;
    }
    sendText.mutate(
      { to: peer, text: body.trim() },
      {
        onSuccess: (res: WhatsAppSmartSendResult) => {
          reset();
          onSent(peer, res.kind === 'sent' ? res.message.at : res.pending.createdAt);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" {...handlers}>
        {isOver && windowOpen && <FileDropOverlay label="Drop a file to attach" />}
        <DialogHeader>
          <DialogTitle>New WhatsApp message</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Sending from {formatE164(displayNumber)}
          </p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wa-to">To</Label>
            <Input
              id="wa-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="(438) 256-1210"
              autoComplete="off"
            />
          </div>

          {/* ⚠️ The attach control is shown in EVERY state, disabled with its reason in
              the three where a file cannot be sent. It used to be rendered only inside
              the `windowOpen` branch, which is correct about what WhatsApp accepts and
              wrong about what it communicates: before a number is typed, while the lookup
              settles, and outside the 24-hour window, there was simply no paperclip — so
              it read as "this dialog cannot attach files" rather than "not yet". */}
          {!peer ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Enter a number to see what you can send it.
              </p>
              <AttachRow
                files={[]}
                setFiles={setAttached}
                onPick={addFiles}
                notice={null}
                cloudLabel={null}
                disabledReason="Enter the client's number first."
              />
            </div>
          ) : checking ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Checking this number…
              </p>
              <AttachRow
                files={[]}
                setFiles={setAttached}
                onPick={addFiles}
                notice={null}
                cloudLabel={null}
                disabledReason="Checking whether this number can receive a file…"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-body">Message</Label>
              <Textarea
                id="wa-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  file
                    ? captionAllowed
                      ? 'Add a caption…'
                      : 'WhatsApp shows no caption on this kind of file'
                    : 'Write a WhatsApp message…'
                }
                rows={4}
                maxLength={
                  !windowOpen
                    ? TEMPLATE_TEXT_LIMIT
                    : file && captionAllowed
                      ? WHATSAPP_CAPTION_LIMIT
                      : 4096
                }
                disabled={!!file && !captionAllowed}
              />
              <span className="text-xs text-muted-foreground">
                {windowOpen
                  ? 'They wrote recently, so you can send anything.'
                  : "They haven't written in the last 24 hours, so WhatsApp may take a few minutes to deliver this. You'll see its progress in the conversation."}
              </span>
              {/* A file can only go inside the window: outside it the message travels as
                  an approved template, which carries none. `file` is derived from
                  `windowOpen` above for the same reason. */}
              <AttachRow
                files={windowOpen ? attached : []}
                setFiles={setAttached}
                onPick={addFiles}
                notice={windowOpen ? attachNotice : null}
                cloudLabel={null}
                disabledReason={
                  windowOpen ? undefined : 'You can send files once they reply.'
                }
              />
              {sendFile.uploadProgress !== null && (
                <UploadProgressBar progress={sendFile.uploadProgress} />
              )}
            </div>
          )}

          {(error || sendError) && (
            <p className="text-xs text-destructive">{error ?? sendError}</p>
          )}

          {peer && !checking && (
            <PolishPanel
              polish={polish}
              context={POLISH_CONTEXT}
              budget={polishBudget}
              onAccept={setBody}
            />
          )}
          <div className="flex items-center justify-end gap-2">
            {peer && !checking && (
              <>
                <PolishButton
                  polish={polish}
                  draftPlain={body}
                  context={POLISH_CONTEXT}
                  budget={polishBudget}
                >
                  {polishBudget && (
                    <PolishBudgetToggle
                      polish={polish}
                      budget={polishBudget}
                      onChange={setKeepShort}
                      disabled={pending}
                    />
                  )}
                </PolishButton>
                <DictateButton
                  disabled={pending}
                  onText={(text) =>
                    setBody((b) => (b.trim() ? `${b.trim()} ${text}` : text))
                  }
                />
                <span className="flex-1" />
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={pending || !peer || checking}
              onClick={handleSend}
            >
              <Send size={13} />
              {pending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
