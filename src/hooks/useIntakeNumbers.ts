import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { buyIntakeNumber, fetchIntakeNumbers, releaseIntakeNumber } from '@/api/intakeNumbers';
import { useAuth } from '@/context/AuthContext';

const KEY = ['intake-numbers'] as const;

/** The customer site's receipt numbers, active first. ADMIN only. */
export function useIntakeNumbers() {
  const { token } = useAuth();
  return useQuery({ queryKey: KEY, queryFn: () => fetchIntakeNumbers(token!), enabled: !!token });
}

export function useBuyIntakeNumber() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof buyIntakeNumber>[1]) => buyIntakeNumber(token!, data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReleaseIntakeNumber() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, deferIfLocked = false }: { id: number; deferIfLocked?: boolean }) =>
      releaseIntakeNumber(token!, id, deferIfLocked),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
