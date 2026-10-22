import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAiEscalations,
  fetchAiInstructionChanges,
  fetchAiInstructions,
  revertAiInstructionChange,
  updateAiInstruction,
} from '@/api/aiInstructions';
import { useAuth } from '@/context/AuthContext';

const KEY = ['ai-instructions'] as const;

/** Every live AI instruction block, the strong AI's included. ADMIN only. */
export function useAiInstructions() {
  const { token } = useAuth();
  return useQuery({
    queryKey: [...KEY, 'list'],
    queryFn: () => fetchAiInstructions(token!),
    enabled: !!token,
  });
}

/** The latest changes to them — the strong AI's own edits first among them. */
export function useAiInstructionChanges() {
  const { token } = useAuth();
  return useQuery({
    queryKey: [...KEY, 'changes'],
    queryFn: () => fetchAiInstructionChanges(token!),
    enabled: !!token,
  });
}

/** Complaints handed to the strong AI; polls while one is still being checked. */
export function useAiEscalations() {
  const { token } = useAuth();
  return useQuery({
    queryKey: [...KEY, 'escalations'],
    queryFn: () => fetchAiEscalations(token!),
    enabled: !!token,
    refetchInterval: (q) => (q.state.data?.some((e) => e.verdict === 'RUNNING') ? 10_000 : false),
  });
}

export function useUpdateAiInstruction() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; text: string; reason?: string }) =>
      updateAiInstruction(token!, id, data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRevertAiInstructionChange() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changeId: number) => revertAiInstructionChange(token!, changeId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
