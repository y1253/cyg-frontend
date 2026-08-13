import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { formatEmailDate, recipientSummary, type EmailAddr } from './message-utils';

interface RecipientDetailsProps {
  from: EmailAddr;
  to: EmailAddr[];
  cc: EmailAddr[];
  date: string;
  /** The viewer's own address — rendered as "me", the way Gmail does. */
  selfEmail?: string;
}

/** `Jane Doe <jane@x.com>`, or just the address when there's no distinct name. */
function formatAddr(a: EmailAddr): string {
  return a.name && a.name !== a.email ? `${a.name} <${a.email}>` : a.email;
}

/**
 * Gmail's "show details" disclosure: a collapsed `to me, David, +2` line that
 * expands to the full From / To / Cc / Date block. Shared by the company mailbox
 * (Gmail + Outlook, whose recipients arrive as raw header strings and are parsed
 * with `parseAddressList`) and the internal inbox (already structured users).
 *
 * Open/closed is local state — each message in a thread renders its own instance
 * keyed by message id, so no parent-held Set is needed and the 15s inbox poll
 * can't collapse an open panel.
 */
export function RecipientDetails({ from, to, cc, date, selfEmail }: RecipientDetailsProps) {
  const [open, setOpen] = useState(false);
  const self = selfEmail?.trim().toLowerCase();
  const label = (a: EmailAddr) =>
    self && a.email.toLowerCase() === self ? 'me' : formatAddr(a);

  return (
    <div className="min-w-0 text-xs text-muted-foreground">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-full items-center gap-1 text-left hover:text-foreground"
        title={open ? 'Hide details' : 'Show details'}
      >
        <span className="truncate">{recipientSummary(to, cc, selfEmail)}</span>
        <ChevronRight
          size={12}
          className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-1 space-y-0.5">
          <div className="break-words">
            <span className="font-medium">From:</span> {formatAddr(from)}
          </div>
          <div className="break-words">
            <span className="font-medium">To:</span>{' '}
            {to.length > 0 ? to.map(label).join(', ') : '—'}
          </div>
          {cc.length > 0 && (
            <div className="break-words">
              <span className="font-medium">Cc:</span> {cc.map(label).join(', ')}
            </div>
          )}
          <div>
            <span className="font-medium">Date:</span> {formatEmailDate(date)}
          </div>
        </div>
      )}
    </div>
  );
}
