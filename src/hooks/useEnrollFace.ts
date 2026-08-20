import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import type { FaceBox } from '../api/auth';
import { enrollFace } from '../api/users';

export function useEnrollFace() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      blobs,
      boxes,
    }: {
      userId: number;
      blobs: [Blob, Blob, Blob];
      /** Index-aligned with `blobs`; entries may be undefined. */
      boxes?: (FaceBox | undefined)[];
    }) => enrollFace(token!, userId, blobs, boxes),
    onSuccess: (_data, { userId }) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', userId] });
    },
  });
}
