import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  createDraft,
  deleteDraft,
  updateDraft,
  type DraftPayload,
} from '@/api/drafts';

/** The composer fields a draft carries. */
export interface DraftSnapshot {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  /** Plain-text fallback. */
  body: string;
  bodyHtml: string;
}

export type DraftStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Stable empty default, so an omitted `files` never re-runs the debounce effect. */
const NO_FILES: File[] = [];

/**
 * Threading and provenance, fixed for the life of the composer.
 *
 * `replyToMessageId` + `draftKind` matter only on the FIRST save, and only to Graph:
 * they select createReply/createForward, which is the one way Outlook will set
 * In-Reply-To and References. Gmail threads from `threadId` + `inReplyTo` in the raw
 * MIME instead, and ignores both.
 */
export type DraftSeed = Pick<
  DraftPayload,
  | 'threadId'
  | 'inReplyTo'
  | 'references'
  | 'replyToMessageId'
  | 'draftKind'
  | 'forwardedFrom'
  | 'forwardScope'
>;

/** How long after the last keystroke the draft is written. */
const DEBOUNCE_MS = 2000;

/**
 * The same, for a draft that carries attachments.
 *
 * Gmail has no partial draft update: `drafts.update` replaces the whole RFC822
 * message, so preserving attachments through a TEXT save means the server
 * re-downloads and re-uploads every one of them. At the 18 MB inline budget a 2s
 * debounce would move a lot of bytes for one changed word. Outlook does not pay this
 * — its PATCH does not touch attachments — but the composer does not branch on
 * provider for a timing constant.
 */
const DEBOUNCE_WITH_FILES_MS = 12000;

/** Attachment identity, matching `mergeAttachments`' own de-dupe key. */
export const fileSetKey = (files: File[]): string =>
  files.map((f) => `${f.name}:${f.size}`).join('|');

/**
 * What counts as "the draft changed".
 *
 * `body` is deliberately absent: it is `bodyHtml` run through htmlToText, so it can
 * never differ on its own, and including it would only make the key bigger. Files are
 * absent too — attachments are not part of a text autosave.
 */
export const serialiseDraft = (s: DraftSnapshot): string =>
  JSON.stringify([s.to, s.cc, s.bcc, s.subject, s.bodyHtml]);

/**
 * Whether a save is worth issuing. The single source of truth for the two rules that
 * keep autosave off an already rate-limited mailbox, and the reason both the debounce
 * and the save itself agree about when to fire.
 *
 * - An unchanged snapshot is never rewritten, so a pause in READING costs nothing —
 *   only a pause in typing does.
 * - Nothing is created until the composer has content: opening Compose and closing it
 *   again must not leave an empty draft in the user's mailbox. Once a draft EXISTS,
 *   though, emptying the composer is a real edit and must be saved — otherwise
 *   clearing a draft silently leaves the old text in the mailbox.
 */
export function shouldWriteDraft({
  key,
  savedKey,
  hasDraft,
  dirty,
}: {
  key: string;
  savedKey: string | null;
  hasDraft: boolean;
  dirty: boolean;
}): boolean {
  if (key === savedKey) return false;
  return hasDraft || dirty;
}

const serialise = serialiseDraft;

/**
 * Keep one composer's draft in the connected mailbox.
 *
 * One instance per editor, like `useDraftPolish` — two composers sharing one would
 * write each other's text into the same draft.
 *
 * Three things here are load-bearing rather than polish, because this mailbox is
 * already close to Gmail's per-user rate limit:
 *
 * - **Unchanged snapshots are skipped.** A timer that fired regardless would write on
 *   every pause in reading, not every pause in typing.
 * - **Writes are coalesced, never concurrent.** Two in-flight creates would produce
 *   TWO drafts for one composer, and the second would win the id — leaving an orphan
 *   in the user's Drafts folder that nothing ever cleans up.
 * - **Nothing is written until the composer is dirty.** Opening Compose and closing it
 *   again must not leave an empty draft behind.
 */
export function useProviderDraft({
  companyId,
  snapshot,
  files = NO_FILES,
  dirty,
  enabled = true,
  initialDraftId = null,
  initialHasAttachments,
  seed,
}: {
  companyId: number;
  snapshot: DraftSnapshot;
  /**
   * The composer's current attachments.
   *
   * Sent only when the SET changes — re-uploading them on every keystroke-pause
   * would move megabytes for a typo fix. A text-only save instead tells the server
   * whether any exist, so it knows whether it has to protect them.
   */
  files?: File[];
  /** The composer has content worth saving. */
  dirty: boolean;
  enabled?: boolean;
  /** Set when the composer was opened FROM an existing draft. */
  initialDraftId?: string | null;
  /**
   * Whether that draft carries attachments. The composer listed them when it opened
   * the draft, so it knows; passing it lets the server skip a whole extra request per
   * save. Left undefined the server takes the safe path and re-reads the draft.
   */
  initialHasAttachments?: boolean;
  seed?: DraftSeed;
}) {
  const { token } = useAuth();

  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [status, setStatus] = useState<DraftStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs, not state: the timer and the save need the LATEST values without
  // re-arming on every keystroke, and `draftId` has to be readable synchronously
  // inside a save that may have started before React committed it.
  const draftIdRef = useRef<string | null>(initialDraftId);
  const snapshotRef = useRef(snapshot);
  const seedRef = useRef(seed);
  const savedKeyRef = useRef<string | null>(
    // A draft opened from the folder starts already-saved: its current text is
    // exactly what the provider holds, so nothing should be written until it is
    // edited.
    initialDraftId ? serialise(snapshot) : null,
  );
  const filesRef = useRef(files);
  const savedFileKeyRef = useRef<string | null>(
    initialDraftId ? fileSetKey(files) : null,
  );
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set once the draft has been sent or discarded: its id is gone from the mailbox,
  // and a late-firing timer must not resurrect it.
  const closedRef = useRef(false);
  // Assigned during render, below, once `flush` exists.
  const flushRef = useRef<() => void>(() => undefined);

  // `dirty` is read through a ref for the same reason as the snapshot: `save` must
  // not be re-created on every keystroke, or the debounce effect below re-arms its
  // timer forever and the draft is never written.
  const dirtyRef = useRef(dirty);

  snapshotRef.current = snapshot;
  seedRef.current = seed;
  dirtyRef.current = dirty;
  filesRef.current = files;

  const save = useCallback(async (): Promise<void> => {
    if (!token || !enabled || closedRef.current) return;
    if (savingRef.current) {
      // Someone will pick this up when the in-flight write lands.
      pendingRef.current = true;
      return;
    }
    const current = snapshotRef.current;
    const currentFiles = filesRef.current;
    const fileKey = fileSetKey(currentFiles);
    const filesChanged = fileKey !== savedFileKeyRef.current;
    const key = serialise(current) + '\u0000' + fileKey;
    const id = draftIdRef.current;
    if (
      !shouldWriteDraft({
        key,
        savedKey: savedKeyRef.current,
        hasDraft: !!id,
        dirty: dirtyRef.current,
      })
    ) {
      return;
    }

    savingRef.current = true;
    setStatus('saving');
    setError(null);
    try {
      const payload: DraftPayload = {
        to: current.to,
        cc: current.cc,
        bcc: current.bcc,
        subject: current.subject,
        body: current.body,
        bodyHtml: current.bodyHtml,
        // Only meaningful on a text-only UPDATE, and only when we actually know.
        // 'false' lets the server skip re-reading the draft to protect attachments
        // that do not exist — a whole extra round trip per save on Gmail.
        // ⚠️ All three conditions matter. A reopened draft's attachments arrive
        // asynchronously (they are downloaded back into Files), so `currentFiles` is
        // briefly EMPTY for a draft that definitely has some — claiming 'false' in
        // that window would tell the server to stop protecting them, and Gmail's
        // whole-message update would then delete them. `initialHasAttachments` is
        // what remembers the draft had attachments before we had fetched them.
        ...(id &&
        !filesChanged &&
        currentFiles.length === 0 &&
        initialHasAttachments === false
          ? { hasAttachments: 'false' as const }
          : {}),
        ...(id ? {} : seedRef.current),
      };
      // Files ride along ONLY when the set changed. Undefined means "leave the
      // draft's attachments alone", which is every ordinary keystroke save.
      const outgoing = filesChanged ? currentFiles : undefined;
      const ref = id
        ? await updateDraft(token, companyId, id, payload, outgoing)
        : await createDraft(
            token,
            companyId,
            payload,
            currentFiles.length > 0 ? currentFiles : undefined,
          );

      // The window may have been sent or discarded while this was in flight. Its
      // draft is already gone from the mailbox, so adopting the id now would leave
      // the UI pointing at nothing.
      if (closedRef.current) return;

      draftIdRef.current = ref.draftId;
      setDraftId(ref.draftId);
      savedKeyRef.current = key;
      savedFileKeyRef.current = fileKey;
      setStatus('saved');
      setLastSavedAt(Date.now());
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : "Couldn't save the draft.");
    } finally {
      savingRef.current = false;
      if (pendingRef.current && !closedRef.current) {
        pendingRef.current = false;
        void save();
      }
    }
  }, [companyId, enabled, initialHasAttachments, token]);

  // Attachments are part of "has this draft changed" — removing the last file with
  // no other edit still has to be saved.
  const key = serialise(snapshot) + '\u0000' + fileSetKey(files);
  useEffect(() => {
    if (!enabled || closedRef.current) return;
    if (
      !shouldWriteDraft({
        key,
        savedKey: savedKeyRef.current,
        hasDraft: !!draftIdRef.current,
        dirty,
      })
    ) {
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      () => void save(),
      files.length > 0 ? DEBOUNCE_WITH_FILES_MS : DEBOUNCE_MS,
    );
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [key, dirty, enabled, files.length, save]);

  /** Write now — on close, on minimize, on unmount, before the tab goes away. */
  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await save();
  }, [save]);

  // Kept in a ref so the unmount effect above can stay `[]` — depending on `flush`
  // would re-run its cleanup on every render, flushing constantly.
  flushRef.current = () => void flush();

  // Unmounting is the OTHER way a draft used to be lost, and the more common one:
  // an inline reply lives inside the thread view, so pressing Back destroyed it. The
  // request is fired without being awaited — React will not wait for us — which is
  // the same bargain as the pagehide handler below, and it is why the debounce is
  // short enough that there is rarely much in flight.
  useEffect(
    () => () => {
      flushRef.current();
    },
    [],
  );

  // A tab close or a reload is exactly the case this whole feature exists for, and
  // it is the one moment React will not give us an async window. `pagehide` fires
  // for both (and for bfcache), so it is the last honest chance to write.
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [enabled, flush]);

  /** Delete the draft from the mailbox — the composer was discarded. */
  const discard = useCallback(async () => {
    closedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    const id = draftIdRef.current;
    if (!id || !token) return;
    try {
      await deleteDraft(token, companyId, id);
    } catch {
      // The draft stays in the user's Drafts folder. Untidy; never harmful, and
      // never worth blocking the window from closing.
    }
    draftIdRef.current = null;
    setDraftId(null);
  }, [companyId, token]);

  /**
   * The draft became a sent message. Stop touching it — the id may now resolve to a
   * message in Sent Items, where a delete would destroy mail that actually went out.
   */
  const markSent = useCallback(() => {
    closedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    draftIdRef.current = null;
  }, []);

  return { draftId, status, lastSavedAt, error, flush, discard, markSent };
}
