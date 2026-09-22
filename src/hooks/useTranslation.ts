import { useCallback, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { translateToEnglish } from '@/api/ai';

/**
 * "Show me this in English", per message.
 *
 * ── WHY THIS IS NOT `useDraftPolish`'S SHAPE ──────────────────────────────────
 * That hook is a preview machine for a WRITE: its whole surface (preview / re-run /
 * accept / discard) exists to decide whether to replace the user's draft. Reading a
 * customer's message has nothing to accept, and the original must NEVER be replaced — a
 * mistranslated figure silently overwriting what they actually wrote is unrecoverable and
 * invisible. So this is a toggle, and the translation is shown BESIDE the original.
 *
 * Results are kept per message id, so toggling off and back on does not bill again.
 */
export function useTranslation() {
  const { token } = useAuth();
  const cache = useRef(new Map<string, string>());
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Re-render trigger for the ref-held cache; the cache itself must not be state, or
  // every entry would re-render every open bubble.
  const [, bump] = useState(0);

  const toggle = useCallback(
    async (id: string, text: string) => {
      setShown((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      if (cache.current.has(id) || !token) return;
      setBusy(id);
      setErrors((e) => ({ ...e, [id]: '' }));
      try {
        const { translated } = await translateToEnglish(token, text);
        cache.current.set(id, translated);
        bump((n) => n + 1);
      } catch (err) {
        setErrors((e) => ({
          ...e,
          [id]:
            err instanceof Error && err.message
              ? err.message
              : 'Could not translate this message.',
        }));
      } finally {
        setBusy(null);
      }
    },
    [token],
  );

  return {
    isShown: (id: string) => shown.has(id),
    textFor: (id: string) => cache.current.get(id) ?? null,
    isBusy: (id: string) => busy === id,
    errorFor: (id: string) => errors[id] || null,
    toggle,
  };
}
