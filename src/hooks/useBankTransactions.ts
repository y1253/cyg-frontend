import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  editBankTransaction,
  fetchBankCategories,
  fetchBankColumns,
  fetchBankTransactions,
  saveBankAnswer,
  type BankCell,
  type BankTransactionPage,
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

/** step11 part 4: the book's own columns (QuickBooks class / location / customer / fields). */
export function useBankColumns(companyId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: [...key(companyId), 'columns'],
    queryFn: () => fetchBankColumns(token!, companyId),
    enabled: !!token && !!companyId,
    staleTime: 60_000,
  });
}

/** Writes a row's cells into every loaded page. */
function putCells(
  qc: ReturnType<typeof useQueryClient>,
  companyId: number,
  id: number,
  cells: (old: Record<number, BankCell>) => Record<number, BankCell>,
) {
  qc.setQueriesData<InfiniteData<BankTransactionPage>>(
    { queryKey: [...key(companyId), 'page'] },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((p) => ({
          ...p,
          rows: p.rows.map((r) => (r.id === id ? { ...r, custom: cells(r.custom ?? {}) } : r)),
        })),
      },
  );
}

/**
 * step11 part 4: one cell, shown at once (rolled back with the server's reason on a refusal).
 * The customer API checks it and sends it to QuickBooks.
 */
export function useSaveBankAnswer(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      id: number;
      columnId: number;
      value: string | null;
      dropDownId: number | null;
      label: string | null;
    }) =>
      saveBankAnswer(token!, companyId, v.id, v.columnId, {
        value: v.value,
        dropDownId: v.dropDownId,
      }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: [...key(companyId), 'page'] });
      const before = qc.getQueriesData<InfiniteData<BankTransactionPage>>({
        queryKey: [...key(companyId), 'page'],
      });
      putCells(qc, companyId, v.id, (old) => {
        const next = { ...old };
        if (v.value === null && v.dropDownId === null) delete next[v.columnId];
        else next[v.columnId] = { value: v.label ?? v.value, dropDownId: v.dropDownId };
        return next;
      });
      return { before };
    },
    onError: (_err, _v, ctx) => {
      for (const [k, data] of ctx?.before ?? []) qc.setQueryData(k, data);
    },
    onSuccess: (cells, v) => putCells(qc, companyId, v.id, () => cells),
  });
}
