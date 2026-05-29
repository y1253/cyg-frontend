import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchNotes, createNote, updateNote, deleteNote } from '@/api/notes';

export function useNotes(companyId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['notes', companyId],
    queryFn: () => fetchNotes(token!, companyId),
    enabled: !!token && !!companyId,
  });
}

export function useCreateNote(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { companyId: number; content: string }) => createNote(token!, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notes', companyId] });
    },
  });
}

export function useUpdateNote(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) =>
      updateNote(token!, id, { content }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notes', companyId] });
    },
  });
}

export function useDeleteNote(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteNote(token!, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notes', companyId] });
    },
  });
}
