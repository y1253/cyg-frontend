import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { deleteTodo, setTodoCycle, removeTodoCycle, snoozeTodo, unsnoozeTodo } from '@/api/todos';

export function useDeleteTodo(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteTodo(token!, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company', companyId] });
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export function useSetTodoCycle(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cycle }: { id: number; cycle: number }) =>
      setTodoCycle(token!, id, cycle),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company', companyId] });
      qc.invalidateQueries({ queryKey: ['task-schedules', companyId] });
    },
  });
}

export function useRemoveTodoCycle(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => removeTodoCycle(token!, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company', companyId] });
      qc.invalidateQueries({ queryKey: ['task-schedules', companyId] });
    },
  });
}

export function useSnoozeTodo(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, days }: { id: number; days: number }) => snoozeTodo(token!, id, days),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company', companyId] });
    },
  });
}

export function useUnsnoozeTodo(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => unsnoozeTodo(token!, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company', companyId] });
    },
  });
}
