import type { ImportSnapshot } from '@/api/qboImport';

/**
 * step11.md (2026-11-25): the QuickBooks import's realtime events (topic `qbo-import`), from
 * `useRealtime` to the popup (`useQboImport`). A module emitter for the reason
 * `agent-notify-bus.ts` gives.
 */
export type QboImportEvent =
  | { kind: 'snapshot'; snapshot: ImportSnapshot }
  | { kind: 'error'; companyId: number; message: string };

type Listener = (event: QboImportEvent) => void;
const listeners = new Set<Listener>();

export function onQboImport(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitQboImport(event: QboImportEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* one broken listener must not stop the others */
    }
  }
}

/** Narrow an event payload: a snapshot, or a command's error. */
export function qboImportEventOf(payload: unknown): QboImportEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Partial<ImportSnapshot> & { commandError?: unknown };
  if (typeof p.companyId !== 'number') return null;
  if (typeof p.commandError === 'string')
    return { kind: 'error', companyId: p.companyId, message: p.commandError };
  if (typeof p.state !== 'string' || !Array.isArray(p.questions)) return null;
  return { kind: 'snapshot', snapshot: p as ImportSnapshot };
}
