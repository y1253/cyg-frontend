import { useState } from 'react';
import { Loader2, PhoneForwarded } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UserAutocomplete } from '@/components/Companies/UserAutocomplete';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { usePresence } from '@/hooks/usePresence';
import { useAuth } from '@/context/AuthContext';

interface TransferPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Hands back the chosen colleague. Errors are surfaced here, inside the dialog. */
  onTransfer: (targetUserId: number) => Promise<void>;
}

/**
 * "Who should take this call?"
 *
 * Reuses `UserAutocomplete` rather than a free-text field, and that is the whole
 * enforcement of "staff only, never a phone number": that control commits ONLY a
 * directory pick, so a typed string can never become a destination. The server takes a
 * user id for the same reason. Neither side relies on validation to keep an arbitrary
 * number out — there is nowhere to put one.
 *
 * Single-pick idiom (`slice(0, 1)` / `slice(-1)`) lifted verbatim from
 * `InternalCallsTab`: committing a second person replaces the first, so the control
 * cannot reach a state the API would reject.
 */
export function TransferPicker({
  open,
  onOpenChange,
  onTransfer,
}: TransferPickerProps) {
  const { user } = useAuth();
  const { data: directory } = useUserDirectory(open);
  const { data: presence } = usePresence(open);
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const online = new Set(presence?.userIds ?? []);
  const targetId = picked[0];

  async function go() {
    if (!targetId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onTransfer(targetId);
      onOpenChange(false);
      setPicked([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not transfer the call');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer this call</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <UserAutocomplete
            value={picked.slice(0, 1)}
            onChange={(next) => setPicked(next.slice(-1))}
            users={(directory ?? []).filter((u) => u.id !== user?.id)}
            placeholder="Type a colleague's name…"
          />
          {targetId !== undefined && !online.has(targetId) && (
            /*
             * Advisory, never a block. Presence is true only while a colleague holds an
             * open SSE stream, and the office TLS proxy blackholes SSE — so somebody
             * perfectly reachable can show as away. Saying so beats hiding them.
             */
            <p className="text-sm text-amber-600">
              They may be away — we cannot see an open session. The call will still
              ring, and goes to voicemail if nobody picks up.
            </p>
          )}
          <p className="text-sm text-slate-500">
            The call is handed over straight away and you drop out.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            onClick={() => void go()}
            disabled={targetId === undefined || busy}
            className="bg-teal-600 text-white hover:bg-teal-500"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PhoneForwarded className="h-4 w-4" />
            )}
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
