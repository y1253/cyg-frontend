import { fetchWithAuth } from './client';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** One block of the AI's instructions (step12, `AiInstruction`). */
export interface AiInstruction {
  id: number;
  key: string;
  /** ASSISTANT | ATTACHMENT_READER | MATCHER | STATEMENT_READER | PRODUCT_CATEGORIZER | BANK_FEED_CATEGORIZER */
  target: string;
  title: string;
  text: string;
  /** The strong AI's own prompt (only staff change it). */
  isStrong: boolean;
  /** Only staff change it (the strong AI may not). */
  locked: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface AiInstructionChange {
  id: number;
  instructionId: number;
  key: string;
  title: string;
  /** CREATE | UPDATE | DELETE | REVERT */
  action: string;
  beforeText: string | null;
  afterText: string | null;
  reason: string | null;
  /** STRONG_AI | STAFF | SEED */
  by: string;
  staffUser: { id: number; name: string } | null;
  escalationId: number | null;
  revertedAt: string | null;
  createdAt: string;
}

export type EscalationVerdict = 'RUNNING' | 'FIXED' | 'NOT_AN_ISSUE' | 'UNSURE' | 'FAILED';

/** A customer's complaint the regular AI handed to the strong AI. */
export interface AiEscalation {
  id: number;
  customer: { id: number; name: string; email: string | null } | null;
  companyName: string | null;
  channel: string;
  complaint: string;
  verdict: EscalationVerdict;
  summary: string | null;
  redo: string | null;
  model: string;
  durationMs: number | null;
  createdAt: string;
  changes: number;
}

async function failure(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  return new Error(message ?? fallback);
}

export async function fetchAiInstructions(token: string): Promise<AiInstruction[]> {
  const res = await fetchWithAuth(token, '/api/ai-instructions', { headers: JSON_HEADERS });
  if (!res.ok) throw await failure(res, 'Failed to load the AI instructions');
  return res.json() as Promise<AiInstruction[]>;
}

export async function updateAiInstruction(
  token: string,
  id: number,
  data: { text: string; reason?: string },
): Promise<AiInstruction> {
  const res = await fetchWithAuth(token, `/api/ai-instructions/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await failure(res, 'Failed to save the instruction');
  return res.json() as Promise<AiInstruction>;
}

export async function fetchAiInstructionChanges(token: string): Promise<AiInstructionChange[]> {
  const res = await fetchWithAuth(token, '/api/ai-instructions/changes', { headers: JSON_HEADERS });
  if (!res.ok) throw await failure(res, 'Failed to load the changes');
  return res.json() as Promise<AiInstructionChange[]>;
}

export async function revertAiInstructionChange(token: string, changeId: number): Promise<void> {
  const res = await fetchWithAuth(token, `/api/ai-instructions/changes/${changeId}/revert`, {
    method: 'POST',
    headers: JSON_HEADERS,
  });
  if (!res.ok) throw await failure(res, 'Failed to revert the change');
}

export async function fetchAiEscalations(token: string): Promise<AiEscalation[]> {
  const res = await fetchWithAuth(token, '/api/ai-instructions/escalations', { headers: JSON_HEADERS });
  if (!res.ok) throw await failure(res, 'Failed to load the checked problems');
  return res.json() as Promise<AiEscalation[]>;
}
