import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  fetchSchedulesByCompany,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from '@/api/taskSchedules';

export function useTaskSchedules(companyId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['task-schedules', companyId],
    queryFn: () => fetchSchedulesByCompany(token!, companyId),
    enabled: !!token,
  });
}

export function useCreateSchedule(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { taskId: number; companyId: number; cycle: number; note?: string }) =>
      createSchedule(token!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-schedules', companyId] });
      qc.invalidateQueries({ queryKey: ['company', companyId] });
    },
  });
}

export function useUpdateSchedule(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cycle, note }: { id: number; cycle?: number; note?: string | null }) =>
      updateSchedule(token!, id, { cycle, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-schedules', companyId] });
    },
  });
}

export function useDeleteSchedule(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteSchedule(token!, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-schedules', companyId] });
      qc.invalidateQueries({ queryKey: ['company', companyId] });
    },
  });
}
