import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Mail, Send, ArrowLeft, ArrowDown, ArrowUp, Plus, Trash2,
  Inbox, SendHorizonal, AlertOctagon, Trash, X, MessageSquare, Reply, MailOpen, Paperclip,
  Sparkles, Check, CheckCircle2, Search, ListChecks, Circle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useGmailAccount } from '@/hooks/useGmailAccount';
import { useGmailContacts } from '@/hooks/useGmailContacts';
import { useGmailEmails } from '@/hooks/useGmailEmails';
import { useGmailEmail } from '@/hooks/useGmailEmail';
import { useGmailChats } from '@/hooks/useGmailChats';
import { useGmailChatThread } from '@/hooks/useGmailChatThread';
import { useSendEmail } from '@/hooks/useSendEmail';
import { useSendChatMessage } from '@/hooks/useSendChatMessage';
import { useMarkEmailUnread } from '@/hooks/useMarkEmailUnread';
import { useMarkChatRead } from '@/hooks/useMarkChatRead';
import { useMarkChatUnread } from '@/hooks/useMarkChatUnread';
import { useMarkEmailComplete } from '@/hooks/useMarkEmailComplete';
import { useMarkEmailUncomplete } from '@/hooks/useMarkEmailUncomplete';
import { useMarkChatComplete } from '@/hooks/useMarkChatComplete';
import { useMarkChatUncomplete } from '@/hooks/useMarkChatUncomplete';
import { useDisconnectGmail } from '@/hooks/useDisconnectGmail';
import { useMarkEmailRead } from '@/hooks/useMarkEmailRead';
import { useGmailUnreadCount } from '@/hooks/useGmailUnreadCount';
import { useGmailUncompletedCount } from '@/hooks/useGmailUncompletedCount';
import { usePolishReply } from '@/hooks/usePolishReply';
import { fetchAuthUrl, emailAttachmentUrl, chatAttachmentUrl } from '@/api/gmail';
import type { EmailSummary, ChatInboxMessage, EmailDetail, EmailAttachment } from '@/api/gmail';
import { AttachmentPreview, AttachmentChip } from './AttachmentPreview';
import { RichTextEditor } from './RichTextEditor';
import { RecipientAutocomplete } from './RecipientAutocomplete';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

interface Props {
  companyId: number;
  isAdmin: boolean;
}

const FOLDERS = [
  { id: 'INBOX', label: 'Inbox', icon: Inbox },
  { id: 'UNCOMPLETED', label: 'Uncompleted', icon: Circle },
  { id: 'UNREAD', label: 'Unread', icon: Mail },
  { id: 'SENT', label: 'Sent', icon: SendHorizonal },
  { id: 'SPAM', label: 'Spam', icon: AlertOctagon },
  { id: 'TRASH', label: 'Trash', icon: Trash },
] as const;

// Tabs backed by the unified INBOX view (emails + chats). UNCOMPLETED and UNREAD
// fetch the same INBOX data and apply a forced completion/read filter on top.
const INBOX_TABS = ['INBOX', 'UNCOMPLETED', 'UNREAD'];

type UnifiedItem =
  | { kind: 'email'; data: EmailSummary }
  | { kind: 'chat'; data: ChatInboxMessage };

// Minimal shape needed to natively quote a chat message in a reply.
type QuoteTarget = {
  id: string;
  sender: string;
  text: string;
  lastUpdateTime: string;
};

function getItemTimestamp(item: UnifiedItem): number {
  const raw = item.kind === 'email' ? item.data.date : item.data.createTime;
  return new Date(raw).getTime() || 0;
}

function injectBaseTarget(html: string): string {
  if (html.includes('<base')) return html;
  const withHead = html.replace(/<head>/i, '<head><base target="_blank" rel="noreferrer">');
  if (withHead !== html) return withHead;
  return '<base target="_blank" rel="noreferrer">' + html;
}

// Rewrite inline `src="cid:XXX"` references in email HTML to authenticated
// attachment URLs so embedded images render inside the sandboxed iframe.
function rewriteInlineImages(
  html: string,
  attachments: EmailAttachment[],
  urlFor: (att: EmailAttachment) => string,
): string {
  return html.replace(
    /src\s*=\s*(["']?)cid:([^"'>\s]+)\1/gi,
    (match, _quote: string, cid: string) => {
      let decoded = cid;
      try {
        decoded = decodeURIComponent(cid);
      } catch {
        // keep raw cid if it isn't valid percent-encoding
      }
      const att = attachments.find(
        (a) => a.contentId && (a.contentId === cid || a.contentId === decoded),
      );
      return att ? `src="${urlFor(att)}"` : match;
    },
  );
}

function formatEmailDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function extractEmail(from: string): string {
  const match = /<(.+?)>/.exec(from);
  return match ? match[1] : from.trim();
}

function prefixReSubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`;
}

function senderInitial(from: string): string {
  const name = from.replace(/<[^>]+>/, '').trim().replace(/"/g, '');
  return (name[0] ?? '?').toUpperCase();
}

// De-dupe a list by `id`, keeping first occurrence (guards against page overlap).
function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    if (!seen.has(it.id)) {
      seen.add(it.id);
      out.push(it);
    }
  }
  return out;
}

// Plain-text version of an HTML body (used as the text/plain MIME fallback).
function htmlToText(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.innerText || tmp.textContent || '').trim();
}

// Blank lines seeded above the signature so the caret starts well clear of it.
const SIGNATURE_LEAD =
  '<div><br></div><div><br></div><div><br></div><div><br></div>';

// Split a compose/reply body into the user's text and the trailing CYG
// signature block (marked with data-cyg-signature), so polish never touches it.
function splitSignature(html: string): { body: string; sig: string } {
  const idx = html.search(/<div[^>]*data-cyg-signature/i);
  if (idx === -1) return { body: html, sig: '' };
  return { body: html.slice(0, idx), sig: html.slice(idx) };
}

// Plain text → minimal HTML so an AI-polished reply renders in the RichTextEditor
// and htmlToText / htmlToChatMarkdown still serialize it correctly on send.
function textToHtml(text: string): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? '<br>' : escape(line)))
    .join('<br>');
}

// Convert the chat editor's HTML into Google Chat's formatting tokens
// (*bold*, _italic_, ~strike~, "- " bullets). Chat has no HTML — it renders
// these tokens — so we serialize the WYSIWYG editor output on send.
function htmlToChatMarkdown(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;

  const walk = (node: Node): string => {
    let out = '';
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? '';
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === 'br') {
        out += '\n';
        return;
      }
      if (tag === 'ul' || tag === 'ol') {
        const lis = Array.from(el.children).filter(
          (c) => c.tagName.toLowerCase() === 'li',
        );
        lis.forEach((li, i) => {
          const liText = walk(li).trim();
          out += (tag === 'ul' ? '- ' : `${i + 1}. `) + liText + '\n';
        });
        return;
      }
      let inner = walk(el);
      const style = el.getAttribute('style') ?? '';
      const isBold =
        tag === 'b' || tag === 'strong' || /font-weight\s*:\s*(bold|[6-9]00)/i.test(style);
      const isItalic = tag === 'i' || tag === 'em' || /font-style\s*:\s*italic/i.test(style);
      const isStrike =
        tag === 's' || tag === 'strike' || tag === 'del' || /line-through/i.test(style);
      if (isBold) inner = `*${inner}*`;
      if (isItalic) inner = `_${inner}_`;
      if (isStrike) inner = `~${inner}~`;
      // Block-level elements start on their own line.
      out += tag === 'div' || tag === 'p' ? inner + '\n' : inner;
    });
    return out;
  };

  return walk(container)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');
}

// Human-readable byte size, e.g. 1536 → "1.5 KB".
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

export function CommunicationsTab({ companyId, isAdmin }: Props) {
  const { token } = useAuth();
  const qc = useQueryClient();

  const [connecting, setConnecting] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  // The clicked chat message — its createTime freezes the thread at that moment,
  // and its id is the per-message read/unread target for the open thread.
  const [openedChatMsgId, setOpenedChatMsgId] = useState<string | null>(null);
  const [openedChatMsgTime, setOpenedChatMsgTime] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>('INBOX');
  const [composeOpen, setComposeOpen] = useState(false);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  // The message awaiting "mark complete" confirmation (carries kind so the right
  // endpoint is hit). null = no confirm dialog open.
  const [completeTarget, setCompleteTarget] = useState<{ kind: 'email' | 'chat'; id: string; fromDetail?: boolean } | null>(null);
  const [composeForm, setComposeForm] = useState<{ to: string[]; subject: string; body: string; cc: string[] }>({ to: [], subject: '', body: '', cc: [] });
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const composeFileRef = useRef<HTMLInputElement>(null);
  const [newEmailBanner, setNewEmailBanner] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyForm, setReplyForm] = useState<{ to: string[]; subject: string; body: string; cc: string[] }>({ to: [], subject: '', body: '', cc: [] });
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const replyFileRef = useRef<HTMLInputElement>(null);
  const [chatReplyOpen, setChatReplyOpen] = useState(false);
  const [chatReplyHtml, setChatReplyHtml] = useState('');
  // AI "Polish reply": the polished text awaiting the user's decision, and the
  // original plain draft it was made from (reused when re-polishing). Cleared on
  // accept/discard and whenever a different message/reply is opened.
  const [polishPreview, setPolishPreview] = useState<string | null>(null);
  const [polishSource, setPolishSource] = useState<string | null>(null);
  // The message the reply will natively quote (default = the opened/anchor
  // message; cleared → plain reply). Mirrors Google Chat's "Quote in reply".
  const [quoteTarget, setQuoteTarget] = useState<QuoteTarget | null>(null);
  const [selectedMsgIsRead, setSelectedMsgIsRead] = useState(false);
  // Inbox search + filter. `searchInput` is the raw box; `searchQuery` is the
  // debounced/committed term sent to the server. `filter` narrows by kind/state.
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'email' | 'chat'>('all');
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Bulk multi-select (admin, inbox only). `selectionMode` swaps row clicks from
  // "open" to "toggle select"; `selectedIds` holds the picked message ids (email
  // ids have no "/", chat ids do, so the kind is re-derived at action time). A
  // pending bulk complete/uncomplete is parked in `bulkAction` for confirmation.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'complete' | 'uncomplete' | null>(null);
  // Leaving the inbox (folder switch) exits selection mode and drops the picks.
  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [selectedLabel]);

  const { data: account, isLoading: accountLoading } = useGmailAccount(companyId);
  // INBOX, UNCOMPLETED and UNREAD all render the unified email+chat inbox.
  const isInboxLike = INBOX_TABS.includes(selectedLabel);
  // The Gmail label to actually fetch: the pseudo-tabs load real INBOX emails.
  const emailLabel = isInboxLike ? 'INBOX' : selectedLabel;

  // Past recipients for To/CC autocomplete. Only fetched (once, then cached) when
  // the user is actually composing/replying — the endpoint scans many messages.
  const { data: contacts } = useGmailContacts(
    companyId,
    !!account && (composeOpen || replyOpen),
  );

  // Search only applies to the inbox (the search bar is inbox-only); folders are
  // left unfiltered even if a term is still in the box from a previous inbox visit.
  const activeSearch = isInboxLike ? searchQuery || undefined : undefined;

  // Emails + chats are infinite queries; older pages load on scroll.
  const emailQuery = useGmailEmails(companyId, emailLabel, activeSearch);
  const chatQuery = useGmailChats(companyId, account, activeSearch);
  const emailsLoading = emailQuery.isLoading;
  const chatsLoading = chatQuery.isLoading;
  const chatsError = chatQuery.error;

  // Flattened, de-duped items across all loaded pages.
  const emailItems: EmailSummary[] = dedupeById(
    (emailQuery.data?.pages ?? []).flatMap((p) => p.messages),
  );
  const chatItems: ChatInboxMessage[] = dedupeById(
    (chatQuery.data?.pages ?? []).flatMap((p) => p.messages),
  );
  // Chat status/notices come from the first page.
  const chatFirst = chatQuery.data?.pages?.[0];
  const { data: emailDetail, isLoading: emailDetailLoading } = useGmailEmail(
    companyId,
    account ? selectedMsgId : null,
  );
  const { data: chatThread, isLoading: chatThreadLoading } = useGmailChatThread(
    companyId,
    account ? selectedSpaceId : null,
  );
  const sendMutation = useSendEmail(companyId);
  const sendChatMutation = useSendChatMessage(companyId);
  const disconnectMutation = useDisconnectGmail(companyId);
  const markReadMutation = useMarkEmailRead(companyId);
  const markUnreadMutation = useMarkEmailUnread(companyId);
  const markChatReadMutation = useMarkChatRead(companyId);
  const markChatUnreadMutation = useMarkChatUnread(companyId);
  const markEmailCompleteMutation = useMarkEmailComplete(companyId);
  const markEmailUncompleteMutation = useMarkEmailUncomplete(companyId);
  const markChatCompleteMutation = useMarkChatComplete(companyId);
  const markChatUncompleteMutation = useMarkChatUncomplete(companyId);
  const polishMutation = usePolishReply();
  const { data: unreadData } = useGmailUnreadCount(companyId, account);
  const { data: uncompletedData } = useGmailUncompletedCount(companyId, account);

  const threadScrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  // Inline reply forms render below a (potentially tall) message/thread; scroll
  // them into view when opened so the user doesn't have to scroll down to reply.
  const replyFormRef = useRef<HTMLDivElement>(null);
  const chatReplyFormRef = useRef<HTMLDivElement>(null);
  // Whether the anchor (opened) message is currently visible in the scroll
  // container — drives the floating "Back to message" button. `anchorDir` is
  // the direction to scroll to reach it when it's off-screen.
  const [anchorVisible, setAnchorVisible] = useState(true);
  const [anchorDir, setAnchorDir] = useState<'up' | 'down'>('up');

  const scrollToAnchor = useCallback(() => {
    anchorRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, []);

  // When a reply form opens, scroll it into view (it mounts on the flag flip, so
  // the effect runs after it's in the DOM and the ref is populated).
  useEffect(() => {
    if (replyOpen) replyFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [replyOpen]);

  useEffect(() => {
    if (chatReplyOpen) chatReplyFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [chatReplyOpen]);

  // On open (or when the anchor / thread changes), position the anchor message
  // at the BOTTOM of the visible area so the view reads as if the conversation
  // ends there — the dimmed "future" messages sit just below (scroll to see).
  useEffect(() => {
    if (!selectedSpaceId || !openedChatMsgId) return;
    const el = anchorRef.current;
    if (el) el.scrollIntoView({ block: 'end' });
    // Re-run when the loaded thread changes (anchor node mounts after fetch).
  }, [selectedSpaceId, openedChatMsgId, chatThread?.messages?.length]);

  // Track anchor visibility to toggle the "Back to message" button.
  useEffect(() => {
    const root = threadScrollRef.current;
    const target = anchorRef.current;
    if (!root || !target) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        setAnchorVisible(entry.isIntersecting);
        if (!entry.isIntersecting && entry.rootBounds) {
          // Anchor below the viewport → scroll down to reach it, else up.
          setAnchorDir(
            entry.boundingClientRect.top >= entry.rootBounds.bottom ? 'down' : 'up',
          );
        }
      },
      { root, threshold: 0.1 },
    );
    obs.observe(target);
    return () => obs.disconnect();
  }, [selectedSpaceId, openedChatMsgId, chatThread?.messages?.length]);

  // Infinite scroll: when the bottom sentinel nears the viewport, load the next
  // (older) page of BOTH sources. `rootMargin` prefetches slightly early.
  const emailHasNext = emailQuery.hasNextPage;
  const emailFetchingNext = emailQuery.isFetchingNextPage;
  const chatHasNext = chatQuery.hasNextPage;
  const chatFetchingNext = chatQuery.isFetchingNextPage;
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        if (emailHasNext && !emailFetchingNext) void emailQuery.fetchNextPage();
        if (isInboxLike && chatHasNext && !chatFetchingNext) void chatQuery.fetchNextPage();
      },
      { root: null, rootMargin: '300px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isInboxLike,
    selectedLabel,
    selectedMsgId,
    selectedSpaceId,
    emailHasNext,
    emailFetchingNext,
    chatHasNext,
    chatFetchingNext,
  ]);

  // Build unified sorted list for INBOX (emails + one row per incoming chat msg),
  // newest first. Because emails and chats page independently, the visible tail is
  // clamped to a watermark — the newest "oldest-loaded" boundary among sources that
  // still have more — so the list never shows a half-loaded (out-of-order) tail.
  const unifiedItems: UnifiedItem[] = (() => {
    if (!isInboxLike) return [];
    const emailUnified = emailItems.map((e): UnifiedItem => ({ kind: 'email', data: e }));
    const chatUnified = chatItems.map((c): UnifiedItem => ({ kind: 'chat', data: c }));
    const merged = [...emailUnified, ...chatUnified].sort(
      (a, b) => getItemTimestamp(b) - getItemTimestamp(a),
    );

    // True oldest-loaded timestamp of a source (arrays aren't globally sorted).
    const minTs = (arr: UnifiedItem[]) =>
      arr.length ? Math.min(...arr.map(getItemTimestamp)) : -Infinity;
    const emailTail = emailQuery.hasNextPage ? minTs(emailUnified) : -Infinity;
    const chatTail = chatQuery.hasNextPage ? minTs(chatUnified) : -Infinity;
    const cutoff = Math.max(emailTail, chatTail);
    return cutoff === -Infinity
      ? merged
      : merged.filter((it) => getItemTimestamp(it) >= cutoff);
  })();

  // Apply the kind/state filter dropdown over the merged inbox. Search itself is
  // already applied server-side (Gmail `q` for email, text match for chat).
  const visibleItems = unifiedItems.filter((it) => {
    if (filter === 'email' && it.kind !== 'email') return false;
    if (filter === 'chat' && it.kind !== 'chat') return false;
    // Tab-forced state filter: UNCOMPLETED hides completed, UNREAD hides read.
    if (selectedLabel === 'UNCOMPLETED' && it.data.isCompleted) return false;
    if (selectedLabel === 'UNREAD' && it.data.isRead) return false;
    return true;
  });
  // Whether the inbox is currently narrowed by search/kind (drives empty-state copy).
  const isFiltering = filter !== 'all' || activeSearch != null;

  // The opened chat message (for the thread view header / space name fallback).
  const openedChatMsg = openedChatMsgId
    ? chatItems.find((m) => m.id === openedChatMsgId) ?? null
    : null;
  const threadMessages = chatThread?.messages ?? [];
  // The anchor message object — prefer the freshly-fetched thread copy (has the
  // most up-to-date lastUpdateTime for quoting), fall back to the inbox row.
  const anchorMsg: QuoteTarget | null = openedChatMsgId
    ? threadMessages.find((m) => m.id === openedChatMsgId) ??
      (openedChatMsg
        ? {
            id: openedChatMsg.id,
            sender: openedChatMsg.sender,
            text: openedChatMsg.text,
            lastUpdateTime: openedChatMsg.lastUpdateTime,
          }
        : null)
    : null;
  // Display name for the open thread — prefer freshly-fetched thread metadata.
  const selectedSpaceName =
    chatThread?.spaceName ?? openedChatMsg?.spaceName ?? 'Conversation';

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
          void qc.invalidateQueries({ queryKey: ['gmail-unread-count', companyId] });
          setNewEmailBanner(true);
          setTimeout(() => setNewEmailBanner(false), 5000);
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

  // Merge newly-picked files into an existing selection, de-duped by name+size.
  const addFiles = (
    setter: React.Dispatch<React.SetStateAction<File[]>>,
    picked: FileList | null,
  ) => {
    if (!picked || picked.length === 0) return;
    setter((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const next = [...prev];
      for (const f of Array.from(picked)) {
        const key = `${f.name}:${f.size}`;
        if (!seen.has(key)) {
          seen.add(key);
          next.push(f);
        }
      }
      return next;
    });
  };

  const handleSend = () => {
    if (composeForm.to.length === 0) return;
    // composeForm.body holds rich-text HTML; send it plus a plain-text fallback.
    sendMutation.mutate(
      {
        to: composeForm.to.join(', '),
        subject: composeForm.subject,
        body: htmlToText(composeForm.body),
        bodyHtml: composeForm.body,
        cc: composeForm.cc.length ? composeForm.cc.join(', ') : undefined,
        files: composeFiles,
      },
      {
        onSuccess: () => {
          setComposeOpen(false);
          setComposeForm({ to: [], subject: '', body: '', cc: [] });
          setComposeFiles([]);
        },
      },
    );
  };

  const handleSendReply = () => {
    if (!emailDetail) return;
    if (replyForm.to.length === 0) return;
    sendMutation.mutate(
      {
        to: replyForm.to.join(', '),
        subject: replyForm.subject,
        body: htmlToText(replyForm.body),
        bodyHtml: replyForm.body,
        cc: replyForm.cc.length ? replyForm.cc.join(', ') : undefined,
        inReplyTo: emailDetail.messageId || undefined,
        threadId: emailDetail.threadId || undefined,
        files: replyFiles,
      },
      {
        onSuccess: () => {
          setReplyOpen(false);
          setReplyForm({ to: [], subject: '', body: '', cc: [] });
          setReplyFiles([]);
        },
      },
    );
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => setDisconnectConfirmOpen(false),
    });
  };

  // Marking complete asks for confirmation first; the confirm dialog carries the
  // message kind so the right endpoint is hit. Un-completing is a direct toggle.
  const confirmComplete = () => {
    if (!completeTarget) return;
    const { kind, id, fromDetail } = completeTarget;
    if (kind === 'email') markEmailCompleteMutation.mutate(id);
    else markChatCompleteMutation.mutate(id);
    setCompleteTarget(null);
    // If confirmed from inside an open message, also exit back to the inbox
    // (so we don't re-prompt on the row).
    if (fromDetail) {
      if (kind === 'chat') handleCloseChat();
      else setSelectedMsgId(null);
    }
  };

  const uncomplete = (kind: 'email' | 'chat', id: string) => {
    if (kind === 'email') markEmailUncompleteMutation.mutate(id);
    else markChatUncompleteMutation.mutate(id);
  };

  // ── Bulk multi-select actions (inbox) ──────────────────────────────────────
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Master "select all" toggles every currently-visible (filtered + loaded) row.
  const allVisibleSelected =
    visibleItems.length > 0 && visibleItems.every((it) => selectedIds.has(it.data.id));
  const someVisibleSelected =
    !allVisibleSelected && visibleItems.some((it) => selectedIds.has(it.data.id));
  const toggleSelectAll = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleItems.map((it) => it.data.id)));
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  // Fan a single action out over the selected messages, dispatching the matching
  // existing (optimistic, self-invalidating) mutation per id by its kind. Note:
  // email read/unread hits the Gmail API once per message — fine for this small
  // admin tool; there is no batch endpoint. read/unread run immediately;
  // complete/uncomplete are routed through a confirm dialog first (via bulkAction).
  const runBulk = (action: 'read' | 'unread' | 'complete' | 'uncomplete') => {
    const items = visibleItems.filter((it) => selectedIds.has(it.data.id));
    for (const it of items) {
      const email = it.kind === 'email';
      if (action === 'read') (email ? markReadMutation : markChatReadMutation).mutate(it.data.id);
      else if (action === 'unread') (email ? markUnreadMutation : markChatUnreadMutation).mutate(it.data.id);
      else if (action === 'complete') (email ? markEmailCompleteMutation : markChatCompleteMutation).mutate(it.data.id);
      else if (action === 'uncomplete') (email ? markEmailUncompleteMutation : markChatUncompleteMutation).mutate(it.data.id);
    }
    setSelectedIds(new Set());
  };

  const confirmBulkAction = () => {
    if (bulkAction) runBulk(bulkAction);
    setBulkAction(null);
  };

  // Small blue completed-check toggle shown on each inbox row. Not-complete →
  // opens the confirm popup; already-complete → undoes directly (no confirm).
  const renderCompleteToggle = (kind: 'email' | 'chat', id: string, isCompleted: boolean) => (
    <button
      className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full hover:bg-muted/60 transition-colors"
      title={isCompleted ? 'Completed — click to undo' : 'Mark complete'}
      onClick={(e) => {
        e.stopPropagation();
        if (isCompleted) uncomplete(kind, id);
        else setCompleteTarget({ kind, id });
      }}
    >
      <CheckCircle2
        size={16}
        className={isCompleted ? 'text-blue-600 fill-blue-100' : 'text-muted-foreground/40'}
      />
    </button>
  );

  // Gmail-style attachment chips shown under an email's subject/snippet in the list.
  // Shows the first few, then a "+N" overflow (which just opens the email). Chip
  // clicks stop propagation so the row's own click (open/select) doesn't fire.
  const renderEmailAttachmentChips = (msg: EmailSummary) => {
    const atts = msg.attachments ?? [];
    if (atts.length === 0) return null;
    const MAX_CHIPS = 3;
    const shown = atts.slice(0, MAX_CHIPS);
    const overflow = atts.length - shown.length;
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {shown.map((att) => (
          <AttachmentChip
            key={att.attachmentId}
            url={emailAttachmentUrl(token ?? '', companyId, msg.id, att, 'inline')}
            downloadUrl={emailAttachmentUrl(token ?? '', companyId, msg.id, att, 'attachment')}
            mimeType={att.mimeType}
            filename={att.filename}
          />
        ))}
        {overflow > 0 && (
          <span className="rounded-full border bg-background px-2 py-1 text-xs text-muted-foreground">
            +{overflow}
          </span>
        )}
      </div>
    );
  };

  const handleSelectFolder = (folderId: string) => {
    setSelectedLabel(folderId);
    setSelectedMsgId(null);
    setSelectedSpaceId(null);
  };

  const handleOpenEmail = (msg: EmailSummary) => {
    if (!msg.isRead) markReadMutation.mutate(msg.id);
    setSelectedMsgId(msg.id);
    setSelectedMsgIsRead(true); // always read after opening (auto-marked or was already read)
    setSelectedSpaceId(null);
    setReplyOpen(false);
  };

  const handleOpenChat = (msg: ChatInboxMessage) => {
    if (!msg.isRead) markChatReadMutation.mutate(msg.id); // mark THIS message read, not the whole space
    setSelectedSpaceId(msg.spaceId);
    setOpenedChatMsgId(msg.id);
    setOpenedChatMsgTime(msg.createTime); // anchor: messages after this are dimmed
    setSelectedMsgId(null);
    setReplyOpen(false);
    setChatReplyOpen(false);
    setChatReplyHtml('');
    setQuoteTarget(null);
    resetPolish();
  };

  const handleCloseChat = () => {
    setSelectedSpaceId(null);
    setOpenedChatMsgId(null);
    setOpenedChatMsgTime(null);
    setChatReplyOpen(false);
    setChatReplyHtml('');
    setQuoteTarget(null);
    resetPolish();
  };

  // Re-anchor the open conversation to an earlier message: it scrolls into focus,
  // later messages dim as "future", and the bottom Reply then quotes it. This is
  // how the user "navigates to" a previous message to reply there (no floating
  // per-message composer in the current view). `m` is a loaded thread message.
  const handleNavigateToMessage = (m: { id: string; createTime: string }) => {
    setOpenedChatMsgId(m.id);
    setOpenedChatMsgTime(m.createTime);
    // Reset any in-progress reply so the composer re-targets the new anchor.
    setChatReplyOpen(false);
    setChatReplyHtml('');
    setQuoteTarget(null);
    resetPolish();
  };

  // Open the reply box, defaulting to natively quoting the anchor message
  // (Google Chat's "Quote in reply"). The user can clear the quote before send.
  const handleOpenChatReply = () => {
    setQuoteTarget(anchorMsg);
    setChatReplyOpen(true);
    resetPolish();
  };

  const handleSendChatReply = () => {
    if (!selectedSpaceId || !htmlToText(chatReplyHtml).trim()) return;
    sendChatMutation.mutate(
      {
        spaceId: selectedSpaceId,
        text: htmlToChatMarkdown(chatReplyHtml),
        ...(quoteTarget
          ? {
              quotedMessageName: quoteTarget.id,
              quotedMessageLastUpdateTime: quoteTarget.lastUpdateTime,
            }
          : {}),
      },
      {
        onSuccess: () => {
          setChatReplyOpen(false);
          setChatReplyHtml('');
          setQuoteTarget(null);
          // The thread query is invalidated by the mutation; once the refetch
          // lands, scroll to the bottom so the just-sent reply is visible.
          setTimeout(() => {
            const el = threadScrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }, 300);
        },
      },
    );
  };

  const handleOpenReply = (detail: EmailDetail) => {
    const replyTo = extractEmail(detail.from);
    setReplyForm({
      to: replyTo ? [replyTo] : [],
      subject: prefixReSubject(detail.subject || ''),
      // Seed the editable signature a few lines below the caret (matches Gmail;
      // server no longer appends it).
      body: account?.signatureHtml ? `${SIGNATURE_LEAD}${account.signatureHtml}` : '',
      cc: [],
    });
    setReplyFiles([]);
    setReplyOpen(true);
    resetPolish();
  };

  // ── AI polish reply ────────────────────────────────────────────────────────

  const resetPolish = () => {
    setPolishPreview(null);
    setPolishSource(null);
    polishMutation.reset();
  };

  // Assemble the context sent to the AI: the whole email / whole conversation.
  const buildEmailContext = (detail: EmailDetail): string =>
    `Subject: ${detail.subject || '(no subject)'}\n` +
    `From: ${detail.from}\n` +
    `To: ${detail.to}\n\n` +
    (detail.bodyText?.trim() || htmlToText(detail.bodyHtml ?? ''));

  const buildChatContext = (): string =>
    threadMessages.map((m) => `${m.isOwn ? 'You' : m.sender}: ${m.text}`).join('\n');

  // Context for a brand-new compose (no prior thread). Kept non-empty so it
  // satisfies the polish endpoint's required `context` field.
  const buildComposeContext = (): string =>
    `Subject: ${composeForm.subject || '(no subject)'}\n` +
    `To: ${composeForm.to.join(', ') || '(unspecified)'}\n\n(New email — no prior conversation.)`;

  // Where a polished draft is written back. Reply and compose both use the
  // email polish tone; chat uses the chat tone.
  type PolishTarget = 'reply' | 'compose' | 'chat';

  // Run the AI polish for a draft, stashing the source so "Re-polish" reuses it.
  const runPolish = (target: PolishTarget, draftPlain: string, context: string) => {
    if (!draftPlain.trim()) return;
    setPolishSource(draftPlain);
    polishMutation.mutate(
      { kind: target === 'chat' ? 'chat' : 'email', draft: draftPlain, context },
      { onSuccess: (r) => setPolishPreview(r.polished) },
    );
  };

  // Accept the polished text → replace the draft (the editor refreshes because
  // focus is on the Accept button, not the contentEditable), then clear preview.
  const acceptPolish = (target: PolishTarget) => {
    if (polishPreview === null) return;
    const html = textToHtml(polishPreview);
    // Re-attach the original (unpolished) signature after the polished text.
    if (target === 'reply') {
      const { sig } = splitSignature(replyForm.body);
      setReplyForm((f) => ({ ...f, body: sig ? `${html}<div><br></div>${sig}` : html }));
    } else if (target === 'compose') {
      const { sig } = splitSignature(composeForm.body);
      setComposeForm((f) => ({ ...f, body: sig ? `${html}<div><br></div>${sig}` : html }));
    } else setChatReplyHtml(html);
    resetPolish();
  };

  // "Polish with AI" button for an action row — hidden once a preview is
  // showing (the preview panel offers Re-polish instead).
  const renderPolishButton = (target: PolishTarget, draftPlain: string, context: string) =>
    polishPreview === null && (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1"
        disabled={polishMutation.isPending || !draftPlain.trim()}
        onClick={() => runPolish(target, draftPlain, context)}
      >
        <Sparkles size={14} />
        {polishMutation.isPending ? 'Polishing…' : 'Polish with AI'}
      </Button>
    );

  // Preview panel shown above the action row after a polish completes: the
  // polished text plus Accept / Re-polish / Discard. Also renders polish errors.
  const renderPolishPreview = (target: PolishTarget, context: string) => (
    <>
      {polishPreview !== null && (
        <div className="rounded-md border border-teal-200 bg-teal-50/60 p-3 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700">
            <Sparkles size={13} /> AI-polished version
          </div>
          <p className="text-sm whitespace-pre-wrap text-foreground">{polishPreview}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => acceptPolish(target)}
              className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
            >
              <Check size={13} /> Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={polishMutation.isPending}
              onClick={() => runPolish(target, polishSource ?? '', context)}
            >
              {polishMutation.isPending ? 'Polishing…' : 'Re-polish'}
            </Button>
            <Button size="sm" variant="outline" onClick={resetPolish}>
              Discard
            </Button>
          </div>
        </div>
      )}
      {polishMutation.isError && (
        <p className="text-xs text-destructive">
          {(polishMutation.error as Error)?.message ?? 'Failed to polish reply'}
        </p>
      )}
    </>
  );

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

  // Mark-complete confirmation — shared across the inbox and both detail views
  // so it can appear in-place wherever "Mark complete" is clicked.
  const completeConfirmDialog = (
    <Dialog open={completeTarget !== null} onOpenChange={(open) => { if (!open) setCompleteTarget(null); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark message complete?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Confirm you've completed this message. It stays in the inbox with a blue check,
          visible to everyone.
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setCompleteTarget(null)}>
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1"
            onClick={confirmComplete}
          >
            <CheckCircle2 size={14} /> Mark complete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // Bulk complete/uncomplete confirmation (inbox multi-select). read/unread apply
  // without a prompt; state-changing bulk actions confirm here first.
  const bulkConfirmDialog = (
    <Dialog open={bulkAction !== null} onOpenChange={(open) => { if (!open) setBulkAction(null); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {bulkAction === 'uncomplete'
              ? `Mark ${selectedIds.size} message${selectedIds.size === 1 ? '' : 's'} not complete?`
              : `Mark ${selectedIds.size} message${selectedIds.size === 1 ? '' : 's'} complete?`}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {bulkAction === 'uncomplete'
            ? 'This removes the completed check from the selected messages for everyone.'
            : 'The selected messages stay in the inbox with a blue check, visible to everyone.'}
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setBulkAction(null)}>
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1"
            onClick={confirmBulkAction}
          >
            {bulkAction === 'uncomplete' ? <Circle size={14} /> : <CheckCircle2 size={14} />}
            {bulkAction === 'uncomplete' ? 'Mark not complete' : 'Mark complete'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // ── Chat conversation (thread) view ───────────────────────────────────────

  if (selectedSpaceId) {
    const anchorTime = openedChatMsgTime ? new Date(openedChatMsgTime).getTime() : null;

    const isFutureTime = (createTime: string) =>
      anchorTime !== null && new Date(createTime).getTime() > anchorTime;
    const byId = new Map<string, (typeof threadMessages)[number]>(
      threadMessages.map((m) => [m.id, m]),
    );

    // My own future replies that answer a message currently in the REGULAR zone are
    // surfaced again in regular color right after that message, so a just-sent reply
    // isn't buried among later dimmed activity. A reply to a future/light message is
    // NOT surfaced — relative to the anchor it's future and stays light.
    const surfacedReplies = new Map<string, typeof threadMessages>();
    const surfacedIds = new Set<string>();
    if (anchorTime !== null) {
      for (const m of threadMessages) {
        if (!(m.isOwn && m.quotedMessageName && isFutureTime(m.createTime))) continue;
        const answered = byId.get(m.quotedMessageName);
        if (!answered || isFutureTime(answered.createTime)) continue;
        const arr = surfacedReplies.get(m.quotedMessageName) ?? [];
        arr.push(m);
        surfacedReplies.set(m.quotedMessageName, arr);
        surfacedIds.add(m.id);
      }
    }

    // A surfaced reply's dimmed chronological copy is only worth showing when its true
    // order differs from its surfaced spot — i.e. some light (future, non-surfaced)
    // message falls between the answered message and the reply. Otherwise the surfaced
    // copy already sits in the right place and the dimmed copy is a redundant duplicate.
    const showLightCopy = (r: (typeof threadMessages)[number]) => {
      const answered = r.quotedMessageName ? byId.get(r.quotedMessageName) : undefined;
      if (!answered) return true;
      const xt = new Date(answered.createTime).getTime();
      const rt = new Date(r.createTime).getTime();
      return threadMessages.some((mm) => {
        if (mm.id === r.id || surfacedIds.has(mm.id) || !isFutureTime(mm.createTime))
          return false;
        const mt = new Date(mm.createTime).getTime();
        return mt > xt && mt < rt;
      });
    };

    // Render a single chat bubble. Reused for the normal chronological instance and
    // for the surfaced (regular-color) copy of my own future replies.
    const renderChatBubble = (
      m: (typeof threadMessages)[number],
      opts: {
        keyStr: string;
        dimmed: boolean;
        isAnchor: boolean;
        attachRef: boolean;
        hideQuote: boolean;
        surfaced?: boolean;
      },
    ) => {
      const quoted =
        !opts.hideQuote && m.quotedMessageName
          ? threadMessages.find((q) => q.id === m.quotedMessageName)
          : null;
      return (
        <div
          key={opts.keyStr}
          ref={opts.attachRef ? anchorRef : undefined}
          className={`flex flex-col gap-1 transition-opacity ${m.isOwn ? 'items-end' : 'items-start'} ${opts.dimmed ? 'opacity-50' : ''}`}
        >
          <div className="flex items-center gap-2">
            {!m.isOwn && (
              <div className="shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[10px] font-semibold">
                {(m.sender[0] ?? '?').toUpperCase()}
              </div>
            )}
            <span className="text-xs font-medium text-foreground/80">{m.isOwn ? 'You' : m.sender}</span>
            <span className="text-[11px] text-muted-foreground">
              {opts.surfaced ? 'Your reply' : formatEmailDate(m.createTime)}
            </span>
          </div>
          <div className={`flex items-center gap-1.5 group/msg max-w-full ${m.isOwn ? 'flex-row-reverse' : ''}`}>
            <div
              className={`max-w-[75%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${
                m.isOwn ? 'bg-teal-600 text-white' : 'ml-8 bg-background border'
              } ${opts.isAnchor ? 'ring-2 ring-purple-400 ring-offset-1' : ''} ${
                opts.surfaced ? 'border-l-4 border-l-teal-300' : ''
              }`}
            >
              {/* Quoted-message preview — click to navigate to the original message */}
              {!opts.hideQuote && m.quotedMessageName && (
                <div
                  role={quoted ? 'button' : undefined}
                  title={quoted ? 'Go to this message' : undefined}
                  onClick={quoted ? () => handleNavigateToMessage(quoted) : undefined}
                  className={`mb-1.5 border-l-2 pl-2 text-xs ${
                    m.isOwn ? 'border-white/60 text-white/80' : 'border-purple-300 text-muted-foreground'
                  } ${quoted ? 'cursor-pointer hover:opacity-80' : ''}`}
                >
                  {quoted ? (
                    <>
                      <span className="font-medium">{quoted.isOwn ? 'You' : quoted.sender}</span>
                      <span className="line-clamp-2">{quoted.text || '(no text)'}</span>
                    </>
                  ) : (
                    <span className="italic">Quoted a message</span>
                  )}
                </div>
              )}
              {m.text || (m.attachments && m.attachments.length > 0 ? '' : '(empty message)')}
              {m.attachments && m.attachments.length > 0 && (
                <div className={`flex flex-col gap-2 ${m.text ? 'mt-2' : ''}`}>
                  {m.attachments.map((att) =>
                    att.resourceName ? (
                      <AttachmentPreview
                        key={att.name}
                        url={chatAttachmentUrl(token ?? '', companyId, att, 'inline')}
                        downloadUrl={chatAttachmentUrl(token ?? '', companyId, att, 'attachment')}
                        mimeType={att.contentType}
                        filename={att.contentName}
                      />
                    ) : att.driveFileId ? (
                      <AttachmentPreview
                        key={att.name}
                        mimeType={att.contentType}
                        filename={att.contentName}
                        driveHref={`https://drive.google.com/file/d/${att.driveFileId}/view`}
                      />
                    ) : null,
                  )}
                </div>
              )}
            </div>
            {/* Per-message Reply → navigate/re-anchor to this message, then reply there */}
            {!opts.isAnchor && !opts.surfaced && (
              <button
                type="button"
                title="Reply to this message"
                onClick={() => handleNavigateToMessage(m)}
                className="shrink-0 opacity-0 group-hover/msg:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
              >
                <Reply size={14} />
              </button>
            )}
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col gap-4">
        <div className="sticky top-0 z-20 -mx-6 -mt-5 px-6 pt-5 pb-2 bg-background/95 backdrop-blur-sm">
          <button
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
            onClick={handleCloseChat}
          >
            <ArrowLeft size={14} /> Back
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium shrink-0">
                Chat
              </span>
              <span className="text-sm font-medium truncate">{selectedSpaceName}</span>
            </div>
            <div className="flex items-center gap-2">
              {openedChatMsgId && (
                (chatItems.find((m) => m.id === openedChatMsgId)?.isCompleted ?? false) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-blue-600 border-blue-200 hover:text-blue-700"
                    onClick={() => uncomplete('chat', openedChatMsgId)}
                  >
                    <CheckCircle2 size={14} className="fill-blue-100" /> Completed
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setCompleteTarget({ kind: 'chat', id: openedChatMsgId, fromDetail: true })}
                  >
                    <CheckCircle2 size={14} /> Mark complete
                  </Button>
                )
              )}
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-muted-foreground"
                disabled={markChatUnreadMutation.isPending || !openedChatMsgId}
                onClick={() => {
                  if (!openedChatMsgId) return;
                  markChatUnreadMutation.mutate(openedChatMsgId, {
                    onSuccess: handleCloseChat,
                  });
                }}
              >
                <MailOpen size={14} /> Mark as unread
              </Button>
            </div>
          </div>

          {/* Conversation thread */}
          <div className="relative">
            <div ref={threadScrollRef} className="border rounded-md bg-muted/10 max-h-[28rem] overflow-y-auto p-4 flex flex-col gap-3">
              {chatThreadLoading && threadMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Loading conversation…</p>
              ) : threadMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No messages in this conversation.</p>
              ) : (
                threadMessages.map((m) => {
                  const isAnchor = m.id === openedChatMsgId;
                  // Messages newer than the anchor are the "future" — dimmed.
                  const isFuture = isFutureTime(m.createTime);
                  const surfaced = surfacedReplies.get(m.id) ?? [];
                  // A surfaced reply's own chronological bubble is dropped unless its
                  // light copy conveys a different order (avoids redundant duplication).
                  const skipChrono = surfacedIds.has(m.id) && !showLightCopy(m);
                  return (
                    <Fragment key={m.id}>
                      {!skipChrono &&
                        renderChatBubble(m, {
                          keyStr: m.id,
                          dimmed: isFuture,
                          isAnchor,
                          attachRef: isAnchor,
                          hideQuote: false,
                        })}
                      {/* My own future replies to this message, surfaced here in
                          regular color right after the message they answer. */}
                      {surfaced.map((r) =>
                        renderChatBubble(r, {
                          keyStr: `${r.id}:surfaced`,
                          dimmed: false,
                          isAnchor: false,
                          attachRef: false,
                          hideQuote: true,
                          surfaced: true,
                        }),
                      )}
                    </Fragment>
                  );
                })
              )}
            </div>

            {/* Floating "Back to message" button — shows when the anchor scrolls
                out of view, jumps back to the opened message. */}
            {openedChatMsgId && !anchorVisible && threadMessages.length > 0 && (
              <button
                type="button"
                onClick={scrollToAnchor}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-purple-600 text-white text-xs font-medium px-3 py-1.5 shadow-lg hover:bg-purple-700 transition-colors"
              >
                {anchorDir === 'down' ? <ArrowDown size={13} /> : <ArrowUp size={13} />} Back to message
              </button>
            )}
          </div>

          {/* Chat-send permission not granted — this account was connected before
              chat replies existed and only has read access. Reconnect to fix. */}
          {account.hasChatScope === false && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertOctagon size={14} className="mt-0.5 shrink-0" />
              <span>
                This account hasn't granted permission to send chat replies — it was
                connected before chat replies were enabled. Reconnect the account and
                approve the chat permission to reply.
              </span>
            </div>
          )}

          {/* Reply button */}
          {!chatReplyOpen && (
            <Button
              size="sm"
              variant="outline"
              className="w-fit gap-1"
              onClick={handleOpenChatReply}
            >
              <Reply size={14} /> Reply
            </Button>
          )}

          {/* Inline chat reply form */}
          {chatReplyOpen && (
            <div ref={chatReplyFormRef} className="border rounded-md p-4 flex flex-col gap-3 bg-muted/10">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Reply in {selectedSpaceName}
              </p>
              {/* Quote-in-reply preview (removable, like Google Chat) */}
              {quoteTarget && (
                <div className="flex items-start gap-2 rounded-md border-l-2 border-purple-400 bg-purple-50/60 pl-2 pr-2 py-1.5 text-xs">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-purple-800">Replying to {quoteTarget.sender}</span>
                    <p className="text-muted-foreground line-clamp-2">{quoteTarget.text || '(no text)'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuoteTarget(null)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    title="Remove quote"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Message</Label>
                <RichTextEditor
                  mode="chat"
                  html={chatReplyHtml}
                  onChange={setChatReplyHtml}
                  placeholder="Write your reply…"
                  minHeight={110}
                />
              </div>
              {sendChatMutation.isError && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-destructive">
                    {(sendChatMutation.error as Error)?.message ?? 'Failed to send'}
                  </p>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="self-start border-amber-300 text-amber-700 hover:bg-amber-50 text-xs"
                      onClick={() => void handleConnect()}
                      disabled={connecting}
                    >
                      {connecting ? 'Opening…' : 'Re-connect Gmail to fix permissions'}
                    </Button>
                  )}
                </div>
              )}
              {renderPolishPreview('chat', buildChatContext())}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={sendChatMutation.isPending || !htmlToText(chatReplyHtml).trim()}
                  onClick={handleSendChatReply}
                  className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
                >
                  <Send size={13} />
                  {sendChatMutation.isPending ? 'Sending…' : 'Send Reply'}
                </Button>
                {renderPolishButton('chat', htmlToText(chatReplyHtml), buildChatContext())}
                <Button size="sm" variant="outline" onClick={() => { setChatReplyOpen(false); setChatReplyHtml(''); setQuoteTarget(null); resetPolish(); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
        {completeConfirmDialog}
      </div>
    );
  }

  // ── Email detail view ─────────────────────────────────────────────────────

  if (selectedMsgId) {
    return (
      <div className="flex flex-col gap-4">
        <div className="sticky top-0 z-20 -mx-6 -mt-5 px-6 pt-5 pb-2 bg-background/95 backdrop-blur-sm">
          <button
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit"
            onClick={() => { setSelectedMsgId(null); setReplyOpen(false); }}
          >
            <ArrowLeft size={14} /> Back
          </button>
        </div>

        {emailDetailLoading && (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        )}

        {emailDetail && (
          <div className="flex flex-col gap-3">
            <h2 className="font-semibold text-base">{emailDetail.subject || '(no subject)'}</h2>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div><span className="font-medium">From:</span> {emailDetail.from}</div>
              <div><span className="font-medium">To:</span> {emailDetail.to}</div>
              <div><span className="font-medium">Date:</span> {formatEmailDate(emailDetail.date)}</div>
            </div>
            <div className="border rounded-md overflow-hidden mt-2">
              {emailDetail.bodyHtml ? (
                <iframe
                  srcDoc={injectBaseTarget(
                    rewriteInlineImages(
                      emailDetail.bodyHtml,
                      emailDetail.attachments ?? [],
                      (att) =>
                        emailAttachmentUrl(token ?? '', companyId, emailDetail.id, att, 'inline'),
                    ),
                  )}
                  sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  className="w-full min-h-96 border-0"
                  title="Email body"
                />
              ) : (
                <pre className="p-4 text-sm whitespace-pre-wrap font-sans">
                  {emailDetail.bodyText ?? '(empty)'}
                </pre>
              )}
            </div>

            {/* Attachment strip — inline images already show in the body above */}
            {(() => {
              const strip = (emailDetail.attachments ?? []).filter((a) => !a.isInline);
              if (strip.length === 0) return null;
              return (
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" />
                    Attachments ({strip.length})
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {strip.map((att) => (
                      <AttachmentPreview
                        key={att.attachmentId}
                        url={emailAttachmentUrl(token ?? '', companyId, emailDetail.id, att, 'inline')}
                        downloadUrl={emailAttachmentUrl(token ?? '', companyId, emailDetail.id, att, 'attachment')}
                        mimeType={att.mimeType}
                        filename={att.filename}
                        size={att.size}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Action buttons */}
            {!replyOpen && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => handleOpenReply(emailDetail)}
                >
                  <Reply size={14} /> Reply
                </Button>
                {selectedMsgIsRead && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-muted-foreground"
                    disabled={markUnreadMutation.isPending}
                    onClick={() => {
                      markUnreadMutation.mutate(emailDetail.id, {
                        onSuccess: () => { setSelectedMsgId(null); setReplyOpen(false); },
                      });
                    }}
                  >
                    <MailOpen size={14} /> Mark as unread
                  </Button>
                )}
                {(emailItems.find((m) => m.id === emailDetail.id)?.isCompleted ?? false) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-blue-600 border-blue-200 hover:text-blue-700"
                    onClick={() => uncomplete('email', emailDetail.id)}
                  >
                    <CheckCircle2 size={14} className="fill-blue-100" /> Completed
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setCompleteTarget({ kind: 'email', id: emailDetail.id, fromDetail: true })}
                  >
                    <CheckCircle2 size={14} /> Mark complete
                  </Button>
                )}
              </div>
            )}

            {/* Inline reply form */}
            {replyOpen && (
              <div ref={replyFormRef} className="border rounded-md p-4 flex flex-col gap-3 bg-muted/10">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reply</p>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">To</Label>
                  <RecipientAutocomplete
                    value={replyForm.to}
                    onChange={(v) => setReplyForm((f) => ({ ...f, to: v }))}
                    contacts={contacts ?? []}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">CC</Label>
                  <RecipientAutocomplete
                    value={replyForm.cc}
                    onChange={(v) => setReplyForm((f) => ({ ...f, cc: v }))}
                    contacts={contacts ?? []}
                    placeholder="Optional"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Subject</Label>
                  <Input
                    value={replyForm.subject}
                    onChange={(e) => setReplyForm((f) => ({ ...f, subject: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Message</Label>
                  <RichTextEditor
                    html={replyForm.body}
                    onChange={(h) => setReplyForm((f) => ({ ...f, body: h }))}
                    placeholder="Write your reply…"
                    minHeight={140}
                  />
                </div>
                {/* Attachments */}
                <div className="flex flex-col gap-2">
                  <input
                    ref={replyFileRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addFiles(setReplyFiles, e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-fit gap-1"
                    onClick={() => replyFileRef.current?.click()}
                  >
                    <Paperclip size={14} /> Attach
                  </Button>
                  {replyFiles.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {replyFiles.map((f, i) => (
                        <div
                          key={`${f.name}:${f.size}:${i}`}
                          className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs"
                        >
                          <Paperclip size={12} className="shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                          {f.size > 0 && (
                            <span className="shrink-0 text-muted-foreground">{formatBytes(f.size)}</span>
                          )}
                          <button
                            type="button"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            title="Remove attachment"
                            onClick={() => setReplyFiles((prev) => prev.filter((_, j) => j !== i))}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {sendMutation.isError && (
                  <p className="text-xs text-destructive">
                    {(sendMutation.error as Error)?.message ?? 'Failed to send'}
                  </p>
                )}
                {renderPolishPreview('reply', buildEmailContext(emailDetail))}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={sendMutation.isPending || (!htmlToText(replyForm.body) && replyFiles.length === 0)}
                    onClick={handleSendReply}
                    className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
                  >
                    <Send size={13} />
                    {sendMutation.isPending ? 'Sending…' : 'Send Reply'}
                  </Button>
                  {renderPolishButton('reply', htmlToText(splitSignature(replyForm.body).body), buildEmailContext(emailDetail))}
                  <Button size="sm" variant="outline" onClick={() => { setReplyOpen(false); setReplyFiles([]); resetPolish(); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        {completeConfirmDialog}
      </div>
    );
  }

  // ── Inbox / folder view ───────────────────────────────────────────────────

  const isLoading = isInboxLike ? (emailsLoading || chatsLoading) : emailsLoading;

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
          <Button
            size="sm"
            onClick={() => { setComposeForm({ to: [], subject: '', body: account?.signatureHtml ? `${SIGNATURE_LEAD}${account.signatureHtml}` : '', cc: [] }); setComposeFiles([]); resetPolish(); setComposeOpen(true); }}
            className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
          >
            <Plus size={14} /> Compose
          </Button>
          {isAdmin && (
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

      {/* New email banner */}
      {newEmailBanner && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-sm">
          <span className="flex items-center gap-2">
            <Mail size={14} className="text-teal-600" />
            New email received
          </span>
          <button onClick={() => setNewEmailBanner(false)} className="text-teal-600 hover:text-teal-800">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Re-connect notice for missing Chat scopes */}
      {chatFirst?.needsReconnect && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <span>
            Google Chat messages are unavailable.{' '}
            {isAdmin
              ? 'Re-connect the Gmail account to restore them.'
              : 'An admin needs to re-connect the Gmail account.'}
          </span>
          {isAdmin && (
            <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 text-xs" onClick={() => void handleConnect()}>
              Re-connect
            </Button>
          )}
        </div>
      )}

      {/* No Chat spaces notice */}
      {!chatFirst?.needsReconnect && chatFirst?.chatStatus === 'no_spaces' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border text-muted-foreground text-sm">
          <MessageSquare size={13} className="shrink-0" />
          <span>No Google Chat spaces found for this account. Chat messages will appear here once conversations exist.</span>
        </div>
      )}

      {/* Chat disabled notice */}
      {chatFirst?.chatStatus === 'chat_disabled' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border text-muted-foreground text-sm">
          <MessageSquare size={13} className="shrink-0" />
          <span>Google Chat is not enabled for this account. Email messages are still available.</span>
        </div>
      )}

      {/* Chat app not configured in Google Cloud Console */}
      {chatFirst?.chatStatus === 'app_not_configured' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <MessageSquare size={13} className="shrink-0" />
          <span>Google Chat app is not configured. In Google Cloud Console → Google Chat API → Configuration, fill in the app name and set status to Enabled.</span>
        </div>
      )}

      {/* Chat API error notice */}
      {chatFirst?.chatStatus === 'error' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <MessageSquare size={13} className="shrink-0" />
          <span>Could not load Google Chat messages. Email messages are still available.</span>
        </div>
      )}

      {/* Chat query failed entirely (network error / 5xx — no first page) */}
      {!!chatsError && !chatFirst && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <span className="flex items-center gap-2">
            <MessageSquare size={13} className="shrink-0" />
            Could not load Google Chat messages. Email messages are still available.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-300 text-amber-700 hover:bg-amber-100 text-xs"
            onClick={() => void qc.invalidateQueries({ queryKey: ['gmail-chats', companyId] })}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Chat fetched ok but no messages found (history may be off) */}
      {chatFirst?.chatStatus === 'ok' && chatItems.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border text-muted-foreground text-sm">
          <MessageSquare size={13} className="shrink-0" />
          <span>No recent Google Chat messages found. History may be disabled for your chat spaces.</span>
        </div>
      )}

      {/* Folder tabs */}
      <div className="flex items-center gap-1 border-b">
        {FOLDERS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => handleSelectFolder(id)}
            className={[
              'flex items-center gap-1.5 px-3 py-2 text-sm transition-colors',
              selectedLabel === id
                ? 'text-teal-700 border-b-2 border-teal-600 font-medium -mb-px'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <Icon size={13} />
            {label}
            {id === 'UNCOMPLETED' && (uncompletedData?.count ?? 0) > 0 && (
              <span className="ml-0.5 text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-semibold leading-none">
                {uncompletedData!.count}
              </span>
            )}
            {id === 'UNREAD' && (unreadData?.count ?? 0) > 0 && (
              <span className="ml-0.5 text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-semibold leading-none">
                {unreadData!.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search + filter toolbar (inbox-like tabs only) */}
      {isInboxLike && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search inbox…"
              className="pl-8 pr-8 h-9"
            />
            {searchInput && (
              <button
                type="button"
                title="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchInput('')}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <Select value={filter} onValueChange={(v) => setFilter((v as typeof filter) ?? 'all')}>
            <SelectTrigger size="sm" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="chat">Chat</SelectItem>
            </SelectContent>
          </Select>
          {/* Multi-select toggle (admin only) */}
          {isAdmin && (
            <Button
              type="button"
              variant={selectionMode ? 'default' : 'outline'}
              size="sm"
              className={selectionMode ? 'gap-1.5 bg-teal-600 hover:bg-teal-700 text-white' : 'gap-1.5'}
              onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
            >
              <ListChecks size={14} />
              {selectionMode ? 'Done' : 'Select'}
            </Button>
          )}
        </div>
      )}

      {/* Bulk action bar (inbox-like, admin, selection mode) */}
      {isInboxLike && isAdmin && selectionMode && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-teal-200 bg-teal-50/60 px-3 py-2">
          <label className="flex items-center gap-2 text-sm font-medium text-teal-900 cursor-pointer select-none">
            <Checkbox
              checked={allVisibleSelected}
              indeterminate={someVisibleSelected}
              onCheckedChange={toggleSelectAll}
            />
            Select all
          </label>
          <span className="text-xs text-muted-foreground">
            {selectedIds.size} selected{' '}
            <span className="text-muted-foreground/70">· of {visibleItems.length} loaded</span>
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button
              type="button" variant="outline" size="sm" className="gap-1"
              disabled={selectedIds.size === 0}
              onClick={() => runBulk('read')}
            >
              <MailOpen size={14} /> Mark read
            </Button>
            <Button
              type="button" variant="outline" size="sm" className="gap-1"
              disabled={selectedIds.size === 0}
              onClick={() => runBulk('unread')}
            >
              <Mail size={14} /> Mark unread
            </Button>
            <Button
              type="button" variant="outline" size="sm" className="gap-1 text-blue-700 border-blue-200 hover:bg-blue-50"
              disabled={selectedIds.size === 0}
              onClick={() => setBulkAction('complete')}
            >
              <CheckCircle2 size={14} /> Complete
            </Button>
            <Button
              type="button" variant="outline" size="sm" className="gap-1"
              disabled={selectedIds.size === 0}
              onClick={() => setBulkAction('uncomplete')}
            >
              <Circle size={14} /> Uncomplete
            </Button>
            <Button
              type="button" variant="ghost" size="sm" className="gap-1 text-muted-foreground"
              onClick={exitSelection}
            >
              <X size={14} /> Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Email / unified list */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : isInboxLike ? (
        /* ── Unified inbox (emails + chats) ── */
        <Card className="overflow-hidden gap-0 py-0 rounded-lg">
          {visibleItems.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {isFiltering
                ? 'No messages match your search'
                : selectedLabel === 'UNCOMPLETED'
                  ? 'No uncompleted messages'
                  : selectedLabel === 'UNREAD'
                    ? 'No unread messages'
                    : 'Inbox is empty'}
            </div>
          ) : (
            visibleItems.map((item, idx) =>
              item.kind === 'email' ? (
                <div
                  key={item.data.id}
                  className={[
                    'relative flex items-start gap-3 px-4 py-3.5 transition-colors cursor-pointer group',
                    selectionMode && selectedIds.has(item.data.id)
                      ? 'bg-teal-50/70 hover:bg-teal-50'
                      : !item.data.isRead ? 'bg-white hover:bg-blue-50/60' : 'bg-muted/10 hover:bg-muted/30',
                    idx > 0 ? 'border-t border-border/60' : '',
                  ].join(' ')}
                  onClick={() =>
                    selectionMode ? toggleSelected(item.data.id) : handleOpenEmail(item.data)
                  }
                >
                  {/* Unread accent bar */}
                  {!item.data.isRead && (
                    <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-teal-500 rounded-l-lg" />
                  )}
                  {/* Selection checkbox */}
                  {selectionMode && (
                    <div className="mt-1 shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(item.data.id)}
                        onCheckedChange={() => toggleSelected(item.data.id)}
                      />
                    </div>
                  )}
                  {/* Read/unread toggle dot */}
                  <button
                    className="mt-1 shrink-0 flex items-center justify-center w-5 h-5 rounded-full hover:bg-muted/60 transition-colors"
                    title={item.data.isRead ? 'Mark as unread' : 'Mark as read'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.data.isRead) markUnreadMutation.mutate(item.data.id);
                      else markReadMutation.mutate(item.data.id);
                    }}
                  >
                    <span className={[
                      'w-2.5 h-2.5 rounded-full border-2 transition-colors',
                      !item.data.isRead ? 'bg-teal-500 border-teal-500' : 'bg-transparent border-muted-foreground/40',
                    ].join(' ')} />
                  </button>
                  {/* Avatar */}
                  <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold mt-0.5">
                    {senderInitial(item.data.from)}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={['text-sm truncate', !item.data.isRead ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'].join(' ')}>
                        {item.data.from.replace(/<[^>]+>/, '').trim().replace(/"/g, '') || item.data.from}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {renderCompleteToggle('email', item.data.id, !!item.data.isCompleted)}
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200 font-medium">
                          Email
                        </Badge>
                        <span className={['text-xs', !item.data.isRead ? 'font-semibold text-foreground' : 'text-muted-foreground'].join(' ')}>
                          {formatEmailDate(item.data.date)}
                        </span>
                      </div>
                    </div>
                    <span className={['text-sm truncate', !item.data.isRead ? 'font-semibold' : 'text-foreground/80'].join(' ')}>
                      {item.data.subject || '(no subject)'}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{item.data.snippet}</span>
                    {renderEmailAttachmentChips(item.data)}
                  </div>
                </div>
              ) : (
                <div
                  key={item.data.id}
                  className={[
                    'relative flex items-start gap-3 px-4 py-3.5 transition-colors cursor-pointer',
                    selectionMode && selectedIds.has(item.data.id)
                      ? 'bg-teal-50/70 hover:bg-teal-50'
                      : !item.data.isRead ? 'bg-white hover:bg-purple-50/60' : 'bg-muted/10 hover:bg-purple-50/40',
                    idx > 0 ? 'border-t border-border/60' : '',
                  ].join(' ')}
                  onClick={() =>
                    selectionMode ? toggleSelected(item.data.id) : handleOpenChat(item.data)
                  }
                >
                  {/* Unread accent bar */}
                  {!item.data.isRead && (
                    <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-purple-500 rounded-l-lg" />
                  )}
                  {/* Selection checkbox */}
                  {selectionMode && (
                    <div className="mt-1 shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(item.data.id)}
                        onCheckedChange={() => toggleSelected(item.data.id)}
                      />
                    </div>
                  )}
                  {/* Read/unread toggle dot */}
                  <button
                    className="mt-1 shrink-0 flex items-center justify-center w-5 h-5 rounded-full hover:bg-muted/60 transition-colors"
                    title={item.data.isRead ? 'Mark as unread' : 'Mark as read'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.data.isRead) markChatUnreadMutation.mutate(item.data.id);
                      else markChatReadMutation.mutate(item.data.id);
                    }}
                  >
                    <span className={[
                      'w-2.5 h-2.5 rounded-full border-2 transition-colors',
                      !item.data.isRead ? 'bg-purple-500 border-purple-500' : 'bg-transparent border-muted-foreground/40',
                    ].join(' ')} />
                  </button>
                  {/* Avatar */}
                  <div className="shrink-0 w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-semibold mt-0.5">
                    {(item.data.sender[0] ?? '?').toUpperCase()}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={['text-sm truncate flex items-center gap-1.5', !item.data.isRead ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'].join(' ')}>
                        <MessageSquare size={11} className="text-purple-500 shrink-0" />
                        {item.data.sender}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {renderCompleteToggle('chat', item.data.id, !!item.data.isCompleted)}
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200 font-medium">
                          Chat
                        </Badge>
                        <span className={['text-xs', !item.data.isRead ? 'font-semibold text-foreground' : 'text-muted-foreground'].join(' ')}>
                          {formatEmailDate(item.data.createTime)}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground truncate">{item.data.spaceName}</span>
                    <span className={['text-xs truncate flex items-center gap-1', !item.data.isRead ? 'font-medium text-foreground/80' : 'text-muted-foreground'].join(' ')}>
                      {item.data.hasAttachments && <Paperclip size={11} className="shrink-0" />}
                      {item.data.text || (item.data.hasAttachments ? 'Attachment' : '(no text)')}
                    </span>
                  </div>
                </div>
              ),
            )
          )}
        </Card>
      ) : (
        /* ── Email-only folder view (Sent / Spam / Trash) ── */
        <>
          <Card className="overflow-hidden gap-0 py-0 rounded-lg">
            {emailItems.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No messages</div>
            ) : (
              emailItems.map((msg: EmailSummary, idx: number) => (
                <div
                  key={msg.id}
                  className={[
                    'relative flex items-start gap-3 px-4 py-3.5 transition-colors cursor-pointer group',
                    !msg.isRead ? 'bg-white hover:bg-blue-50/60' : 'bg-muted/10 hover:bg-muted/30',
                    idx > 0 ? 'border-t border-border/60' : '',
                  ].join(' ')}
                  onClick={() => handleOpenEmail(msg)}
                >
                  {!msg.isRead && (
                    <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-teal-500 rounded-l-lg" />
                  )}
                  <button
                    className="mt-1 shrink-0 flex items-center justify-center w-5 h-5 rounded-full hover:bg-muted/60 transition-colors"
                    title={msg.isRead ? 'Mark as unread' : 'Mark as read'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (msg.isRead) markUnreadMutation.mutate(msg.id);
                      else markReadMutation.mutate(msg.id);
                    }}
                  >
                    <span className={[
                      'w-2.5 h-2.5 rounded-full border-2 transition-colors',
                      !msg.isRead ? 'bg-teal-500 border-teal-500' : 'bg-transparent border-muted-foreground/40',
                    ].join(' ')} />
                  </button>
                  <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold mt-0.5">
                    {senderInitial(msg.from)}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={['text-sm truncate', !msg.isRead ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'].join(' ')}>
                        {msg.from.replace(/<[^>]+>/, '').trim().replace(/"/g, '') || msg.from}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {renderCompleteToggle('email', msg.id, !!msg.isCompleted)}
                        <span className={['text-xs', !msg.isRead ? 'font-semibold text-foreground' : 'text-muted-foreground'].join(' ')}>
                          {formatEmailDate(msg.date)}
                        </span>
                      </div>
                    </div>
                    <span className={['text-sm truncate', !msg.isRead ? 'font-semibold' : 'text-foreground/80'].join(' ')}>
                      {msg.subject || '(no subject)'}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{msg.snippet}</span>
                    {renderEmailAttachmentChips(msg)}
                  </div>
                </div>
              ))
            )}
          </Card>
        </>
      )}

      {/* Infinite-scroll sentinel + status (shown for both inbox and folders) */}
      {!isLoading && (
        <div ref={loadMoreRef} className="flex items-center justify-center py-4">
          {emailFetchingNext || chatFetchingNext ? (
            <span className="text-xs text-muted-foreground">Loading more…</span>
          ) : (isInboxLike ? (!emailHasNext && !chatHasNext) : !emailHasNext) &&
            (isInboxLike ? visibleItems.length > 0 : emailItems.length > 0) ? (
            <span className="text-xs text-muted-foreground/70">You're all caught up</span>
          ) : null}
        </div>
      )}

      {/* Compose dialog */}
      <Dialog open={composeOpen} onOpenChange={(open) => { setComposeOpen(open); if (!open) { setComposeFiles([]); resetPolish(); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send size={16} /> New Email
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">To</Label>
              <RecipientAutocomplete
                value={composeForm.to}
                onChange={(v) => setComposeForm((f) => ({ ...f, to: v }))}
                contacts={contacts ?? []}
                placeholder="recipient@example.com"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">CC</Label>
              <RecipientAutocomplete
                value={composeForm.cc}
                onChange={(v) => setComposeForm((f) => ({ ...f, cc: v }))}
                contacts={contacts ?? []}
                placeholder="Optional"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Subject (optional)</Label>
              <Input
                value={composeForm.subject}
                onChange={(e) => setComposeForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Subject"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Message</Label>
              <RichTextEditor
                html={composeForm.body}
                onChange={(h) => setComposeForm((f) => ({ ...f, body: h }))}
                placeholder="Write your message…"
                minHeight={200}
              />
            </div>
            {/* Attachments */}
            <div className="flex flex-col gap-2">
              <input
                ref={composeFileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(setComposeFiles, e.target.files);
                  e.target.value = '';
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-fit gap-1"
                onClick={() => composeFileRef.current?.click()}
              >
                <Paperclip size={14} /> Attach
              </Button>
              {composeFiles.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {composeFiles.map((f, i) => (
                    <div
                      key={`${f.name}:${f.size}:${i}`}
                      className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs"
                    >
                      <Paperclip size={12} className="shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                      {f.size > 0 && (
                        <span className="shrink-0 text-muted-foreground">{formatBytes(f.size)}</span>
                      )}
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        title="Remove attachment"
                        onClick={() => setComposeFiles((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {sendMutation.isError && (
              <p className="text-xs text-destructive">
                {(sendMutation.error as Error)?.message ?? 'Failed to send'}
              </p>
            )}
            {renderPolishPreview('compose', buildComposeContext())}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => { setComposeOpen(false); setComposeFiles([]); resetPolish(); }}>
              Cancel
            </Button>
            {renderPolishButton('compose', htmlToText(splitSignature(composeForm.body).body), buildComposeContext())}
            <Button
              disabled={sendMutation.isPending || (!htmlToText(composeForm.body) && composeFiles.length === 0)}
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

      {/* Mark-complete confirmation */}
      {completeConfirmDialog}
      {/* Bulk complete/uncomplete confirmation */}
      {bulkConfirmDialog}
    </div>
  );
}
