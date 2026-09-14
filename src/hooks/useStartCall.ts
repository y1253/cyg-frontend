import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { startCall } from '@/api/phone';

/**
 * Place a call. The server rings THIS browser first, so the softphone overlay takes
 * over from here — there is nothing to render on success.
 *
 * Note the caller must have already called `unlockAudio()` from the click handler:
 * by the time the INVITE arrives the user gesture is seconds old, and both the
 * ringtone and the microphone prompt depend on it.
 *
 * Settling refreshes the busy-line query either way: on success the line is now busy,
 * and a 409 means it already was and this tab's poll had not caught up.
 */
export function useStartCall(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (to: string) => startCall(token!, companyId, to),
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: ['phone-active-call', companyId] }),
  });
}
