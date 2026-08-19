import type { ReactNode } from 'react';
import { Forward, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from './RichTextEditor';
import { AttachRow } from './AttachRow';
import { UploadProgressBar } from './ComposerBits';
import { PolishButton, PolishPanel } from './PolishPanel';
import type { DraftPolish } from '@/hooks/useDraftPolish';

/**
 * The inline reply / forward form that opens below an open conversation, in both
 * the company Communications tab and the internal Messages tab.
 *
 * There were four near-identical copies of this (~90 lines each). They differ in
 * their recipient widgets — company mail addresses people by string, internal
 * messaging by user id, so `RecipientAutocomplete` and `UserAutocomplete` take
 * incompatible value types — which is why To/CC come in as **slots** rather than
 * as a union-typed prop. The type mismatch stays at the call site, where it is
 * already resolved, instead of leaking into here.
 *
 * The docked compose window is deliberately NOT built on this: it is a floating,
 * minimizable window with its own scroll regions and header, not a panel in a
 * document flow.
 *
 * The Google Chat / Teams reply box is not built on this either — it has no
 * To/CC/Subject at all, and carries a quote-in-reply chip instead.
 */
export function InlineComposerPanel({
  variant,
  formRef,
  subtitle,
  beforeFields,
  toField,
  ccField,
  subject,
  onSubjectChange,
  subjectPlaceholder,
  body,
  onBodyChange,
  bodyPlaceholder,
  messageLabel,
  minHeight,
  maxHeight,
  files,
  setFiles,
  onPickFiles,
  attachmentNotice,
  attachNotices,
  cloudLabel,
  uploadProgress,
  error,
  polish,
  polishContext,
  polishDraftPlain,
  onPolishAccept,
  sendLabel,
  sendDisabled,
  isSending,
  onSend,
  onCancel,
}: {
  variant: 'reply' | 'forward';
  /** Scrolled into view when the form opens. */
  formRef?: React.Ref<HTMLDivElement>;
  /** "Replying to X · date" — the form sits below dimmed later messages, so the
   *  target has to be named rather than left implied. */
  subtitle?: ReactNode;
  /** Slot between the header and To — the forward scope radios live here. */
  beforeFields?: ReactNode;
  toField: ReactNode;
  ccField: ReactNode;
  subject: string;
  onSubjectChange: (value: string) => void;
  subjectPlaceholder?: string;
  body: string;
  onBodyChange: (html: string) => void;
  bodyPlaceholder: string;
  /** Renders a label above the editor when set; the internal tab has none. */
  messageLabel?: string;
  minHeight: number;
  maxHeight?: number;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  onPickFiles: (picked: FileList | null) => void;
  attachmentNotice: string | null;
  /** Extra warnings inside the attach block (hydration errors, size budgets). */
  attachNotices?: ReactNode;
  cloudLabel: string | null;
  uploadProgress?: number | null;
  error?: string | null;
  polish: DraftPolish;
  polishContext: string;
  /** The user's own prose, signature and quoted block already stripped. */
  polishDraftPlain: string;
  onPolishAccept: (polished: string) => void;
  sendLabel: string;
  sendDisabled: boolean;
  isSending: boolean;
  onSend: () => void;
  onCancel: () => void;
}) {
  return (
    <div ref={formRef} className="border rounded-md p-4 flex flex-col gap-3 bg-muted/10">
      <div className="flex flex-col gap-0.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {variant === 'forward' && <Forward size={13} />}
          {variant === 'forward' ? 'Forward' : 'Reply'}
        </p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      {beforeFields}

      <div className="flex flex-col gap-1">
        <Label className="text-xs">To</Label>
        {toField}
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">CC</Label>
        {ccField}
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Subject</Label>
        <Input
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder={subjectPlaceholder}
        />
      </div>

      {messageLabel ? (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">{messageLabel}</Label>
          <RichTextEditor
            html={body}
            onChange={onBodyChange}
            placeholder={bodyPlaceholder}
            minHeight={minHeight}
            maxHeight={maxHeight}
          />
        </div>
      ) : (
        <RichTextEditor
          html={body}
          onChange={onBodyChange}
          placeholder={bodyPlaceholder}
          minHeight={minHeight}
          maxHeight={maxHeight}
        />
      )}

      <AttachRow
        files={files}
        setFiles={setFiles}
        onPick={onPickFiles}
        notice={attachmentNotice}
        cloudLabel={cloudLabel}
      >
        {attachNotices}
      </AttachRow>

      {uploadProgress !== undefined && <UploadProgressBar progress={uploadProgress} />}
      {error && <p className="text-xs text-destructive">{error}</p>}

      <PolishPanel polish={polish} context={polishContext} onAccept={onPolishAccept} />

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={sendDisabled}
          onClick={onSend}
          className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
        >
          <Send size={13} />
          {isSending ? 'Sending…' : sendLabel}
        </Button>
        <PolishButton
          polish={polish}
          draftPlain={polishDraftPlain}
          context={polishContext}
        />
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
