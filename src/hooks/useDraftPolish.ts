import { useState } from 'react';
import { usePolishReply } from './usePolishReply';

/**
 * Shared AI-polish state for a single draft editor (compose, reply or forward).
 *
 * One instance per editor: every composer that can be open at the same time as
 * another needs its own, or they share a preview and an error. Backed by
 * `POST /api/ai/polish-reply` — no new server work.
 *
 * `kind` picks the tone the server writes in: 'email' for mail bodies, 'chat' for
 * a Google Chat / Teams reply (shorter, no salutation).
 */
export function useDraftPolish(kind: 'email' | 'chat' = 'email') {
  const mutation = usePolishReply();
  // The polished text awaiting an accept/discard decision.
  const [preview, setPreview] = useState<string | null>(null);
  // The draft that produced it, so "Re-polish" re-runs on the original.
  const [source, setSource] = useState<string | null>(null);

  const run = (draftPlain: string, context: string) => {
    if (!draftPlain.trim()) return;
    setSource(draftPlain);
    mutation.mutate(
      { kind, draft: draftPlain, context },
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
