import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { polishReply, type PolishReplyPayload } from '@/api/ai';

// Polish a draft reply with the AI. The polished text is consumed at the call
// site via mutate(payload, { onSuccess }) — nothing to invalidate.
export function usePolishReply() {
  const { token } = useAuth();
  return useMutation({
    mutationFn: (payload: PolishReplyPayload) => polishReply(token!, payload),
  });
}
