import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  fetchSchedulesByCompany,
  createSchedule,
  updateSchedule,
  toggleSchedule,
  toggleScheduleImportant,
  type CycleType,
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
    mutationFn: (data: {
      taskId: number;
      companyId: number;
      cycle?: number;
      cycleType?: CycleType;
      cycleDay?: number;
      cycleNth?: number;
      note?: string;
    }) => createSchedule(token!, data),
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
    mutationFn: ({
      id,
      cycle,
      cycleType,
      cycleDay,
      cycleNth,
      note,
    }: {
      id: number;
      cycle?: number;
      cycleType?: CycleType;
      cycleDay?: number | null;
      cycleNth?: number | null;
      note?: string | null;
    }) => updateSchedule(token!, id, { cycle, cycleType, cycleDay, cycleNth, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-schedules', companyId] });
    },
  });
}

export function useToggleSchedule(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => toggleSchedule(token!, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-schedules', companyId] });
      qc.invalidateQueries({ queryKey: ['company', companyId] });
    },
  });
}

export function useToggleScheduleImportant(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => toggleScheduleImportant(token!, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-schedules', companyId] });
    },
  });
}
