import { useState } from 'react';
import { Loader2, Phone, PhoneOff, PhoneOutgoing } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAuth } from '@/context/AuthContext';
import { useSoftphone } from '@/context/SoftphoneContext';
import { usePresence } from '@/hooks/usePresence';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { useInternalDial } from '@/hooks/useInternalDial';
import { callBlockedReason } from '@/components/Companies/communications/call-busy';

/**
 * The phone in the header: what state the softphone is in, and who you can ring.
 *
 * ── THE INDICATOR HALF, WHICH MUST SURVIVE ────────────────────────────────────
 * This started life as a status pill and nothing else, because a softphone that silently
 * failed to register looks EXACTLY like a quiet afternoon — an ambiguity that cost
 * several rounds of "no calls are coming in" during the calling increment. Whatever else
 * this grows into, it must keep distinguishing "registered" from "not" at a glance.
 *
 * ── THE DIALER HALF ───────────────────────────────────────────────────────────
 * Calling a colleague used to mean navigating into the internal workspace, opening its
 * Communications tab and using "New call" — three steps and a page load for the most
 * common call in the firm. The icon was already on every page; it just was not clickable.
 *
 * Deliberately colleagues ONLY. Dialling a client needs a company's support number as the
 * caller ID, so it belongs on that company's page where the number is unambiguous; there
 * is no sensible answer to "which of our numbers is this call from" up here.
 */
export function SoftphoneStatus() {
  const { status, calls } = useSoftphone();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // Nothing configured server-side: not a fault, and not worth a phone icon on every
  // page that cannot do anything.
  if (status === 'unavailable') return null;

  const label: Record<string, string> = {
    idle: 'Phone: starting…',
    connecting: 'Phone: connecting…',
    registered: 'Phone: ready for calls',
    failed: 'Phone: NOT connected — you will not receive calls',
  };
  const ok = status === 'registered';
  const pending = status === 'idle' || status === 'connecting';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title={`${label[status]} — click to call a colleague`}
        aria-label={`${label[status]}. Call a colleague`}
        className={[
          'flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-colors',
          ok
            ? 'bg-green-100 text-green-700 hover:bg-green-200'
            : pending
              ? 'bg-muted text-muted-foreground hover:bg-muted/80'
              : 'bg-red-100 text-red-700 hover:bg-red-200',
        ].join(' ')}
      >
        {ok ? <Phone size={11} /> : <PhoneOff size={11} />}
        {/* The word is the first thing to go on a narrow screen: the header already
            carries a hamburger, the title, the missed-call pill, the bell and the
            avatar. The icon and its colour say the state on their own. */}
        <span className="hidden sm:inline">
          {ok ? 'Phone' : pending ? '…' : 'Offline'}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <ColleagueDialer
          open={open}
          selfId={user?.id}
          calls={calls}
          onCalled={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function ColleagueDialer({
  open,
  selfId,
  calls,
  onCalled,
}: {
  open: boolean;
  selfId: number | undefined;
  calls: { info: { companyId: number; kind?: 'company' | 'internal' } }[];
  onCalled: () => void;
}) {
  const { data: directory } = useUserDirectory(open);
  const { data: presence } = usePresence(open);
  const { dial, isPending } = useInternalDial();
  const [error, setError] = useState<string | null>(null);

  const online = new Set(presence?.userIds ?? []);
  const onCall = new Set(presence?.busyUserIds ?? []);

  /**
   * `companyId: -1` with `activeCall: undefined`, exactly as the internal tab does: a
   * staff call sits on no company's line, so nothing in `calls` can match it and only
   * the "a call is already being placed" clause can fire.
   */
  const blocked = callBlockedReason({
    activeCall: undefined,
    local: {
      calls: calls.map((c) => ({
        companyId: c.info.companyId,
        kind: c.info.kind,
      })),
    },
    companyId: -1,
    starting: isPending,
  });

  const people = (directory ?? []).filter((u) => u.id !== selfId);

  return (
    <div className="flex flex-col">
      <div className="border-b px-3 py-2">
        <p className="text-sm font-semibold">Call a colleague</p>
        <p className="text-xs text-muted-foreground">
          Staff to staff — no phone number involved.
        </p>
      </div>

      {error && (
        <p className="border-b bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="max-h-72 overflow-y-auto py-1">
        {people.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            No colleagues to call.
          </p>
        ) : (
          people.map((u) => {
            const busy = onCall.has(u.id);
            const state = busy ? 'On a call' : online.has(u.id) ? 'Available' : 'Away';
            return (
              <button
                key={u.id}
                type="button"
                /**
                 * ⚠️ Disabled by `blocked` ONLY — NEVER by presence.
                 *
                 * Presence is advisory: a colleague with the app closed is absent from
                 * it, and so is one whose heartbeat is a second late. Greying those out
                 * would make a perfectly reachable person unreachable from here, which is
                 * the exact failure the presence route's own docblock warns about. The
                 * dot is a hint; the button always works.
                 */
                disabled={!!blocked}
                title={blocked ?? `Call ${u.name}`}
                onClick={() => {
                  setError(null);
                  dial(u.id, {
                    peerName: u.name,
                    onSuccess: onCalled,
                    onError: setError,
                  });
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span
                  aria-hidden
                  className={[
                    'size-2 shrink-0 rounded-full',
                    busy
                      ? 'bg-amber-500'
                      : online.has(u.id)
                        ? 'bg-green-500'
                        : 'bg-muted-foreground/30',
                  ].join(' ')}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{u.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {state}
                  </span>
                </span>
                {isPending ? (
                  <Loader2
                    size={14}
                    className="shrink-0 animate-spin text-muted-foreground"
                  />
                ) : (
                  <PhoneOutgoing size={14} className="shrink-0 text-green-700" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
