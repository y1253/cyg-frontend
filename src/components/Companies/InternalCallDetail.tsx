import {
  ArrowLeft,
  CheckCircle2,
  MailOpen,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { recordingUrl } from '@/api/phone';
import { useInternalCallRecordings } from '@/hooks/useInternalCallRecordings';
import { CallSummaryPanel } from './communications/CallSummaryPanel';
import { formatEmailDate } from './message-utils';
import type { InternalCall } from '@/api/internalCalls';

function duration(totalSec: number | null): string {
  if (totalSec === null) return '—';
  if (totalSec <= 0) return '0s';
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const OUTCOME_STYLE: Record<InternalCall['outcome'], string> = {
  answered: 'bg-green-50 text-green-700 border-green-200',
  missed: 'bg-red-50 text-red-700 border-red-200',
  'in-progress': 'bg-amber-50 text-amber-700 border-amber-200',
};

const OUTCOME_LABEL: Record<InternalCall['outcome'], string> = {
  answered: 'Answered',
  missed: 'Missed',
  'in-progress': 'In progress',
};

/**
 * One staff-to-staff call: who, when, how long, and the recording if there is one.
 *
 * A full-tab card rather than a modal or an inline accordion, so opening a call behaves
 * exactly like opening a message thread — one interaction for one list.
 *
 * It cannot reuse the company `CallDetailView`: that one is bound to `CallItem`,
 * a `companyId`, `useCallRecordings` and `formatE164`, none of which exist here. An
 * internal call has no phone number in either direction — the peer is a colleague, and
 * the only address involved is the one shared SIP credential every browser registers.
 *
 * There is likewise no voicemail branch: the internal `<Dial>` has no `<Record>`
 * fallthrough, so an unanswered staff call leaves nothing behind and "no recording" here
 * genuinely means recording was off when it happened.
 */
export function InternalCallDetail({
  call,
  onClose,
  onCallBack,
  onMarkUnread,
  onRequestComplete,
  onUncomplete,
}: {
  call: InternalCall;
  onClose: () => void;
  onCallBack: (peerId: number) => void;
  onMarkUnread: () => void;
  onRequestComplete: () => void;
  onUncomplete: () => void;
}) {
  const { data, isLoading } = useInternalCallRecordings(call.sid);
  const recordings = data?.recordings;
  // Your own call is read and completed by definition, so those two controls would be
  // buttons that do nothing — the same reason the row hides them.
  const own = call.direction === 'outbound';

  const DirectionIcon =
    call.outcome === 'missed'
      ? PhoneMissed
      : own
        ? PhoneOutgoing
        : PhoneIncoming;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onClose} className="gap-1">
            <ArrowLeft size={14} /> Back
          </Button>
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200 gap-1"
          >
            <Phone size={11} /> Call
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => onCallBack(call.peer.id)}
          >
            <Phone size={13} /> Call back
          </Button>
          {!own && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  onMarkUnread();
                  onClose();
                }}
              >
                <MailOpen size={13} /> Mark as unread
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={
                  call.isCompleted
                    ? 'gap-1 border-blue-300 text-blue-700 hover:bg-blue-50'
                    : 'gap-1'
                }
                onClick={() =>
                  call.isCompleted ? onUncomplete() : onRequestComplete()
                }
              >
                <CheckCircle2 size={13} />
                {call.isCompleted ? 'Completed' : 'Mark complete'}
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="p-6 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div
            className={[
              'flex size-12 shrink-0 items-center justify-center rounded-full',
              call.outcome === 'missed'
                ? 'bg-red-100 text-red-600'
                : 'bg-green-100 text-green-700',
            ].join(' ')}
          >
            <DirectionIcon size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold truncate">{call.peer.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatEmailDate(call.at)}
            </p>
          </div>
          <Badge
            variant="outline"
            className={`ml-auto ${OUTCOME_STYLE[call.outcome]}`}
          >
            {OUTCOME_LABEL[call.outcome]}
          </Badge>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Detail label="Direction" value={own ? 'Outgoing' : 'Incoming'} />
          <Detail label="Duration" value={duration(call.durationSec)} />
          <Detail label="Colleague" value={call.peer.name} />
        </dl>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recording
          </p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !recordings || recordings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recording for this call.
            </p>
          ) : (
            recordings.map((r) => (
              <div key={r.sid} className="flex flex-col gap-1">
                {/*
                  Points at OUR server, not SignalWire, whose media URL carries no
                  authentication at all and would be a permanent public link to a
                  recorded conversation between two colleagues.
                */}
                <audio
                  controls
                  preload="metadata"
                  src={recordingUrl(r)}
                  className="w-full"
                />
                <span className="text-xs text-muted-foreground">
                  {duration(r.durationSec)}
                  {r.createdAt && ` · ${formatEmailDate(r.createdAt)}`}
                </span>
              </div>
            ))
          )}
        </div>

        <CallSummaryPanel summary={data?.summary} />
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="font-medium">{value || '—'}</dd>
    </div>
  );
}
