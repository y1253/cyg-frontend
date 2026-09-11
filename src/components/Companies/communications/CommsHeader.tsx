import { useState } from 'react';
import { Mail, MessageSquareText, Phone, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useDisconnectGmail } from '@/hooks/useDisconnectGmail';
import { formatE164 } from '@/lib/phone';
import type { GmailAccount } from '@/api/gmail';

/**
 * The Communications tab's action bar: which mailbox and number this company has, and
 * the buttons that start something new.
 *
 * ── WHY IT IS ITS OWN COMPONENT ──────────────────────────────────────────────
 * It used to live inside `InboxView`, which meant it existed in exactly ONE of the
 * router's branches. Adding the Contacts tab made that visible: switching to Contacts
 * returned before `InboxView` rendered and every button vanished. This is the same shape
 * as the bug `ringingBanner` is documented against in `CommunicationsTab` — a control
 * wired into one branch disappears the moment another branch is taken — so it gets the
 * same fix: built once in the parent, rendered in every branch that should have it.
 *
 * It is rendered on the two LIST branches (inbox and contacts) and deliberately NOT on
 * the four detail views, which have their own headers with a Back button. Offering
 * "Compose" while somebody reads an email is a different feature, not this fix.
 *
 * The Disconnect button owns local state, a mutation and a confirm dialog, and all three
 * live here together: the button without its dialog is a no-op, which is exactly the
 * class of bug this component exists to stop repeating.
 */
export function CommsHeader({
  companyId,
  isAdmin,
  account,
  accountAddress,
  providerLabels,
  supportNumber,
  onCompose,
  onNewCall,
  onComposeSms,
}: {
  companyId: number;
  isAdmin: boolean;
  account: GmailAccount | null;
  accountAddress: string;
  providerLabels: { name: string; chat: string };
  supportNumber: string | null;
  onCompose: () => void;
  /** Undefined when this company has no number — the button is then not rendered. */
  onNewCall?: () => void;
  onComposeSms?: () => void;
}) {
  const disconnectMutation = useDisconnectGmail(companyId);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {account && (
            <>
              <Mail size={16} className="text-teal-600" />
              <Badge variant="outline" className="text-teal-700 border-teal-200 bg-teal-50">
                {accountAddress}
              </Badge>
            </>
          )}
          {supportNumber && (
            <>
              <Phone size={16} className="text-green-600" />
              <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50">
                {formatE164(supportNumber)}
              </Badge>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Compose needs a mailbox; texting needs a number. A company can have
              either, both, or (before this tab is set up) neither. */}
          {account && (
            <Button
              size="sm"
              onClick={onCompose}
              className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
            >
              <Plus size={14} /> Compose
            </Button>
          )}
          {supportNumber && onNewCall && (
            <Button
              size="sm"
              variant="outline"
              className="border-green-300 text-green-700 hover:bg-green-50 gap-1"
              onClick={onNewCall}
            >
              <Phone size={14} /> New call
            </Button>
          )}
          {supportNumber && onComposeSms && (
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 text-amber-700 hover:bg-amber-50 gap-1"
              onClick={onComposeSms}
            >
              <MessageSquareText size={14} /> New text
            </Button>
          )}
          {isAdmin && account && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/5 gap-1"
              onClick={() => setDisconnectConfirmOpen(true)}
            >
              <Trash2 size={14} /> Disconnect
            </Button>
          )}
        </div>
      </div>

      <Dialog open={disconnectConfirmOpen} onOpenChange={setDisconnectConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect {providerLabels.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove access to <strong>{accountAddress}</strong>. You can reconnect
            anytime from the Billing section.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDisconnectConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={disconnectMutation.isPending}
              onClick={() =>
                disconnectMutation.mutate(undefined, {
                  onSuccess: () => setDisconnectConfirmOpen(false),
                })
              }
            >
              {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
