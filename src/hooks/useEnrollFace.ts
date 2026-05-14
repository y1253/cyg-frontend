import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { enrollFace } from '../api/users';

export function useEnrollFace() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, blob }: { userId: number; blob: Blob }) =>
      enrollFace(token!, userId, blob),
    onSuccess: (_data, { userId }) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', userId] });
    },
  });
}
