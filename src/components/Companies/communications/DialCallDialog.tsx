import { useState } from 'react';
import { Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatE164, toE164 } from '@/lib/phone';

/**
 * Call any number from the company's support line.
 *
 * The per-row Call buttons only reach numbers already in the feed, which is no use for
 * ringing a client who has never called in. Same shape as `ComposeSmsDialog` on purpose
 * — the two sit side by side in the header and should not feel like different features.
 *
 * `onDial` is expected to call `unlockAudio()` synchronously; see `handleCall` in
 * CommunicationsTab. The browser rings a second or two after this closes, and by then
 * the click is far too stale to grant microphone access on its own.
 */
export function DialCallDialog({
  open,
  onOpenChange,
  supportNumber,
  onDial,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supportNumber: string;
  onDial: (e164: string) => void;
  pending: boolean;
  error: string | null;
}) {
  const [to, setTo] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    const number = toE164(to);
    if (!number) {
      setLocalError('Enter a valid phone number, e.g. (438) 256-1210');
      return;
    }
    setLocalError(null);
    onDial(number);
    setTo('');
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setTo('');
          setLocalError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New call</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            They will see {formatE164(supportNumber)} as the caller.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dial-to">Number</Label>
            <Input
              id="dial-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              // Enter is the natural way to dial once a number is typed.
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              placeholder="(438) 256-1210"
              autoComplete="off"
              inputMode="tel"
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Your browser rings first — answer it and we will dial them.
          </p>
          {(localError || error) && (
            <p className="text-xs text-destructive">{localError ?? error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1 bg-green-600 text-white hover:bg-green-500"
              disabled={pending}
              onClick={submit}
            >
              <Phone size={13} />
              {pending ? 'Calling…' : 'Call'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
