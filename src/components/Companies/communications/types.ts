import {
  Inbox, Mail, SendHorizonal, AlertOctagon, Trash, Circle,
} from 'lucide-react';
import type { EmailSummary, ChatInboxMessage } from '@/api/gmail';

export const FOLDERS = [
  { id: 'INBOX', label: 'Inbox', icon: Inbox },
  { id: 'UNCOMPLETED', label: 'Uncompleted', icon: Circle },
  { id: 'UNREAD', label: 'Unread', icon: Mail },
  { id: 'SENT', label: 'Sent', icon: SendHorizonal },
  { id: 'SPAM', label: 'Spam', icon: AlertOctagon },
  { id: 'TRASH', label: 'Trash', icon: Trash },
] as const;

export const ALL_LABELS: string[] = FOLDERS.map((f) => f.id);

// Tabs backed by the unified INBOX view (emails + chats). UNCOMPLETED and UNREAD
// fetch the same INBOX data and apply a forced completion/read filter on top.
export const INBOX_TABS = ['INBOX', 'UNCOMPLETED', 'UNREAD'];

/** Also the Select's `items` — base-ui shows the raw value in the trigger without it. */
export const KIND_FILTER_LABELS: Record<string, string> = {
  all: 'All',
  email: 'Email',
  chat: 'Chat',
};

export type KindFilter = 'all' | 'email' | 'chat';

export type UnifiedItem =
  | { kind: 'email'; data: EmailSummary }
  | { kind: 'chat'; data: ChatInboxMessage };

// Minimal shape needed to natively quote a chat message in a reply.
export type QuoteTarget = {
  id: string;
  sender: string;
  text: string;
  lastUpdateTime: string;
};

/** Which message the confirm dialog is about, and whether it was raised from an
 *  open message (in which case confirming also exits back to the inbox). */
export type CompleteTarget = {
  kind: 'email' | 'chat';
  id: string;
  fromDetail?: boolean;
};

export function getItemTimestamp(item: UnifiedItem): number {
  const raw = item.kind === 'email' ? item.data.date : item.data.createTime;
  return new Date(raw).getTime() || 0;
}
