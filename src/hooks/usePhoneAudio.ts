import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  deletePhoneAudio,
  fetchPhoneAudio,
  renamePhoneAudio,
  uploadPhoneAudio,
  type PhoneAudio,
} from '@/api/phoneAudio';

const KEY = ['phone-audio'];

export function usePhoneAudio() {
  const { token } = useAuth();
  return useQuery<PhoneAudio[]>({
    queryKey: KEY,
    queryFn: () => fetchPhoneAudio(token!),
    enabled: !!token,
  });
}

export function useUploadPhoneAudio(
  onProgress?: (fraction: number) => void,
) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, name }: { file: File; name: string }) =>
      uploadPhoneAudio(token!, file, name, onProgress),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useRenamePhoneAudio() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      renamePhoneAudio(token!, id, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useDeletePhoneAudio() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deletePhoneAudio(token!, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      // A company pointing at the deleted track now resolves to silence, so every
      // company's effective settings just changed — the same asymmetry the defaults
      // mutation has in usePhoneSettings.
      void qc.invalidateQueries({ queryKey: ['phone-settings'] });
    },
  });
}
