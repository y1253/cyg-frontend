import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { addAgentRule, deleteAgentRule, updateAgentRule } from '@/api/agents';

type RuleChange =
  | { action: 'add'; text: string }
  | { action: 'update'; ruleId: number; text: string }
  | { action: 'delete'; ruleId: number };

/** Add / edit / delete a company rule (`agentId: null`) or an agent's rule. */
export function useAgentRuleActions(companyId: number, agentId: number | null) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (change: RuleChange): Promise<unknown> => {
      if (change.action === 'add') {
        return addAgentRule(token!, companyId, agentId, change.text);
      }
      if (change.action === 'update') {
        return updateAgentRule(token!, companyId, agentId, change.ruleId, change.text);
      }
      return deleteAgentRule(token!, companyId, agentId, change.ruleId);
    },
    onSettled: () =>
      qc.invalidateQueries({
        queryKey: ['agent-rules', companyId, agentId ?? 'company'],
      }),
  });
}
