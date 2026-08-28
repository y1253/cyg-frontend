import { Mic, MicOff, Phone, PhoneOff, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatE164 } from '@/lib/phone';
import { useSoftphone, useSoftphoneActions } from '@/context/SoftphoneContext';

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The incoming / in-progress call card.
 *
 * Deliberately NOT a shadcn `Dialog`: a modal traps focus and blocks the page, which
 * would defeat the whole point — the user must be able to keep working, and navigate to
 * another company, while on a call. This is the same non-blocking fixed-overlay pattern
 * as `ComposerStack` and `Toaster`, sitting above both at `z-[200]`.
 *
 * Rendered through a portal by SoftphoneProvider, whose mount condition depends only on
 * call state, so navigation never tears down a live call.
 */
export function CallOverlay() {
  const { phase, info, muted, seconds } = useSoftphone();
  const { answer, hangup, toggleMute } = useSoftphoneActions();
  const navigate = useNavigate();

  if (phase === 'idle') return null;
  const ringing = phase === 'ringing';

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[200] flex justify-center px-4">
      <div
        className={[
          'pointer-events-auto w-full max-w-sm rounded-xl border bg-background shadow-2xl',
          ringing
            ? 'border-teal-400 ring-2 ring-teal-400/40 animate-pulse'
            : 'border-border',
        ].join(' ')}
      >
        <div className="flex items-start gap-3 p-4">
          <div
            className={[
              'flex size-10 shrink-0 items-center justify-center rounded-full',
              ringing ? 'bg-teal-100 text-teal-700' : 'bg-green-100 text-green-700',
            ].join(' ')}
          >
            <Phone size={18} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {ringing ? 'Incoming call' : `On call · ${mmss(seconds)}`}
            </p>
            <p className="truncate text-sm font-semibold">
              {formatE164(info?.from) || 'Unknown caller'}
            </p>
            {info && (
              <button
                type="button"
                onClick={() => navigate(`/companies/${info.companyId}`)}
                className="mt-0.5 flex items-center gap-1 text-xs text-teal-700 hover:underline"
              >
                <Building2 size={12} />
                <span className="truncate">{info.companyName}</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 border-t p-3">
          {ringing ? (
            <>
              <button
                onClick={answer}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-500"
              >
                <Phone size={14} />
                Answer
              </button>
              <button
                onClick={hangup}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                <PhoneOff size={14} />
                Decline
              </button>
            </>
          ) : (
            <>
              <button
                onClick={toggleMute}
                className={[
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium',
                  muted
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    : 'bg-muted hover:bg-muted/70',
                ].join(' ')}
              >
                {muted ? <MicOff size={14} /> : <Mic size={14} />}
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button
                onClick={hangup}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                <PhoneOff size={14} />
                Hang up
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
