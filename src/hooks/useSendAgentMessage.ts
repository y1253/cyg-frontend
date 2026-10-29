import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { sendAgentMessage, type SendAgentMessageInput } from '@/api/agents';

/** Staff → agent: a message, or the answer to its question / approval request. */
export function useSendAgentMessage(companyId: number, agentId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendAgentMessageInput) =>
      sendAgentMessage(token!, companyId, agentId, input),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ['agent-messages', companyId, agentId] }),
  });
}
