import { useCallback, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { useSoftphone } from '@/context/SoftphoneContext';
import { startCall, type ActiveCall } from '@/api/phone';
import { startInternalCall } from '@/api/internalCalls';
import type { UnreadFeedItem } from '@/api/gmail';
import { callBlockedReason } from '@/components/Companies/communications/call-busy';
import { unlockAudio } from '@/lib/notificationSound';
import { returnCallTarget } from '@/components/Layout/unread-feed';

/**
 * Ring back the caller on a notification row, from the bell or the header pill.
 *
 * The per-company dial sites cannot serve this for the same reason `useMarkFeedItemRead`
 * exists: they bind a `companyId` at mount, and a row's company is only known at click
 * time. So this dispatches on the row's own `(scope, kind)` and calls the same endpoints
 * `CommunicationsTab.handleCall` and `InternalCommunicationsTab.placeCall` do.
 *
 * ⚠️ `unlockAudio()` has to run SYNCHRONOUSLY inside the click, before any await. It is
 * what buys the browser's permission to play the ringback and the call audio, and a
 * gesture that has already yielded to a promise no longer counts as one. Every existing
 * dial site does this; it is the easiest thing here to get subtly wrong, because the
 * failure is a silent call with no audio rather than an error.
 */

/**
 * "A dial is in flight" — module-level, and deliberately NOT per row.
 *
 * `CommunicationsTab` keeps a `startingCallRef` because two clicks land before React can
 * re-render a disabled button. A LIST of rows makes that more likely, not less, and the
 * second click would usually be a DIFFERENT row — so a per-row flag would not catch it and
 * the agent would place two calls at once.
 */
let dialInFlight = false;

export function useReturnCall() {
  const { token } = useAuth();
  const { pushToast } = useNotifications();
  const { calls } = useSoftphone();
  const [pendingId, setPendingId] = useState<string | null>(null);

  /**
   * Why is this row's button disabled, if it is?
   *
   * `activeCall` is deliberately undefined: that field comes from a PER-COMPANY query, and
   * asking for it here would be one request per row on a list that polls every minute. The
   * cost is that "somebody else is on this line, in another browser" is invisible until the
   * server refuses — which is exactly why the failure path below raises a toast instead of
   * swallowing the error.
   */
  const blockedReason = (item: UnreadFeedItem): string | null => {
    const target = returnCallTarget(item);
    if (!target) return null;
    return callBlockedReason({
      activeCall: undefined as ActiveCall | undefined,
      // Flattened to the two fields `call-busy` needs, exactly as `CommunicationsTab`
      // does — the softphone's own `CallView` carries far more than this decision wants.
      local: {
        calls: calls.map((c) => ({
          companyId: c.info.companyId,
          kind: c.info.kind,
        })),
      },
      // A staff call is not on any company's line, so nothing in `calls` can match it and
      // only the `starting` clause applies. -1 is never a real company id.
      companyId: target.scope === 'company' ? target.companyId : -1,
      starting: dialInFlight || pendingId !== null,
    });
  };

  const returnCall = useCallback(
    (item: UnreadFeedItem, onPlaced?: () => void) => {
      const target = returnCallTarget(item);
      if (!target || dialInFlight) return;
      // Before anything async. See the warning above.
      unlockAudio();
      dialInFlight = true;
      setPendingId(item.id);

      const placing =
        target.scope === 'company'
          ? startCall(token!, target.companyId, target.to)
          : startInternalCall(token!, target.calleeId);

      void placing
        .then(() => {
          // Calling back IS handling it. A row that stays put after the phone starts
          // ringing reads as a button that did nothing.
          onPlaced?.();
        })
        .catch((err: unknown) => {
          // The server refuses a dial on a busy line with a 409 whose message names who is
          // on it. Without this it would vanish and the button would look broken.
          pushToast({
            title: 'Could not call back',
            body:
              err instanceof Error && err.message
                ? err.message
                : 'The call could not be placed.',
          });
        })
        .finally(() => {
          dialInFlight = false;
          setPendingId(null);
        });
    },
    [token, pushToast],
  );

  return { returnCall, blockedReason, pendingId };
}
