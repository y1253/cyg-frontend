import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { startInternalCall } from '@/api/internalCalls';

export function useStartInternalCall() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (calleeId: number) => startInternalCall(token!, calleeId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['internal-calls'] });
    },
  });
}
