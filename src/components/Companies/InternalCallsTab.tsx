import { useState } from 'react';
import {
  Loader2,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { UserAutocomplete } from './UserAutocomplete';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { useInternalCalls } from '@/hooks/useInternalCalls';
import { useStartInternalCall } from '@/hooks/useStartInternalCall';
import { useInternalCallRecordings } from '@/hooks/useInternalCallRecordings';
import { recordingUrl } from '@/api/phone';
import { formatEmailDate } from './message-utils';
import type { InternalCall } from '@/api/internalCalls';

function duration(sec: number | null): string {
  if (sec === null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const OUTCOME_STYLE: Record<InternalCall['outcome'], string> = {
  answered: 'text-muted-foreground',
  missed: 'text-red-600',
  'in-progress': 'text-teal-600',
};

/** The recording player for one call, fetched only when the row is expanded. */
function CallRecording({ sid }: { sid: string }) {
  const { data, isLoading } = useInternalCallRecordings(sid);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading recording…</p>;
  }
  if (!data?.length) {
    return (
      <p className="text-xs text-muted-foreground">
        No recording for this call.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {data.map((r) => (
        <audio
          key={r.sid}
          controls
          preload="metadata"
          // Points at OUR proxy, never SignalWire — its media URL is unauthenticated.
          src={recordingUrl(r)}
          className="w-full"
        />
      ))}
    </div>
  );
}

/**
 * Staff-to-staff calling, inside the "Cyg Finance" workspace.
 *
 * A call is placed by picking a colleague from the same directory the message composer
 * uses — no phone number is involved anywhere, in either direction.
 *
 * Deliberately modest next to InternalMessagesTab: a call has no thread, so this is a
 * list and a player, modelled on CallDetailView rather than on the mailbox.
 */
export function InternalCallsTab({ active }: { active: boolean }) {
  const { token, user } = useAuth();
  const { data: calls, isLoading } = useInternalCalls(active);
  const { data: directory } = useUserDirectory(active);
  const startCall = useStartInternalCall();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  function placeCall() {
    const calleeId = picked[0];
    if (!calleeId) return;
    setError(null);
    startCall.mutate(calleeId, {
      onSuccess: () => {
        // The overlay takes over from here — it is mounted above the router, so it
        // follows the user anywhere for the rest of the call.
        setDialogOpen(false);
        setPicked([]);
      },
      onError: (e: unknown) =>
        setError(e instanceof Error ? e.message : 'Could not place the call'),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Calls</h2>
        <Button
          onClick={() => {
            setError(null);
            setDialogOpen(true);
          }}
          className="bg-teal-600 text-white hover:bg-teal-500"
        >
          <Phone size={14} className="mr-1.5" />
          New call
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !calls?.length ? (
        <p className="text-sm text-muted-foreground">
          No calls yet. Use “New call” to reach a colleague.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {calls.map((call) => {
            const Icon =
              call.outcome === 'missed'
                ? PhoneMissed
                : call.direction === 'outbound'
                  ? PhoneOutgoing
                  : PhoneIncoming;
            const open = expanded === call.sid;
            return (
              <li key={call.sid} className="p-3">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : call.sid)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <Icon
                    size={16}
                    className={OUTCOME_STYLE[call.outcome]}
                    aria-hidden
                  />
                  <span className="flex-1 truncate text-sm font-medium">
                    {call.peer.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {call.direction === 'outbound' ? 'Outgoing' : 'Incoming'} ·{' '}
                    {duration(call.durationSec)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatEmailDate(call.at)}
                  </span>
                </button>
                {open && (
                  <div className="mt-3 pl-7">
                    <CallRecording sid={call.sid} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Call a colleague</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <UserAutocomplete
              // One person per call. Committing a second replaces the first, so the
              // control cannot get into a state the API would reject.
              value={picked.slice(0, 1)}
              onChange={(next) => setPicked(next.slice(-1))}
              users={(directory ?? []).filter((u) => u.id !== user?.id)}
              placeholder="Type a name…"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            {!token && (
              <p className="text-sm text-red-600">You are signed out.</p>
            )}
          </div>

          <DialogFooter>
            <DialogClose>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              onClick={placeCall}
              disabled={!picked.length || startCall.isPending}
              className="bg-teal-600 text-white hover:bg-teal-500"
            >
              {startCall.isPending ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Phone size={14} className="mr-1.5" />
              )}
              Call
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
