import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteAiRule,
  deleteCustomerAiRule,
  fetchAiRulePendingCount,
  fetchAiRules,
  fetchCustomerAi,
  updateAiRule,
  type AiRuleStatus,
} from '@/api/aiRules';
import { useAuth } from '@/context/AuthContext';

const KEY = ['ai-rules'] as const;
const CUSTOMER_KEY = ['customer-ai'] as const;

/** Firm-wide AI rules in one review state. ADMIN only. */
export function useAiRules(status: AiRuleStatus) {
  const { token } = useAuth();
  return useQuery({
    queryKey: [...KEY, status],
    queryFn: () => fetchAiRules(token!, status),
    enabled: !!token,
  });
}

/** How many proposals wait for review — the Customer site tab's badge. */
export function useAiRulePendingCount() {
  const { token } = useAuth();
  return useQuery({
    queryKey: [...KEY, 'pending-count'],
    queryFn: () => fetchAiRulePendingCount(token!),
    enabled: !!token,
    staleTime: 60_000,
  });
}

export function useUpdateAiRule() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; text?: string; status?: 'ACTIVE' | 'REJECTED' }) =>
      updateAiRule(token!, id, data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteAiRule() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteAiRule(token!, id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/** One customer's private AI rules and their messages with the assistant. */
export function useCustomerAi(customerId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: [...CUSTOMER_KEY, customerId],
    queryFn: () => fetchCustomerAi(token!, customerId),
    enabled: !!token && customerId > 0,
  });
}

export function useDeleteCustomerAiRule(customerId: number) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: number) => deleteCustomerAiRule(token!, customerId, ruleId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...CUSTOMER_KEY, customerId] }),
  });
}
