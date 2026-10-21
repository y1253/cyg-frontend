import { fetchWithAuth } from './client';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export type AiRuleStatus = 'PENDING' | 'ACTIVE' | 'REJECTED';

/** A firm-wide rule the customer site's AI assistant proposed (step11). */
export interface AiRule {
  id: number;
  text: string;
  /** MATCHING | CATEGORY | NAMING | GENERAL */
  topic: string;
  status: AiRuleStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: { id: number; name: string } | null;
  sourceCustomer: { id: number; name: string; email: string } | null;
}

export type AiChannel = 'BOT' | 'SMS' | 'WHATSAPP' | 'EMAIL' | 'VOICE';

export interface AiAction {
  tool?: string;
  ok?: boolean;
  summary?: string;
}

/** `GET /customers/:id/ai` — one customer's private rules and their messages with the assistant. */
export interface CustomerAi {
  rules: Array<{
    id: number;
    text: string;
    topic: string;
    companyId: number | null;
    companyName: string | null;
    createdAt: string;
  }>;
  messages: Array<{
    id: number;
    conversationId: number;
    channel: AiChannel;
    role: 'USER' | 'ASSISTANT';
    text: string;
    warning: string | null;
    actions: AiAction[] | null;
    companyId: number | null;
    companyName: string | null;
    createdAt: string;
  }>;
}

async function failure(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  return new Error(message ?? fallback);
}

export async function fetchAiRules(token: string, status?: AiRuleStatus): Promise<AiRule[]> {
  const res = await fetchWithAuth(token, `/api/ai-rules${status ? `?status=${status}` : ''}`, {
    headers: JSON_HEADERS,
  });
  if (!res.ok) throw await failure(res, 'Failed to load the AI rules');
  return res.json() as Promise<AiRule[]>;
}

export async function fetchAiRulePendingCount(token: string): Promise<number> {
  const res = await fetchWithAuth(token, '/api/ai-rules/pending-count', { headers: JSON_HEADERS });
  if (!res.ok) throw await failure(res, 'Failed to count the AI rules');
  return ((await res.json()) as { count: number }).count;
}

export async function updateAiRule(
  token: string,
  id: number,
  data: { text?: string; status?: 'ACTIVE' | 'REJECTED' },
): Promise<AiRule> {
  const res = await fetchWithAuth(token, `/api/ai-rules/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await failure(res, 'Failed to save the rule');
  return res.json() as Promise<AiRule>;
}

export async function deleteAiRule(token: string, id: number): Promise<void> {
  const res = await fetchWithAuth(token, `/api/ai-rules/${id}`, { method: 'DELETE', headers: JSON_HEADERS });
  if (!res.ok) throw await failure(res, 'Failed to delete the rule');
}

export async function fetchCustomerAi(token: string, customerId: number): Promise<CustomerAi> {
  const res = await fetchWithAuth(token, `/api/customers/${customerId}/ai`, { headers: JSON_HEADERS });
  if (!res.ok) throw await failure(res, 'Failed to load the AI assistant history');
  return res.json() as Promise<CustomerAi>;
}

export async function deleteCustomerAiRule(token: string, customerId: number, ruleId: number): Promise<void> {
  const res = await fetchWithAuth(token, `/api/customers/${customerId}/ai-rules/${ruleId}`, {
    method: 'DELETE',
    headers: JSON_HEADERS,
  });
  if (!res.ok) throw await failure(res, 'Failed to delete the rule');
}
