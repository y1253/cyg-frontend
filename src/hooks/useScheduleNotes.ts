import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { upsertScheduleNote, deleteScheduleNote } from '@/api/scheduleNotes';

export function useUpsertScheduleNote(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleId, note }: { scheduleId: number; note: string }) =>
      upsertScheduleNote(token!, scheduleId, note),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['task-schedules', companyId] });
    },
  });
}

export function useDeleteScheduleNote(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: number) => deleteScheduleNote(token!, scheduleId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['task-schedules', companyId] });
    },
  });
}
