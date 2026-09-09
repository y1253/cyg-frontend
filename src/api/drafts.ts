import { fetchWithAuth } from './client';
import { base, type EmailAttachment } from './gmail';

/**
 * Provider-backed drafts.
 *
 * A draft lives in the connected mailbox's own Drafts folder — Gmail or Outlook —
 * not in the browser. That is what makes it survive a reload, show up in the user's
 * real mail client, and carry attachments at all (a `File` cannot be serialised, so
 * the old in-memory composer could never have restored one).
 *
 * Listing is deliberately NOT here: the Drafts folder is `fetchEmails(..., 'DRAFT')`,
 * so it reuses the whole existing list, paging and search path.
 */

/** What a draft write hands back. */
export interface DraftRef {
  /**
   * ⚠️ The ONLY id to hold onto. Gmail gives a draft two — the draft resource and
   * the message inside it — and every write is keyed by this one. Storing the
   * message id instead makes the next autosave 404.
   */
  draftId: string;
  messageId: string | null;
  threadId: string | null;
}

/** A draft opened back into the composer. */
export interface DraftDetail extends DraftRef {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  inReplyTo: string;
  references: string;
  attachments: EmailAttachment[];
}

/** The fields a save carries. Everything is optional — a draft is written seconds
 *  after the user starts typing, long before there is a recipient or a subject. */
export interface DraftPayload {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  bodyHtml?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  forwardedFrom?: string;
  forwardScope?: 'message' | 'thread';
  /** Graph only, and only on the FIRST save of a reply/forward: names the message to
   *  run createReply/createForward against, which is the only way Graph will set
   *  In-Reply-To and References. */
  replyToMessageId?: string;
  draftKind?: 'reply' | 'forward';
  /**
   * 'false' = this draft has no attachments, so the server can skip re-reading it to
   * protect them. That read is a whole extra Gmail request per autosave, on mailboxes
   * already near the per-user rate limit. Omit it when unsure — absent means the safe
   * path, and a wrong 'false' would delete the user's files.
   */
  hasAttachments?: 'true' | 'false';
  /**
   * 'true' = the file parts in this request are the draft's complete new attachment
   * set. Without it an empty file list is indistinguishable from a text-only save,
   * and guessing either way silently loses something.
   */
  setAttachments?: 'true' | 'false';
}

export async function createDraft(
  token: string,
  companyId: number,
  payload: DraftPayload,
  files?: File[],
): Promise<DraftRef> {
  // multipart because the route also accepts attachments; a text-only save just
  // carries no files. One route means one code path on the server.
  const form = draftForm(payload);
  for (const f of files ?? []) form.append('attachments', f);
  const res = await fetch(
    `${base(companyId)}/companies/${companyId}/drafts`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
  );
  if (!res.ok) throw new Error(await draftError(res, 'save'));
  return res.json() as Promise<DraftRef>;
}

/**
 * Save a draft.
 *
 * `files` undefined is a text-only save and leaves the draft's attachments alone —
 * the common case, and the cheap one. Passing an array (even an empty one) declares
 * the complete new set, which re-uploads every file in it, so callers only do that
 * when the set has actually changed.
 */
export async function updateDraft(
  token: string,
  companyId: number,
  draftId: string,
  payload: DraftPayload,
  files?: File[],
): Promise<DraftRef> {
  const url = `${base(companyId)}/companies/${companyId}/drafts/${encodeURIComponent(draftId)}`;
  if (!files) {
    const res = await fetchWithAuth(token, url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await draftError(res, 'save'));
    return res.json() as Promise<DraftRef>;
  }
  const form = draftForm({ ...payload, setAttachments: 'true' });
  for (const f of files) form.append('attachments', f);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(await draftError(res, 'save'));
  return res.json() as Promise<DraftRef>;
}

/** Scalar fields as multipart parts. Skips absent ones so "unset" stays unset. */
function draftForm(payload: DraftPayload): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null) form.append(key, String(value));
  }
  return form;
}

export async function fetchDraft(
  token: string,
  companyId: number,
  draftId: string,
): Promise<DraftDetail> {
  const res = await fetchWithAuth(
    token,
    `${base(companyId)}/companies/${companyId}/drafts/${encodeURIComponent(draftId)}`,
  );
  if (!res.ok) throw new Error(await draftError(res, 'open'));
  return res.json() as Promise<DraftDetail>;
}

export async function deleteDraft(
  token: string,
  companyId: number,
  draftId: string,
): Promise<void> {
  const res = await fetchWithAuth(
    token,
    `${base(companyId)}/companies/${companyId}/drafts/${encodeURIComponent(draftId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(await draftError(res, 'discard'));
}

/**
 * Send a draft as the draft.
 *
 * Never rebuild and send the body separately: the provider would keep the original,
 * so the user sees their message twice and has to delete one by hand. It is also the
 * only way an Outlook reply keeps its In-Reply-To/References, which Graph sets on the
 * draft and will not let anyone set on a plain send.
 */
export async function sendDraft(
  token: string,
  companyId: number,
  draftId: string,
): Promise<void> {
  const res = await fetchWithAuth(
    token,
    `${base(companyId)}/companies/${companyId}/drafts/${encodeURIComponent(draftId)}/send`,
    { method: 'POST' },
  );
  if (!res.ok) throw new Error(await draftError(res, 'send'));
}

/** The server's own wording where it has any — it is written for the user. */
async function draftError(res: Response, verb: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message[0] : body.message;
    if (msg) return msg;
  } catch {
    // Non-JSON (a proxy 502, an nginx 413). Fall through to the generic line.
  }
  return `Couldn't ${verb} the draft. Please try again.`;
}
