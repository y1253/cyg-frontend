import { useEffect, useRef, useState } from 'react';
import { Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RichTextEditor } from './RichTextEditor';
import { UserAutocomplete } from './UserAutocomplete';
import { PolishButton, PolishPanel } from './PolishPanel';
import { formatBytes, htmlToText, textToHtml } from './message-utils';
import { useDraftPolish } from '@/hooks/useDraftPolish';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { useSendInternalMessage } from '@/hooks/useSendInternalMessage';
import type { DirectoryUser } from '@/api/internalMessages';

interface InternalComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected recipients (used when composing from a colleague's message). */
  initialTo?: DirectoryUser[];
  onSent?: () => void;
}

export function InternalComposeDialog({
  open,
  onOpenChange,
  initialTo,
  onSent,
}: InternalComposeDialogProps) {
  const [to, setTo] = useState<number[]>([]);
  const [cc, setCc] = useState<number[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The directory is only fetched while the dialog is open.
  const { data: directory = [] } = useUserDirectory(open);
  const polish = useDraftPolish();
  const sendMutation = useSendInternalMessage();

  // Reset the whole draft each time the dialog opens so a previous send (or a
  // discarded draft) never bleeds into the next message.
  useEffect(() => {
    if (!open) return;
    setTo(initialTo?.map((u) => u.id) ?? []);
    setCc([]);
    setSubject('');
    setBody('');
    setFiles([]);
    setError(null);
    polish.reset();
    // `polish` and `initialTo` are stable enough per-open; re-running on every
    // render would clear the draft as the user types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const bodyText = htmlToText(body);

  const handleSend = () => {
    setError(null);
    if (to.length === 0) {
      setError('Add at least one recipient.');
      return;
    }
    if (!bodyText.trim()) {
      setError('Write a message before sending.');
      return;
    }
    sendMutation.mutate(
      {
        to,
        cc,
        subject: subject.trim() || '(no subject)',
        body: bodyText,
        bodyHtml: body,
        files,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSent?.();
        },
        onError: (e: unknown) =>
          setError((e as Error)?.message ?? 'Failed to send message'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Bounded flex column: the body scrolls and the footer stays pinned, so
          Send is never pushed off-screen by a long draft. */}
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
          <div className="flex flex-col gap-1.5">
            <Label>To</Label>
            <UserAutocomplete
              value={to}
              onChange={setTo}
              users={directory}
              placeholder="Start typing a name…"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Cc</Label>
            <UserAutocomplete
              value={cc}
              onChange={setCc}
              users={directory}
              placeholder="Optional"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="internal-subject">Subject</Label>
            <Input
              id="internal-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Message</Label>
            <RichTextEditor
              html={body}
              onChange={setBody}
              placeholder="Write your message…"
              minHeight={200}
            />
          </div>

          {files.length > 0 && (
            <div className="flex flex-col gap-1">
              {files.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-2 text-xs text-muted-foreground rounded border px-2 py-1"
                >
                  <Paperclip size={12} className="shrink-0" />
                  <span className="truncate flex-1">{f.name}</span>
                  <span className="shrink-0">{formatBytes(f.size)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <PolishPanel
            polish={polish}
            context="An internal message between colleagues at a bookkeeping firm."
            onAccept={(polished) => setBody(textToHtml(polished))}
          />

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              setFiles([...files, ...Array.from(e.target.files ?? [])]);
              // Clear so picking the same file twice still fires onChange.
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1 mr-auto"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={14} /> Attach
          </Button>
          <PolishButton
            polish={polish}
            draftPlain={bodyText}
            context="An internal message between colleagues at a bookkeeping firm."
          />
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
            disabled={sendMutation.isPending || to.length === 0 || !bodyText.trim()}
            onClick={handleSend}
          >
            <Send size={14} />
            {sendMutation.isPending ? 'Sending…' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
