import { useEffect, useState } from 'react';
import { PhoneCall } from 'lucide-react';
import type { ActiveCall } from '@/api/phone';
import { formatE164 } from '@/lib/phone';
import { formatElapsed } from './call-busy';

/**
 * "This company's line is on a call" — for everybody who is NOT on it.
 *
 * Quieter than `RingingCallBanner`: that one is an event somebody can act on; this is a
 * state, and its job is to explain why the call buttons are disabled.
 *
 * The timer starts from the server's `elapsedSec` and ticks locally between polls. It is
 * re-based on every poll, so a sleeping laptop or a wrong local clock corrects itself
 * within one interval rather than drifting for the whole call.
 */
export function ActiveCallBanner({ call }: { call: ActiveCall }) {
  const [base, setBase] = useState(() => ({ sec: call.elapsedSec, at: Date.now() }));
  const [, setTick] = useState(0);

  useEffect(() => {
    setBase({ sec: call.elapsedSec, at: Date.now() });
  }, [call.elapsedSec]);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = base.sec + Math.floor((Date.now() - base.at) / 1000);
  const ringing = call.direction === 'inbound' && call.state === 'ringing';
  const who = call.isViewer ? 'You' : call.userName;
  const number = call.peer ? formatE164(call.peer) : '';
  const peer = call.peerName
    ? number
      ? `${call.peerName} (${number})`
      : call.peerName
    : number;

  const headline = ringing
    ? 'Incoming call ringing'
    : call.state === 'dialing'
      ? `Placing a call${who ? ` · ${who}` : ''}`
      : `On a call${who ? ` · ${who}` : ''}`;

  const detail = [
    peer && (call.direction === 'outbound' ? `Outbound to ${peer}` : `Inbound from ${peer}`),
    call.isViewer && 'in another tab or browser',
    'New calls from this number are paused until it ends',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
          <PhoneCall size={15} />
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-sm font-semibold text-amber-900">{headline}</span>
          <span className="truncate text-xs text-amber-800/80">{detail}</span>
        </span>
      </span>
      {!ringing && (
        <span className="shrink-0 font-mono text-sm tabular-nums text-amber-900">
          {formatElapsed(elapsed)}
        </span>
      )}
    </div>
  );
}
