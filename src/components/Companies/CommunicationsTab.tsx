import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Mail, Send, ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useGmailAccount } from '@/hooks/useGmailAccount';
import { useGmailEmails } from '@/hooks/useGmailEmails';
import { useGmailEmail } from '@/hooks/useGmailEmail';
import { useSendEmail } from '@/hooks/useSendEmail';
import { useDisconnectGmail } from '@/hooks/useDisconnectGmail';
import { fetchAuthUrl } from '@/api/gmail';
import type { EmailSummary } from '@/api/gmail';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  companyId: number;
  isAdmin: boolean;
}

export function CommunicationsTab({ companyId, isAdmin }: Props) {
  const { token } = useAuth();
  const qc = useQueryClient();

  const [connecting, setConnecting] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [composeForm, setComposeForm] = useState({ to: '', subject: '', body: '' });

  const { data: account, isLoading: accountLoading } = useGmailAccount(companyId);
  const { data: emailList, isLoading: emailsLoading } = useGmailEmails(
    companyId,
    account ? pageToken : undefined,
  );
  const { data: emailDetail, isLoading: emailDetailLoading } = useGmailEmail(
    companyId,
    account ? selectedMsgId : null,
  );
  const sendMutation = useSendEmail(companyId);
  const disconnectMutation = useDisconnectGmail(companyId);

  // SSE: real-time inbox updates
  useEffect(() => {
    if (!account || !token) return;
    const es = new EventSource(
      `/api/gmail/companies/${companyId}/events?token=${encodeURIComponent(token)}`,
    );
    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const data = JSON.parse(e.data) as { type: string };
        if (data.type === 'new-email') {
          void qc.invalidateQueries({ queryKey: ['gmail-emails', companyId] });
        }
      } catch {
        // ignore parse errors
      }
    };
    return () => es.close();
  }, [account, companyId, token, qc]);

  const handleConnect = useCallback(async () => {
    if (!token) return;
    setConnecting(true);
    try {
      const { authUrl } = await fetchAuthUrl(token, companyId);
      const popup = window.open(authUrl, 'gmail-oauth', 'width=500,height=600');

      const onMessage = (e: MessageEvent<{ type: string }>) => {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type === 'gmail-connected' || e.data?.type === 'gmail-error') {
          void qc.invalidateQueries({ queryKey: ['gmail-account', companyId] });
          setConnecting(false);
          window.removeEventListener('message', onMessage);
        }
      };
      window.addEventListener('message', onMessage);

      const poll = setInterval(() => {
        if (popup?.closed) {
          clearInterval(poll);
          setConnecting(false);
          window.removeEventListener('message', onMessage);
        }
      }, 500);
    } catch {
      setConnecting(false);
    }
  }, [token, companyId, qc]);

  const handleSend = () => {
    sendMutation.mutate(composeForm, {
      onSuccess: () => {
        setComposeOpen(false);
        setComposeForm({ to: '', subject: '', body: '' });
      },
    });
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => setDisconnectConfirmOpen(false),
    });
  };

  const handleNextPage = () => {
    if (!emailList?.nextPageToken) return;
    setPageHistory((h) => [...h, pageToken ?? '']);
    setPageToken(emailList.nextPageToken);
    setSelectedMsgId(null);
  };

  const handlePrevPage = () => {
    const prev = pageHistory[pageHistory.length - 1];
    setPageHistory((h) => h.slice(0, -1));
    setPageToken(prev === '' ? undefined : prev);
    setSelectedMsgId(null);
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (accountLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  // ── Not connected ─────────────────────────────────────────────────────────

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Mail size={40} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No Gmail account connected — link one from the Billing section in Account Details.
        </p>
        {isAdmin && (
          <Button
            onClick={() => void handleConnect()}
            disabled={connecting}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            {connecting ? 'Opening…' : 'Connect Gmail'}
          </Button>
        )}
      </div>
    );
  }

  // ── Email detail view ─────────────────────────────────────────────────────

  if (selectedMsgId) {
    return (
      <div className="flex flex-col gap-4">
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
          onClick={() => setSelectedMsgId(null)}
        >
          <ArrowLeft size={14} /> Back to inbox
        </button>

        {emailDetailLoading && (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        )}

        {emailDetail && (
          <div className="flex flex-col gap-3">
            <h2 className="font-semibold text-base">{emailDetail.subject || '(no subject)'}</h2>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div><span className="font-medium">From:</span> {emailDetail.from}</div>
              <div><span className="font-medium">To:</span> {emailDetail.to}</div>
              <div><span className="font-medium">Date:</span> {emailDetail.date}</div>
            </div>
            <div className="border rounded-md overflow-hidden mt-2">
              {emailDetail.bodyHtml ? (
                <iframe
                  srcDoc={emailDetail.bodyHtml}
                  sandbox="allow-same-origin"
                  className="w-full min-h-96 border-0"
                  title="Email body"
                />
              ) : (
                <pre className="p-4 text-sm whitespace-pre-wrap font-sans">
                  {emailDetail.bodyText ?? '(empty)'}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Inbox ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-teal-600" />
          <Badge variant="outline" className="text-teal-700 border-teal-200 bg-teal-50">
            {account.gmailAddress}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button
                size="sm"
                onClick={() => setComposeOpen(true)}
                className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
              >
                <Plus size={14} /> Compose
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive border-destructive/30 hover:bg-destructive/5 gap-1"
                onClick={() => setDisconnectConfirmOpen(true)}
              >
                <Trash2 size={14} /> Disconnect
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Email list */}
      {emailsLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading emails…</div>
      ) : (
        <div className="border rounded-md overflow-hidden divide-y">
          {(emailList?.messages ?? []).length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Inbox is empty</div>
          ) : (
            (emailList?.messages ?? []).map((msg: EmailSummary) => (
              <button
                key={msg.id}
                className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex flex-col gap-0.5"
                onClick={() => setSelectedMsgId(msg.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{msg.from}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{msg.date}</span>
                </div>
                <span className="text-sm truncate">{msg.subject || '(no subject)'}</span>
                <span className="text-xs text-muted-foreground truncate">{msg.snippet}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center gap-2 justify-end">
        <Button
          size="sm"
          variant="outline"
          disabled={pageHistory.length === 0}
          onClick={handlePrevPage}
          className="gap-1"
        >
          <ChevronLeft size={14} /> Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!emailList?.nextPageToken}
          onClick={handleNextPage}
          className="gap-1"
        >
          Next <ChevronRight size={14} />
        </Button>
      </div>

      {/* Compose dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send size={16} /> New Email
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">To</Label>
              <Input
                value={composeForm.to}
                onChange={(e) => setComposeForm((f) => ({ ...f, to: e.target.value }))}
                placeholder="recipient@example.com"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Subject</Label>
              <Input
                value={composeForm.subject}
                onChange={(e) => setComposeForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Subject"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Message</Label>
              <textarea
                className="w-full min-h-32 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={composeForm.body}
                onChange={(e) => setComposeForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Write your message…"
                rows={8}
              />
            </div>
            {sendMutation.isError && (
              <p className="text-xs text-destructive">
                {(sendMutation.error as Error)?.message ?? 'Failed to send'}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setComposeOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={sendMutation.isPending}
              onClick={handleSend}
              className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
            >
              <Send size={14} />
              {sendMutation.isPending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disconnect confirm dialog */}
      <Dialog open={disconnectConfirmOpen} onOpenChange={setDisconnectConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect Gmail?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove access to <strong>{account.gmailAddress}</strong>. You can reconnect
            anytime from the Billing section.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDisconnectConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={disconnectMutation.isPending}
              onClick={handleDisconnect}
            >
              {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
