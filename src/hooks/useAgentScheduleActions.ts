import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  addAgentSchedule,
  deleteAgentSchedule,
  updateAgentSchedule,
  type AgentScheduleInput,
} from '@/api/agents';

type ScheduleChange =
  | { action: 'add'; input: AgentScheduleInput }
  | { action: 'update'; scheduleId: number; input: Partial<AgentScheduleInput> }
  | { action: 'delete'; scheduleId: number };

export function useAgentScheduleActions(companyId: number, agentId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (change: ScheduleChange): Promise<unknown> => {
      if (change.action === 'add') {
        return addAgentSchedule(token!, companyId, agentId, change.input);
      }
      if (change.action === 'update') {
        return updateAgentSchedule(token!, companyId, agentId, change.scheduleId, change.input);
      }
      return deleteAgentSchedule(token!, companyId, agentId, change.scheduleId);
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ['agent-schedules', companyId, agentId] }),
  });
}
