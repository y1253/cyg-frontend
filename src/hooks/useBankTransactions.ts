import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  editBankTransaction,
  fetchBankCategories,
  fetchBankTransactions,
} from '@/api/bankTransactions';

const key = (companyId: number) => ['bank-transactions', companyId];

/** step11: the company's categorised bank transactions, 100 families a page. */
export function useBankTransactions(companyId: number, q: string) {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: [...key(companyId), 'page', q],
    queryFn: ({ pageParam }) => fetchBankTransactions(token!, companyId, pageParam, q),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled: !!token && !!companyId,
  });
}

export function useBankCategories(companyId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: [...key(companyId), 'categories'],
    queryFn: () => fetchBankCategories(token!, companyId),
    enabled: !!token && !!companyId,
    staleTime: 5 * 60_000,
  });
}

export function useEditBankTransaction(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      id: number;
      name?: string;
      category?: string;
      scope: 'ALWAYS' | 'ONCE';
    }) => {
      const { id, ...body } = v;
      return editBankTransaction(token!, companyId, id, body);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key(companyId) });
      // The customer's rules may have moved with it (the Rules tab reads them).
      void qc.invalidateQueries({ queryKey: ['customer-rules', companyId] });
    },
  });
}
