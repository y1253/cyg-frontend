import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchCustomerVoice, updateCustomerVoice, type CustomerVoiceChange } from '@/api/customerVoice';

const KEY = ['customer-voice'] as const;

/** step12: the customer site's AI phone settings (ADMIN). */
export function useCustomerVoice() {
  const { token } = useAuth();
  return useQuery({ queryKey: KEY, queryFn: () => fetchCustomerVoice(token!), enabled: !!token });
}

export function useUpdateCustomerVoice() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (change: CustomerVoiceChange) => updateCustomerVoice(token!, change),
    onSuccess: data => qc.setQueryData(KEY, data),
  });
}
