import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  generateWhatsAppTemplate,
  type GeneratedTemplateDraft,
} from '@/api/whatsapp';

/**
 * "Draft me a template", with an accept/discard step before anything is submitted.
 *
 * ⚠️ A direct structural copy of `useDraftPolish`, and deliberately so: `preview` holds
 * what is awaiting a decision, `source` keeps the brief so Re-generate re-runs the
 * original rather than whatever the box says now, and `reset()` clears both AND the
 * mutation so a stale error cannot outlive a discard.
 *
 * The review step is not ceremony. A template name Meta rejects cannot be retried for
 * four weeks, so nothing generated reaches Meta without a person seeing it first.
 *
 * One instance per panel — two sharing this would share a preview and an error.
 */
export function useTemplateDraft(companyId: number) {
  const { token } = useAuth();
  const [preview, setPreview] = useState<GeneratedTemplateDraft | null>(null);
  const [source, setSource] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (description: string) =>
      generateWhatsAppTemplate(token!, companyId, description),
  });

  const run = (description: string) => {
    const brief = description.trim();
    if (!brief) return;
    setSource(brief);
    mutation.mutate(brief, { onSuccess: (draft) => setPreview(draft) });
  };

  const reset = () => {
    setPreview(null);
    setSource(null);
    mutation.reset();
  };

  return {
    preview,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    run,
    regenerate: () => run(source ?? ''),
    reset,
  };
}

export type TemplateDraft = ReturnType<typeof useTemplateDraft>;
