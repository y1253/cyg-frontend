import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { editNames, fetchNamesFull } from '@/api/customerNames';

export const namesFullKey = (companyId: number) => ['customer-names-full', companyId];

/** 2026-11-27: the customer site's Names-tab view of the company's book (the name editor). */
export function useCustomerNamesFull(companyId: number, enabled = true) {
  const { token } = useAuth();
  return useQuery({
    queryKey: namesFullKey(companyId),
    queryFn: () => fetchNamesFull(token!, companyId),
    enabled: !!token && !!companyId && enabled,
    staleTime: 30_000,
  });
}

/** One change of a name's settings; every route answers the fresh view. */
export function useEditNames(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      method: 'PUT' | 'POST' | 'PATCH' | 'DELETE';
      path: string;
      body: object;
    }) => editNames(token!, companyId, v.method, v.path, v.body),
    onSuccess: (view) => {
      if (view) qc.setQueryData(namesFullKey(companyId), view);
      void qc.invalidateQueries({ queryKey: ['customer-names', companyId] });
      void qc.invalidateQueries({ queryKey: ['customer-rules', companyId] });
      void qc.invalidateQueries({ queryKey: ['bank-transactions', companyId] });
    },
  });
}
