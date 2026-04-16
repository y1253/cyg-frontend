import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchLinks, createLink, updateLink, deleteLink } from '@/api/links';

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
    mutationFn: (data: { companyId: number; label: string; url: string }) =>
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
    mutationFn: ({ id, data }: { id: number; data: { label?: string; url?: string } }) =>
      updateLink(token!, id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['links', companyId] });
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
