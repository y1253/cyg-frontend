import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTask, deleteTask, fetchTasks, updateTask, assignTask } from '@/api/tasks';
import type { CreateTaskData, UpdateTaskData, AssignTaskData } from '@/api/tasks';
import { useAuth } from '@/context/AuthContext';

export function useTasks() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => fetchTasks(token!),
    enabled: !!token,
  });
}

export function useCreateTask() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTaskData) => createTask(token!, data),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateTaskData }) =>
      updateTask(token!, id, data),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteTask(token!, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useAssignTask() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: number; data: AssignTaskData }) =>
      assignTask(token!, taskId, data),
    onSuccess: (_r, { data }) => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      void queryClient.invalidateQueries({ queryKey: ['company', data.companyId] });
    },
  });
}
