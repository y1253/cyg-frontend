import { Phone, PhoneOff } from 'lucide-react';
import { useSoftphone } from '@/context/SoftphoneContext';

/**
 * A small permanent indicator of whether the browser is reachable by phone.
 *
 * This exists because a softphone that silently failed to register looks EXACTLY like
 * a quiet afternoon — that ambiguity cost several rounds of "no calls are coming in"
 * during this increment. Whatever else changes, keep something on screen that
 * distinguishes "registered" from "not".
 */
export function SoftphoneStatus() {
  const { status } = useSoftphone();

  // Nothing configured server-side: not a fault, and not worth a red dot on every page.
  if (status === 'unavailable') return null;

  const label: Record<string, string> = {
    idle: 'Phone: starting…',
    connecting: 'Phone: connecting…',
    registered: 'Phone: ready for calls',
    failed: 'Phone: NOT connected — you will not receive calls',
  };
  const ok = status === 'registered';
  const pending = status === 'idle' || status === 'connecting';

  return (
    <span
      title={label[status]}
      aria-label={label[status]}
      className={[
        'flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium',
        ok
          ? 'bg-green-100 text-green-700'
          : pending
            ? 'bg-muted text-muted-foreground'
            : 'bg-red-100 text-red-700',
      ].join(' ')}
    >
      {ok ? <Phone size={11} /> : <PhoneOff size={11} />}
      {ok ? 'Phone' : pending ? '…' : 'Offline'}
    </span>
  );
}
