import { useState } from 'react';
import { usePolishReply } from './usePolishReply';

/**
 * Shared AI-polish state for a single draft editor (compose, reply or forward).
 *
 * CommunicationsTab keeps this inline because one component owns all three of its
 * drafts; the internal tab splits compose into its own component, so the logic
 * lives here instead of being written three times. Backed by the same
 * `POST /api/ai/polish-reply` endpoint — no new server work.
 */
export function useDraftPolish() {
  const mutation = usePolishReply();
  // The polished text awaiting an accept/discard decision.
  const [preview, setPreview] = useState<string | null>(null);
  // The draft that produced it, so "Re-polish" re-runs on the original.
  const [source, setSource] = useState<string | null>(null);

  const run = (draftPlain: string, context: string) => {
    if (!draftPlain.trim()) return;
    setSource(draftPlain);
    mutation.mutate(
      { kind: 'email', draft: draftPlain, context },
      { onSuccess: (r) => setPreview(r.polished) },
    );
  };

  const rePolish = (context: string) => run(source ?? '', context);

  const reset = () => {
    setPreview(null);
    setSource(null);
    mutation.reset();
  };

  return {
    preview,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error as Error | null,
    run,
    rePolish,
    reset,
  };
}

export type DraftPolish = ReturnType<typeof useDraftPolish>;
