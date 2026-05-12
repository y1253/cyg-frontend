import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchDeletedCompanies, permanentDeleteCompany, restoreCompany } from '@/api/companies';
import { useAuth } from '@/context/AuthContext';

export function useDeletedCompanies() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['companies', 'deleted'],
    queryFn: () => fetchDeletedCompanies(token!),
    enabled: !!token,
  });
}

export function useRestoreCompany() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => restoreCompany(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['companies', 'deleted'] });
    },
  });
}

export function usePermanentDeleteCompany() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => permanentDeleteCompany(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies', 'deleted'] });
    },
  });
}
