import { Phone, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { IncomingCallPayload } from '@/api/phone';
import { formatE164 } from '@/lib/phone';

/**
 * "This company is ringing right now — pick it up."
 *
 * Shown to anyone entitled to the company's phone who happens to be looking at it while
 * it rings, which in practice means an admin who was NOT the routed target and therefore
 * got no popup. Their browser is holding a live INVITE regardless — every browser
 * registers the same shared SIP credential — so the only thing they were missing was
 * knowing which company was calling.
 *
 * Rendered in every branch of the Communications tab, not just the inbox: a call that
 * arrives while someone is reading an email is exactly the case worth catching.
 *
 * Deliberately louder than the `MessageNotice` strips around it. Those report a state;
 * this one is a live event with about thirty seconds of usefulness, and it is competing
 * with a ringing phone on the desk.
 */
export function RingingCallBanner({
  call,
  onAnswer,
  onDecline,
}: {
  call: IncomingCallPayload;
  onAnswer: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-teal-300 bg-teal-50 px-3 py-2.5 shadow-sm ring-1 ring-teal-400/30">
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
          <Phone size={15} />
          {/* A quiet pulse. The row is already the loudest thing on the page; an
              animated ring says "now" without turning into a klaxon. */}
          <span className="absolute inset-0 animate-ping rounded-full bg-teal-400/40" />
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-sm font-semibold text-teal-900">
            Incoming call · {formatE164(call.from) || 'Unknown caller'}
          </span>
          <span className="truncate text-xs text-teal-800/80">
            Ringing {call.companyName} now
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          onClick={onAnswer}
          className="gap-1 bg-green-600 text-white hover:bg-green-500"
        >
          <Phone size={13} /> Answer
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDecline}
          className="gap-1 border-teal-300 text-teal-800 hover:bg-teal-100"
          title="Stop showing this call here. It keeps ringing for whoever it was routed to."
        >
          <PhoneOff size={13} /> Ignore
        </Button>
      </span>
    </div>
  );
}
