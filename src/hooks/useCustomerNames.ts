import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  fetchCustomerNames,
  mergeCustomerNames,
  type MergeNamesBody,
} from '@/api/customerRules';

const key = (companyId: number) => ['customer-names', companyId];

/** step11 part 2 (2026-11-26): every payee name of the company's book (the Rules tab's drag list). */
export function useCustomerNames(companyId: number, enabled = true) {
  const { token } = useAuth();
  return useQuery({
    queryKey: key(companyId),
    queryFn: () => fetchCustomerNames(token!, companyId),
    enabled: !!token && !!companyId && enabled,
    staleTime: 30_000,
  });
}

/** Merge a name / sub-name into another; the answer is the fresh list. Rules change too. */
export function useMergeCustomerNames(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MergeNamesBody) => mergeCustomerNames(token!, companyId, body),
    onSuccess: (names) => {
      qc.setQueryData(key(companyId), names);
      void qc.invalidateQueries({ queryKey: ['customer-rules', companyId] });
    },
  });
}
