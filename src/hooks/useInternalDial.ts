import { useCallback, useRef } from 'react';
import { unlockAudio } from '@/lib/notificationSound';
import { useSoftphoneActions } from '@/context/SoftphoneContext';
import { useStartInternalCall } from '@/hooks/useStartInternalCall';

/**
 * Place a staff-to-staff call — the ONE path that does it.
 *
 * ── WHY THIS IS A HOOK AND NOT THREE COPIES ───────────────────────────────────
 * Dialling a colleague has a recipe with two steps that are easy to leave out and whose
 * omission is invisible:
 *
 *  1. ⚠️ `unlockAudio()` runs SYNCHRONOUSLY inside the click, before any await. Browsers
 *     grant audio playback and microphone access only off a real user gesture, and a
 *     gesture that has yielded to a promise no longer counts as one. The failure is a
 *     call that connects with NO AUDIO and no error anywhere — the hardest kind to
 *     attribute, and `InternalCommunicationsTab.placeCall` shipped without it for exactly
 *     that reason.
 *  2. `beginDialing` BEFORE the request, so the "Calling…" card stands in the one-to-
 *     three seconds of DB and provider round trips during which the button otherwise
 *     looks broken.
 *
 * An in-flight guard rather than the mutation's `isPending`, because a LIST of call-back
 * buttons is a realistic double-click surface and `isPending` lags a render behind.
 *
 * A staff call has no sid to latch: `beginDialing`'s card is dismissed by the INVITE
 * pairing or by its own TTL, never by `placed`. `companyId: -1` is the sentinel
 * `callBlockedReason` already takes — a staff call sits on no company's line, and each
 * participant's real workspace id arrives with the event once it pairs.
 */
export function useInternalDial() {
  const { beginDialing } = useSoftphoneActions();
  const startCall = useStartInternalCall();
  const inFlight = useRef(false);

  const dial = useCallback(
    (
      calleeId: number | undefined,
      opts: {
        peerName?: string | null;
        onSuccess?: () => void;
        onError?: (message: string) => void;
      } = {},
    ) => {
      if (!calleeId || inFlight.current) return;
      inFlight.current = true;
      unlockAudio();

      const name = opts.peerName ?? null;
      const handle = beginDialing({
        companyId: -1,
        companyName: name ?? 'a colleague',
        to: null,
        peerName: name,
        kind: 'internal',
        cancelled: false,
      });

      startCall.mutate(calleeId, {
        onSuccess: () => opts.onSuccess?.(),
        onError: (e: unknown) => {
          // Nothing will ring, so the optimistic card goes with the error.
          handle.done();
          opts.onError?.(
            e instanceof Error ? e.message : 'Could not place the call',
          );
        },
        // Cleared on failure too, or retrying after an error is silently swallowed.
        onSettled: () => {
          inFlight.current = false;
        },
      });
    },
    [beginDialing, startCall],
  );

  return { dial, isPending: startCall.isPending };
}
