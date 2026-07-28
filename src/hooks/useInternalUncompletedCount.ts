import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  fetchInternalUncompletedCount,
  fetchInternalUnreadCount,
} from '@/api/internalMessages';

/** Drives the folder-tab badge inside the tab (the dashboard badge comes from
 *  /communications/uncompleted-counts, which folds this same number in). */
export function useInternalUncompletedCount() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['internal-uncompleted-count'],
    queryFn: () => fetchInternalUncompletedCount(token!),
    enabled: !!token,
    refetchInterval: 30000,
  });
}

export function useInternalUnreadCount() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['internal-unread-count'],
    queryFn: () => fetchInternalUnreadCount(token!),
    enabled: !!token,
    refetchInterval: 30000,
  });
}
