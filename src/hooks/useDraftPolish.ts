import { useState } from 'react';
import type { PolishKind } from '@/api/ai';
import { usePolishReply } from './usePolishReply';

/**
 * Shared AI-polish state for a single draft editor (compose, reply or forward).
 *
 * One instance per editor: every composer that can be open at the same time as
 * another needs its own, or they share a preview and an error. Backed by
 * `POST /api/ai/polish-reply` — no new server work.
 *
 * `kind` picks the tone the server writes in: 'email' for mail bodies, 'chat' for a
 * Google Chat / Teams reply (shorter, no salutation), 'sms' and 'whatsapp' for the plain
 * text channels, which are told the reply is billed by length.
 */
export function useDraftPolish(kind: PolishKind = 'email') {
  const mutation = usePolishReply();
  // The polished text awaiting an accept/discard decision.
  const [preview, setPreview] = useState<string | null>(null);
  // The draft that produced it, so "Re-polish" re-runs on the original.
  const [source, setSource] = useState<string | null>(null);

  /**
   * `maxChars` is passed through per RUN rather than captured at hook construction: on
   * WhatsApp the budget is 1024 with an attachment and 4096 without, so it changes while
   * the composer is open.
   */
  const run = (draftPlain: string, context: string, maxChars?: number) => {
    if (!draftPlain.trim()) return;
    setSource(draftPlain);
    mutation.mutate(
      { kind, draft: draftPlain, context, ...(maxChars ? { maxChars } : {}) },
      { onSuccess: (r) => setPreview(r.polished) },
    );
  };

  // Re-polish re-runs on the ORIGINAL draft, never the preview, so pressing it twice
  // cannot compound one rewrite on top of another.
  const rePolish = (context: string, maxChars?: number) =>
    run(source ?? '', context, maxChars);

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
