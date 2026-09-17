import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { createWhatsAppTemplate } from '@/api/whatsapp';

/**
 * Submit a WhatsApp template for Meta's review.
 *
 * Invalidates the template list so the new one appears immediately — usually as PENDING,
 * but Meta approves a simple UTILITY template outright often enough that the list, not an
 * assumption, is what says which.
 */
export function useCreateWhatsAppTemplate(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      name: string;
      language: string;
      category: string;
      body: string;
      examples: string[];
    }) => createWhatsAppTemplate(token!, companyId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['whatsapp-templates', companyId] });
    },
  });
}
