import { useCallback, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSendWhatsApp } from '@/hooks/useSendWhatsApp';
import { useSendWhatsAppTemplate } from '@/hooks/useSendWhatsAppTemplate';
import { useWhatsAppThread } from '@/hooks/useWhatsAppThread';
import { formatE164, toE164 } from '@/lib/phone';
import { TemplatePicker } from './TemplatePicker';

type Picked = { name: string; language: string; variables: string[] } | null;

/**
 * Start a new WhatsApp conversation — the twin of `ComposeSmsDialog`, with one thing
 * that has no SMS equivalent.
 *
 * ── THE 24-HOUR WINDOW DECIDES WHAT YOU GET TO TYPE ───────────────────────────
 * Meta only accepts free-form text within 24 hours of the customer's last message; outside
 * it, an approved template is the only thing that will send. So once a valid number is
 * entered this looks that peer up and shows EITHER a message box OR the template picker.
 *
 * Deciding before the user writes is the whole point. The alternative — the SMS dialog's
 * shape, a textarea and a rejection on send — invites somebody to compose a paragraph that
 * Meta was never going to deliver.
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
  const [picked, setPicked] = useState<Picked>(null);
  const [error, setError] = useState<string | null>(null);

  const sendText = useSendWhatsApp(companyId);
  const sendTemplate = useSendWhatsAppTemplate(companyId);

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

  const reset = () => {
    setTo('');
    setBody('');
    setPicked(null);
    setError(null);
  };

  // Stable, or `TemplatePicker`'s reporting effect would re-run on every render here.
  const handlePicked = useCallback((next: Picked) => setPicked(next), []);

  const pending = sendText.isPending || sendTemplate.isPending;
  const sendError =
    (sendText.error as Error)?.message ??
    (sendTemplate.error as Error)?.message ??
    null;

  const handleSend = () => {
    if (!peer) {
      setError('Enter a valid phone number, e.g. (438) 256-1210');
      return;
    }
    setError(null);
    const done = { onSuccess: (sent: { at: string }) => { reset(); onSent(peer, sent.at); } };

    if (windowOpen) {
      if (!body.trim()) {
        setError('Write a message first');
        return;
      }
      sendText.mutate({ to: peer, body: body.trim() }, done);
      return;
    }
    if (!picked) {
      setError('Choose a template and fill in every value');
      return;
    }
    sendTemplate.mutate({ to: peer, ...picked }, done);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
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

          {!peer ? (
            <p className="text-xs text-muted-foreground">
              Enter a number to see what you can send it.
            </p>
          ) : checking ? (
            <p className="text-xs text-muted-foreground">Checking this number…</p>
          ) : windowOpen ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-body">Message</Label>
              <Textarea
                id="wa-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write a WhatsApp message…"
                rows={4}
                maxLength={4096}
              />
              <span className="text-xs text-muted-foreground">
                They wrote recently, so you can send anything.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                {thread?.windowOpenUntil
                  ? 'It is more than 24 hours since they last wrote, so WhatsApp only accepts an approved template.'
                  : 'This number has never messaged you, so WhatsApp only accepts an approved template as the first message.'}
              </p>
              <TemplatePicker
                companyId={companyId}
                enabled={open}
                onChange={handlePicked}
              />
            </div>
          )}

          {(error || sendError) && (
            <p className="text-xs text-destructive">{error ?? sendError}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={pending || !peer || checking || (!windowOpen && !picked)}
              onClick={handleSend}
            >
              <Send size={13} />
              {pending ? 'Sending…' : windowOpen ? 'Send' : 'Send template'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
