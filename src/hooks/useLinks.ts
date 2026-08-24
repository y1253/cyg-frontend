import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  fetchLinks,
  createLink,
  updateLink,
  deleteLink,
  reorderLinks,
  type CompanyLink,
} from '@/api/links';

export function useLinks(companyId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['links', companyId],
    queryFn: () => fetchLinks(token!, companyId),
    enabled: !!token && !!companyId,
  });
}

export function useCreateLink(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof createLink>[1]) =>
      createLink(token!, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['links', companyId] });
    },
  });
}

export function useUpdateLink(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateLink>[2] }) =>
      updateLink(token!, id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['links', companyId] });
    },
  });
}

/**
 * Persist a drag-reorder.
 *
 * Unlike the invalidate-only mutations above this one MUST write the new order
 * into the cache in `onMutate`: the drop has already moved the row on screen, and
 * waiting for the round-trip would let the list snap back to the old order for a
 * frame. `onError` restores the snapshot; `onSettled` re-syncs with the server.
 */
export function useReorderLinks(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const key = ['links', companyId];
  return useMutation({
    mutationFn: (ids: number[]) => reorderLinks(token!, companyId, ids),
    onMutate: async (ids: number[]) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<CompanyLink[]>(key);
      if (previous) {
        const byId = new Map(previous.map((l) => [l.id, l]));
        const next = ids
          .map((id) => byId.get(id))
          .filter((l): l is CompanyLink => !!l);
        // Anything the caller didn't list (a link added in another tab) keeps its
        // place at the end rather than vanishing from the list.
        for (const l of previous) if (!ids.includes(l.id)) next.push(l);
        qc.setQueryData(key, next);
      }
      return { previous };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useDeleteLink(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteLink(token!, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['links', companyId] });
    },
  });
}
