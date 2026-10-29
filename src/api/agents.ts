import { fetchWithAuth } from './client';

/**
 * step12: a company's AI agents. Each one lives on the agents server
 * (agents.cygfinance.com) and works on this company with its own token. The company's
 * first agent brings its MANAGER, which hands every task and message to the right worker.
 * Server: `agents` module.
 */
export type AgentRole = 'MANAGER' | 'WORKER';
export type ApprovalMode = 'ASK_ALWAYS' | 'AUTONOMOUS' | 'ASK_SECURITY';

export const APPROVAL_MODES: { value: ApprovalMode; label: string; hint: string }[] = [
  {
    value: 'ASK_SECURITY',
    label: 'Ask only on security concerns',
    hint: 'Works on its own, but asks before logging in with a password, paying, deleting, or writing to someone new.',
  },
  {
    value: 'ASK_ALWAYS',
    label: 'Ask before any action',
    hint: 'Every send, completion or change on a website waits for your approval in its chat.',
  },
  {
    value: 'AUTONOMOUS',
    label: "Don't ask — just do it",
    hint: 'Works on its own. It still asks a question when it does not know what is right.',
  },
];

export function approvalModeLabel(mode: ApprovalMode): string {
  return APPROVAL_MODES.find((m) => m.value === mode)?.label ?? mode;
}

export interface Agent {
  id: number;
  companyId: number;
  /** The agents server's id; null only while it is being registered. */
  remoteAgentId: number | null;
  name: string;
  role: AgentRole;
  description: string | null;
  approvalMode: ApprovalMode;
  /** Open todos this agent is on. */
  openTodos: number;
  createdAt: string;
  createdBy: { id: number; name: string } | null;
}

export interface AgentInput {
  name: string;
  description?: string;
  approvalMode?: ApprovalMode;
}

export type AgentMessageKind =
  | 'MESSAGE'
  | 'QUESTION'
  | 'APPROVAL_REQUEST'
  | 'APPROVAL_ANSWER'
  | 'TASK_UPDATE';

export interface AgentMessage {
  id: number;
  agentId: number;
  direction: 'TO_AGENT' | 'FROM_AGENT';
  kind: AgentMessageKind;
  body: string;
  todoId: number | null;
  replyToId: number | null;
  approved: boolean | null;
  answeredAt: string | null;
  createdAt: string;
  userId: number | null;
  userName: string | null;
}

export interface AgentRule {
  id: number;
  text: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleCycle = 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface AgentSchedule {
  id: number;
  title: string;
  instruction: string;
  cycle: ScheduleCycle;
  timeOfDay: string;
  weekday: number | null;
  monthDay: number | null;
  runDate: string | null;
  timezone: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  enabled: boolean;
}

export interface AgentScheduleInput {
  title: string;
  instruction: string;
  cycle: ScheduleCycle;
  timeOfDay: string;
  weekday?: number;
  monthDay?: number;
  runDate?: string;
  enabled?: boolean;
}

export interface AgentRun {
  id: number;
  kind: 'CHAT' | 'TASK' | 'CHANNEL' | 'SCHEDULE';
  title: string;
  todoId: number | null;
  status: 'RUNNING' | 'WAITING' | 'DONE' | 'FAILED';
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRunDetail {
  id: number;
  kind: AgentRun['kind'];
  title: string;
  status: AgentRun['status'];
  messages: {
    role: 'user' | 'assistant' | 'tool';
    content: string | null;
    toolCalls?: { name: string; arguments: string }[];
  }[];
}

const base = (companyId: number) => `/api/companies/${companyId}/agents`;

async function failed(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
  throw new Error(msg || fallback);
}

async function send<T>(
  token: string,
  url: string,
  method: string,
  body: unknown,
  fallback: string,
): Promise<T> {
  const res = await fetchWithAuth(token, url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) return failed(res, fallback);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function get<T>(token: string, url: string, fallback: string): Promise<T> {
  const res = await fetchWithAuth(token, url);
  if (!res.ok) return failed(res, fallback);
  return res.json() as Promise<T>;
}

// ── Agents ──────────────────────────────────────────────────────────────────

export function fetchAgents(token: string, companyId: number): Promise<Agent[]> {
  return get(token, base(companyId), 'Failed to load the agents');
}

export function createAgent(
  token: string,
  companyId: number,
  input: AgentInput,
): Promise<Agent> {
  return send(token, base(companyId), 'POST', input, 'Failed to create the agent');
}

export function updateAgent(
  token: string,
  companyId: number,
  id: number,
  input: Partial<AgentInput>,
): Promise<Agent> {
  return send(token, `${base(companyId)}/${id}`, 'PATCH', input, 'Failed to save the agent');
}

export function deleteAgent(token: string, companyId: number, id: number): Promise<void> {
  return send(token, `${base(companyId)}/${id}`, 'DELETE', undefined, 'Failed to delete the agent');
}

// ── Chat ────────────────────────────────────────────────────────────────────

export function fetchAgentMessages(
  token: string,
  companyId: number,
  agentId: number,
): Promise<AgentMessage[]> {
  return get(token, `${base(companyId)}/${agentId}/messages`, 'Failed to load the chat');
}

export interface SendAgentMessageInput {
  body: string;
  kind?: 'MESSAGE' | 'APPROVAL_ANSWER';
  replyToId?: number;
  approved?: boolean;
}

export function sendAgentMessage(
  token: string,
  companyId: number,
  agentId: number,
  input: SendAgentMessageInput,
): Promise<AgentMessage> {
  return send(
    token,
    `${base(companyId)}/${agentId}/messages`,
    'POST',
    input,
    'Failed to send the message',
  );
}

// ── Rules (company-wide, or one agent's) ────────────────────────────────────

/** `agentId: null` = the company's rules (every agent of the company reads them). */
const rulesUrl = (companyId: number, agentId: number | null) =>
  agentId === null
    ? `/api/companies/${companyId}/agent-rules`
    : `${base(companyId)}/${agentId}/rules`;

export function fetchAgentRules(
  token: string,
  companyId: number,
  agentId: number | null,
): Promise<AgentRule[]> {
  return get(token, rulesUrl(companyId, agentId), 'Failed to load the rules');
}

export function addAgentRule(
  token: string,
  companyId: number,
  agentId: number | null,
  text: string,
): Promise<AgentRule> {
  return send(token, rulesUrl(companyId, agentId), 'POST', { text }, 'Failed to add the rule');
}

export function updateAgentRule(
  token: string,
  companyId: number,
  agentId: number | null,
  ruleId: number,
  text: string,
): Promise<AgentRule> {
  return send(
    token,
    `${rulesUrl(companyId, agentId)}/${ruleId}`,
    'PATCH',
    { text },
    'Failed to save the rule',
  );
}

export function deleteAgentRule(
  token: string,
  companyId: number,
  agentId: number | null,
  ruleId: number,
): Promise<void> {
  return send(
    token,
    `${rulesUrl(companyId, agentId)}/${ruleId}`,
    'DELETE',
    undefined,
    'Failed to delete the rule',
  );
}

// ── Schedules ───────────────────────────────────────────────────────────────

export function fetchAgentSchedules(
  token: string,
  companyId: number,
  agentId: number,
): Promise<AgentSchedule[]> {
  return get(token, `${base(companyId)}/${agentId}/schedules`, 'Failed to load the schedules');
}

export function addAgentSchedule(
  token: string,
  companyId: number,
  agentId: number,
  input: AgentScheduleInput,
): Promise<AgentSchedule> {
  return send(
    token,
    `${base(companyId)}/${agentId}/schedules`,
    'POST',
    input,
    'Failed to add the schedule',
  );
}

export function updateAgentSchedule(
  token: string,
  companyId: number,
  agentId: number,
  scheduleId: number,
  input: Partial<AgentScheduleInput>,
): Promise<AgentSchedule> {
  return send(
    token,
    `${base(companyId)}/${agentId}/schedules/${scheduleId}`,
    'PATCH',
    input,
    'Failed to save the schedule',
  );
}

export function deleteAgentSchedule(
  token: string,
  companyId: number,
  agentId: number,
  scheduleId: number,
): Promise<void> {
  return send(
    token,
    `${base(companyId)}/${agentId}/schedules/${scheduleId}`,
    'DELETE',
    undefined,
    'Failed to delete the schedule',
  );
}

// ── Work log ────────────────────────────────────────────────────────────────

export function fetchAgentActivity(
  token: string,
  companyId: number,
  agentId: number,
): Promise<AgentRun[]> {
  return get(token, `${base(companyId)}/${agentId}/activity`, 'Failed to load the work log');
}

export function fetchAgentRun(
  token: string,
  companyId: number,
  agentId: number,
  runId: number,
): Promise<AgentRunDetail> {
  return get(
    token,
    `${base(companyId)}/${agentId}/activity/${runId}`,
    'Failed to load the run',
  );
}
