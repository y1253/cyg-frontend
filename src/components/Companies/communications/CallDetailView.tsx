import {
  ArrowLeft, CheckCircle2, MailOpen, Phone,
  PhoneIncoming, PhoneMissed, PhoneOutgoing,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { CallItem } from '@/api/phone';
import { recordingUrl } from '@/api/phone';
import { useCallRecordings } from '@/hooks/useCallRecordings';
import { useMarkPhoneItem } from '@/hooks/useMarkPhoneItem';
import { formatE164 } from '@/lib/phone';
import { formatEmailDate } from '../message-utils';
import type { CompleteTarget, ItemKind } from './types';

function duration(totalSec: number): string {
  if (totalSec <= 0) return '0s';
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const OUTCOME_STYLE: Record<CallItem['outcome'], string> = {
  answered: 'bg-green-50 text-green-700 border-green-200',
  missed: 'bg-red-50 text-red-700 border-red-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  'in-progress': 'bg-amber-50 text-amber-700 border-amber-200',
};

const OUTCOME_LABEL: Record<CallItem['outcome'], string> = {
  answered: 'Answered',
  missed: 'Missed',
  failed: 'Failed',
  'in-progress': 'In progress',
};

/**
 * One call: who, when, how long, and the recording if there is one.
 *
 * A card rather than a thread — a call has no messages — but full-tab like its
 * siblings rather than a modal, so navigating away from it behaves the same way.
 */
export function CallDetailView({
  companyId,
  sid,
  itemId,
  call,
  onClose,
  onCall,
  onRequestComplete,
  onUncomplete,
}: {
  companyId: number;
  sid: string;
  itemId: string;
  /** The inbox row, when it is still loaded. Null after a hard refresh into this view. */
  call: CallItem | null;
  onClose: () => void;
  onCall: (number: string) => void;
  onRequestComplete: (target: CompleteTarget) => void;
  onUncomplete: (kind: ItemKind, id: string) => void;
}) {
  const { data: recordings, isLoading } = useCallRecordings(companyId, sid);
  const markUnread = useMarkPhoneItem(companyId, 'unread');

  const outcome = call?.outcome ?? 'answered';
  const DirectionIcon =
    outcome === 'missed' || outcome === 'failed'
      ? PhoneMissed
      : call?.direction === 'outbound'
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
          {call && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => onCall(call.counterparty)}
            >
              <Phone size={13} /> Call back
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => {
              markUnread.mutate(itemId);
              onClose();
            }}
          >
            <MailOpen size={13} /> Mark as unread
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={
              call?.isCompleted
                ? 'gap-1 border-blue-300 text-blue-700 hover:bg-blue-50'
                : 'gap-1'
            }
            onClick={() =>
              call?.isCompleted
                ? onUncomplete('call', itemId)
                : onRequestComplete({ kind: 'call', id: itemId, fromDetail: true })
            }
          >
            <CheckCircle2 size={13} />
            {call?.isCompleted ? 'Completed' : 'Mark complete'}
          </Button>
        </div>
      </div>

      <Card className="p-6 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div
            className={[
              'flex size-12 shrink-0 items-center justify-center rounded-full',
              outcome === 'missed' || outcome === 'failed'
                ? 'bg-red-100 text-red-600'
                : 'bg-green-100 text-green-700',
            ].join(' ')}
          >
            <DirectionIcon size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold truncate">
              {call ? formatE164(call.counterparty) : 'Call'}
            </p>
            <p className="text-sm text-muted-foreground">
              {call ? formatEmailDate(call.at) : ''}
            </p>
          </div>
          <Badge variant="outline" className={`ml-auto ${OUTCOME_STYLE[outcome]}`}>
            {OUTCOME_LABEL[outcome]}
          </Badge>
        </div>

        {call && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <Detail label="Direction" value={call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} />
            <Detail label="Duration" value={duration(call.durationSec)} />
            <Detail label="From" value={formatE164(call.direction === 'inbound' ? call.counterparty : call.supportNumber)} />
            <Detail label="To" value={formatE164(call.direction === 'inbound' ? call.supportNumber : call.counterparty)} />
          </dl>
        )}

        {/* Recording */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recording
          </p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !recordings || recordings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {/* Truthful about WHY: a call nobody answered has nothing to record, and
                  a call from before recording was switched on never will. */}
              No recording for this call.
            </p>
          ) : (
            recordings.map((r) => (
              <div key={r.sid} className="flex flex-col gap-1">
                {/*
                  Points at OUR server, not SignalWire. SignalWire serves recording
                  media with no authentication at all, so its URL would be a permanent
                  public link to a client's recorded call. Our route proxies the bytes
                  with Range support, so scrubbing works.
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
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || '—'}</dd>
    </div>
  );
}
