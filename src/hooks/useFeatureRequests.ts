import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchFeatureRequestOpenCount,
  fetchFeatureRequests,
  updateFeatureRequest,
  type FeatureStatus,
} from '@/api/featureRequests';
import { useAuth } from '@/context/AuthContext';

const KEY = ['feature-requests'] as const;

/** step12e: what customers asked the AI for that the app does not do yet. ADMIN only. */
export function useFeatureRequests(status: FeatureStatus | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: [...KEY, 'list', status],
    queryFn: () => fetchFeatureRequests(token!, status ?? undefined),
    enabled: !!token,
  });
}

/** Requests nobody has looked at yet — the tab's badge. */
export function useFeatureRequestOpenCount() {
  const { token } = useAuth();
  return useQuery({
    queryKey: [...KEY, 'open-count'],
    queryFn: () => fetchFeatureRequestOpenCount(token!),
    enabled: !!token,
  });
}

export function useUpdateFeatureRequest() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; status?: FeatureStatus; staffNote?: string }) =>
      updateFeatureRequest(token!, id, data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
