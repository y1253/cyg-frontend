import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  buyIntakeNumber,
  disableIntakeWhatsApp,
  enableIntakeWhatsApp,
  fetchIntakeNumbers,
  isWhatsAppSettingUp,
  releaseIntakeNumber,
} from '@/api/intakeNumbers';
import { useAuth } from '@/context/AuthContext';

const KEY = ['intake-numbers'] as const;

/** The customer site's receipt numbers, active first. ADMIN only. */
export function useIntakeNumbers() {
  const { token } = useAuth();
  return useQuery({
    queryKey: KEY,
    queryFn: () => fetchIntakeNumbers(token!),
    enabled: !!token,
    // WhatsApp setup finishes on the server (Meta's code is read off the number): poll only
    // while a number is still being set up.
    refetchInterval: (q) => (q.state.data?.some(isWhatsAppSettingUp) ? 4000 : false),
  });
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

export function useEnableIntakeWhatsApp() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => enableIntakeWhatsApp(token!, id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDisableIntakeWhatsApp() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => disableIntakeWhatsApp(token!, id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
