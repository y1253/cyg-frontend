import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSendSms } from '@/hooks/useSendSms';
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
  const sendMutation = useSendSms(companyId);

  const reset = () => {
    setTo('');
    setBody('');
    setError(null);
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
    if (!body.trim()) {
      setError('Write a message first');
      return;
    }
    setError(null);
    sendMutation.mutate(
      { to: peer, body: body.trim() },
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
      <DialogContent className="sm:max-w-md">
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
            <span className="text-xs text-muted-foreground">{body.length} characters</span>
          </div>
          {(error || sendMutation.isError) && (
            <p className="text-xs text-destructive">
              {error ?? (sendMutation.error as Error)?.message ?? 'Failed to send'}
            </p>
          )}
          <div className="flex justify-end gap-2">
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
