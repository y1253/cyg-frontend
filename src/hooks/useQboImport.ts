import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  sendImportCommandHttp,
  type ImportAction,
  type ImportSnapshot,
} from '@/api/qboImport';
import { onQboImport } from '@/lib/qbo-import-bus';
import { sendRealtimeCommand } from '@/lib/realtime-send';

/**
 * step11.md (2026-11-25): one company's QuickBooks import, as the popup sees it. Commands go
 * over the realtime WebSocket (HTTP when the tab has none); every change comes back as a
 * whole snapshot on topic `qbo-import`.
 */
export function useQboImport(companyId: number, active: boolean) {
  const { token } = useAuth();
  const [snapshot, setSnapshot] = useState<ImportSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!active) return;
    return onQboImport((event) => {
      if (event.kind === 'snapshot') {
        if (event.snapshot.companyId !== companyId) return;
        setSnapshot(event.snapshot);
        setSending(false);
      } else if (event.companyId === companyId || event.companyId === 0) {
        setError(event.message);
        setSending(false);
      }
    });
  }, [companyId, active]);

  const send = useCallback(
    async (cmd: ImportAction) => {
      setError(null);
      setSending(true);
      if (sendRealtimeCommand('qbo-import', { ...cmd, companyId })) return;
      try {
        setSnapshot(await sendImportCommandHttp(token!, companyId, cmd));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSending(false);
      }
    },
    [companyId, token],
  );

  const reset = useCallback(() => {
    setSnapshot(null);
    setError(null);
    setSending(false);
  }, []);

  return { snapshot, error, sending, send, reset };
}
