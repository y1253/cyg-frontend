import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  PolishBudgetToggle,
  PolishButton,
  PolishPanel,
} from '../PolishPanel';
import { useDraftPolish } from '@/hooks/useDraftPolish';
import { smsBudget } from './polish-budget';
import { DictateButton } from '../DictateButton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSendSms } from '@/hooks/useSendSms';
import {
  MAX_MMS_FILES,
  MAX_MMS_UPLOAD_BYTES,
  MMS_ACCEPT,
  isMmsImageFile,
} from '@/api/phone';
import { useFileDrop } from '@/hooks/useFileDrop';
import { AttachRow } from '../AttachRow';
import { FileDropOverlay } from '../ComposerBits';
import { mergeAttachments } from '../message-utils';
import { formatE164, toE164 } from '@/lib/phone';

/**
 * Start a new text conversation.
 *
 * Deliberately not the docked composer the email side uses: that window exists so a
 * long email survives navigating away, which a text message does not need.
 */
export function ComposeSmsDialog({
  open,
  onOpenChange,
  companyId,
  supportNumber,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: number;
  supportNumber: string;
  /** Hands back the peer and the moment, so the caller can open the conversation. */
  onSent: (peer: string, at: string) => void;
}) {
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attached, setAttached] = useState<File[]>([]);
  const [attachNotice, setAttachNotice] = useState<string | null>(null);
  const sendMutation = useSendSms(companyId);
  const polish = useDraftPolish('sms');
  // Default ON: every text is billed by the segment.
  const [keepShort, setKeepShort] = useState(true);
  const polishBudget = smsBudget(keepShort);
  // A new message has no thread to read, so the context is a static sentence -- the
  // `INTERNAL_POLISH_CONTEXT` precedent. `context` is @IsNotEmpty() server-side, so it
  // cannot simply be omitted.
  const POLISH_CONTEXT = 'A new text message to a client of a bookkeeping firm.';

  /** Same funnel as the reply composer: paperclip, paste and drop, one set of limits. */
  const addFiles = (picked: FileList | File[] | null) => {
    if (!picked) return;
    const { files, notice } = mergeAttachments(
      attached,
      Array.from(picked),
      MAX_MMS_FILES,
      MAX_MMS_UPLOAD_BYTES,
      isMmsImageFile,
    );
    setAttached(files);
    setAttachNotice(notice);
  };

  const { isOver, handlers } = useFileDrop({ onFiles: addFiles });

  const reset = () => {
    setTo('');
    setBody('');
    setError(null);
    setAttached([]);
    setAttachNotice(null);
  };

  const handleSend = () => {
    const peer = toE164(to);
    if (!peer) {
      // Validated here rather than by the browser: the field is a plain text input so
      // a paste like "(438) 256-1210" still works, and the server's own rejection
      // would arrive only after a round-trip.
      setError('Enter a valid phone number, e.g. (438) 256-1210');
      return;
    }
    // A picture with no words is an ordinary message, so the text is only required when
    // there is nothing else to send. The server agrees — `SendSmsDto.body` is optional.
    if (!body.trim() && attached.length === 0) {
      setError('Write a message or attach a picture first');
      return;
    }
    setError(null);
    sendMutation.mutate(
      { to: peer, body: body.trim(), attachments: attached },
      {
        onSuccess: (sent) => {
          reset();
          onSent(peer, sent.at);
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
        {isOver && <FileDropOverlay label="Drop a picture to attach" />}
        <DialogHeader>
          <DialogTitle>New text message</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Sending from {formatE164(supportNumber)}
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sms-to">To</Label>
            <Input
              id="sms-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="(438) 256-1210"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sms-body">Message</Label>
            <Textarea
              id="sms-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write a text message…"
              rows={4}
              maxLength={1600}
            />
            <span className="text-xs text-muted-foreground">
              {body.length} characters
              {attached.length > 0 && ' · sent as a picture message (MMS)'}
            </span>
          </div>
          <AttachRow
            files={attached}
            setFiles={setAttached}
            onPick={addFiles}
            notice={attachNotice}
            cloudLabel={null}
            accept={MMS_ACCEPT}
          />
          {(error || sendMutation.isError) && (
            <p className="text-xs text-destructive">
              {error ?? (sendMutation.error as Error)?.message ?? 'Failed to send'}
            </p>
          )}
          <PolishPanel
            polish={polish}
            context={POLISH_CONTEXT}
            budget={polishBudget}
            onAccept={setBody}
          />
          <div className="flex items-center justify-end gap-2">
            {/* Plain text both ways -- see SmsThreadView. */}
            <PolishButton
              polish={polish}
              draftPlain={body}
              context={POLISH_CONTEXT}
              budget={polishBudget}
            >
              <PolishBudgetToggle
                polish={polish}
                budget={polishBudget}
                onChange={setKeepShort}
                disabled={sendMutation.isPending}
              />
            </PolishButton>
            <DictateButton
              disabled={sendMutation.isPending}
              onText={(text) =>
                setBody((b) => (b.trim() ? `${b.trim()} ${text}` : text))
              }
            />
            <span className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
              disabled={sendMutation.isPending}
              onClick={handleSend}
            >
              <Send size={13} />
              {sendMutation.isPending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
