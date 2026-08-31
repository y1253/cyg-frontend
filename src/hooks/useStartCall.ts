import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { startCall } from '@/api/phone';

/**
 * Place a call. The server rings THIS browser first, so the softphone overlay takes
 * over from here — there is nothing to render on success.
 *
 * Note the caller must have already called `unlockAudio()` from the click handler:
 * by the time the INVITE arrives the user gesture is seconds old, and both the
 * ringtone and the microphone prompt depend on it.
 */
export function useStartCall(companyId: number) {
  const { token } = useAuth();
  return useMutation({
    mutationFn: (to: string) => startCall(token!, companyId, to),
  });
}
