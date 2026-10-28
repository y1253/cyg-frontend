import { fetchWithAuth } from './client';

/**
 * step12: a company's AI agents. Each one lives on the agents server
 * (agents.cygfinance.com) and reads this company with its own token; staff see the list
 * here and management creates / deletes them. Server: `agents` module.
 */
export interface Agent {
  id: number;
  companyId: number;
  /** The agents server's id; null only while it is being registered. */
  remoteAgentId: number | null;
  name: string;
  createdAt: string;
  createdBy: { id: number; name: string } | null;
}

const base = (companyId: number) => `/api/companies/${companyId}/agents`;

async function failed(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  throw new Error(msg || fallback);
}

export async function fetchAgents(token: string, companyId: number): Promise<Agent[]> {
  const res = await fetchWithAuth(token, base(companyId));
  if (!res.ok) return failed(res, 'Failed to load the agents');
  return res.json() as Promise<Agent[]>;
}

export async function createAgent(
  token: string,
  companyId: number,
  name: string,
): Promise<Agent> {
  const res = await fetchWithAuth(token, base(companyId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) return failed(res, 'Failed to create the agent');
  return res.json() as Promise<Agent>;
}

export async function deleteAgent(
  token: string,
  companyId: number,
  id: number,
): Promise<void> {
  const res = await fetchWithAuth(token, `${base(companyId)}/${id}`, { method: 'DELETE' });
  if (!res.ok) return failed(res, 'Failed to delete the agent');
}
