import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { deleteAgentLearning, updateAgentLearning } from '@/api/agents';

type LearningChange =
  | { action: 'update'; learningId: number; text: string }
  | { action: 'delete'; learningId: number };

/** Staff correcting or deleting one of an agent's own notes. */
export function useAgentLearningActions(companyId: number, agentId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (change: LearningChange): Promise<unknown> =>
      change.action === 'update'
        ? updateAgentLearning(token!, companyId, agentId, change.learningId, change.text)
        : deleteAgentLearning(token!, companyId, agentId, change.learningId),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ['agent-learnings', companyId, agentId] }),
  });
}
