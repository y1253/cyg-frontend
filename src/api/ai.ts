import { fetchWithAuth } from './client';

const API = '/api';

/** Mirrors `POLISH_KINDS` in the server's `polish-reply.dto.ts`. */
export type PolishKind = 'email' | 'chat' | 'sms' | 'whatsapp';

export interface PolishReplyPayload {
  kind: PolishKind;
  // The user's rough draft (plain text).
  draft: string;
  // The whole email / whole conversation, assembled by the caller.
  context: string;
  /**
   * Ask for a reply under this many characters. Omitted unless the user ticked the
   * "keep it short" toggle — see `PolishBudget`.
   *
   * ⚠️ ADVISORY. The server puts it in the prompt and does not truncate, so the model can
   * overshoot. `PolishPanel` re-checks the preview against the same budget.
   */
  maxChars?: number;
}

// Ask the AI to polish a draft reply. Returns the polished plain text.
export async function polishReply(
  token: string,
  payload: PolishReplyPayload,
): Promise<{ polished: string }> {
  const res = await fetchWithAuth(token, `${API}/ai/polish-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to polish reply');
  }
  return res.json() as Promise<{ polished: string }>;
}

export interface AiConfig {
  /** Dictation, translation and document summaries. */
  assist: boolean;
  /** Transcribing voice notes a client sent us — its own switch. */
  transcribeInbound: boolean;
}

/**
 * What the server has switched on.
 *
 * ⚠️ The UI HIDES what is off rather than letting the button 403. That is the lesson from
 * voicemail, which shipped inert with no way to turn it on: a control that fails when
 * pressed is worse than one that is absent, because the user cannot tell a broken feature
 * from one the firm has chosen not to pay for.
 */
export async function fetchAiConfig(token: string): Promise<AiConfig> {
  const res = await fetchWithAuth(token, `${API}/ai/config`);
  if (!res.ok) throw new Error('Could not read the AI settings');
  return res.json() as Promise<AiConfig>;
}

/** The user's own voice, as text. */
export async function transcribeDictation(
  token: string,
  recording: Blob,
  filename: string,
): Promise<{ text: string }> {
  const form = new FormData();
  form.append('file', recording, filename);
  // No Content-Type header: the browser sets the multipart boundary itself.
  const res = await fetchWithAuth(token, `${API}/ai/transcribe`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Could not transcribe that recording');
  }
  return res.json() as Promise<{ text: string }>;
}

/** One received message, in English. */
export async function translateToEnglish(
  token: string,
  text: string,
): Promise<{ translated: string }> {
  const res = await fetchWithAuth(token, `${API}/ai/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Could not translate this message');
  }
  return res.json() as Promise<{ translated: string }>;
}

/** Summarise one email attachment. */
export async function summarizeEmailAttachment(
  token: string,
  companyId: number,
  messageId: string,
  attachmentId: string,
  file: { filename: string; size: number },
): Promise<{ summary: string }> {
  const qs = new URLSearchParams({
    filename: file.filename,
    size: String(file.size),
  });
  const res = await fetchWithAuth(
    token,
    `${API}/communications/companies/${companyId}/emails/${encodeURIComponent(
      messageId,
    )}/attachments/${encodeURIComponent(attachmentId)}/summarize?${qs}`,
    { method: 'POST' },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Could not summarise that attachment');
  }
  return res.json() as Promise<{ summary: string }>;
}
