import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  fetchQboImportSettings,
  updateQboImportSettings,
  type QboImportSettings,
} from '@/api/qboImport';

const KEY = ['qbo-import-settings'];

/** step11 part 2: does the AI review the QuickBooks import (and ask the admin)? */
export function useQboImportSettings() {
  const { token } = useAuth();
  return useQuery({
    queryKey: KEY,
    queryFn: () => fetchQboImportSettings(token!),
    enabled: !!token,
  });
}

export function useUpdateQboImportSettings() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: QboImportSettings) => updateQboImportSettings(token!, data),
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}
