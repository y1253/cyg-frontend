import { fetchWithAuth } from './client';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export type FeatureStatus = 'OPEN' | 'PLANNED' | 'DONE' | 'DECLINED';
export const FEATURE_STATUSES: FeatureStatus[] = ['OPEN', 'PLANNED', 'DONE', 'DECLINED'];

/** step12e: something a customer asked the AI for that the app does not do yet. */
export interface FeatureRequest {
  id: number;
  customer: { id: number; name: string; email: string | null };
  bookName: string | null;
  conversationId: number | null;
  messageId: number | null;
  channel: string;
  request: string;
  summary: string;
  status: FeatureStatus;
  /** Shown to the customer. */
  staffNote: string | null;
  updatedBy: string | null;
  doneAt: string | null;
  /** The "it's available now" message was sent (by the customer API). */
  notifiedAt: string | null;
  notifyError: string | null;
  createdAt: string;
  updatedAt: string;
}

async function failure(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  return new Error(message ?? fallback);
}

export async function fetchFeatureRequests(token: string, status?: FeatureStatus): Promise<FeatureRequest[]> {
  const qs = status ? `?status=${status}` : '';
  const res = await fetchWithAuth(token, `/api/feature-requests${qs}`, { headers: JSON_HEADERS });
  if (!res.ok) throw await failure(res, 'Failed to load the feature requests');
  return res.json() as Promise<FeatureRequest[]>;
}

export async function fetchFeatureRequestOpenCount(token: string): Promise<number> {
  const res = await fetchWithAuth(token, '/api/feature-requests/open-count', { headers: JSON_HEADERS });
  if (!res.ok) throw await failure(res, 'Failed to load the count');
  return ((await res.json()) as { count: number }).count;
}

export async function updateFeatureRequest(
  token: string,
  id: number,
  data: { status?: FeatureStatus; staffNote?: string },
): Promise<FeatureRequest> {
  const res = await fetchWithAuth(token, `/api/feature-requests/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await failure(res, 'Failed to save the request');
  return res.json() as Promise<FeatureRequest>;
}
