import { fetchWithAuth } from './client';

const API = '/api';

/**
 * A customer's own bookkeeping rules for ONE company (how cygfinance.com files its rows),
 * shown on the company's "Rules" tab. Every staff user who can open the company sees
 * them; only ADMIN / MANAGER change them. Server: `customer-rules` module, a proxy to the
 * customer API, which re-files the customer's existing rows when a rule changes.
 */
export type RuleMatchType = 'NAME' | 'DESCRIPTION';

export interface CustomerNameRule {
  id: number;
  matchType: RuleMatchType;
  /** The payee (NAME) or the description key (DESCRIPTION) the rule matches. */
  matchKey: string;
  /** A real bank description it matches — the key alone has its digits stripped. */
  example: string | null;
  /** The name it gives; null = leaves the name as it is. */
  name: string | null;
  /** Its own category; null = leaves it (or, with a name, the name's category). */
  category: string | null;
  /** Where the rows end up: its own category, else the name's. */
  effectiveCategory: string | null;
  /** Ledger rows it covers now. */
  rows: number;
  updatedAt: string;
}

export interface CustomerItemRule {
  id: number;
  itemKey: string;
  category: string;
  updatedAt: string;
}

export interface CustomerCategory {
  name: string;
  /** INCOME | EXPENSE | ASSET | LIABILITY | EQUITY */
  type: string;
  custom: boolean;
}

export interface CustomerRulesView {
  noCustomer: boolean;
  descriptions: CustomerNameRule[];
  names: CustomerNameRule[];
  items: CustomerItemRule[];
  categories: CustomerCategory[];
}

const base = (companyId: number) => `${API}/companies/${companyId}/customer-rules`;

async function asView(res: Response, fallback: string): Promise<CustomerRulesView> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new Error(msg || fallback);
  }
  return res.json() as Promise<CustomerRulesView>;
}

export async function fetchCustomerRules(
  token: string,
  companyId: number,
): Promise<CustomerRulesView> {
  return asView(
    await fetchWithAuth(token, base(companyId)),
    'Failed to load the customer rules',
  );
}

function send(token: string, url: string, method: 'PUT' | 'DELETE', body: object) {
  return fetchWithAuth(token, url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function saveCustomerNameRule(
  token: string,
  companyId: number,
  rule: {
    matchType: RuleMatchType;
    matchKey: string;
    name: string | null;
    category: string | null;
  },
): Promise<CustomerRulesView> {
  return asView(
    await send(token, `${base(companyId)}/names`, 'PUT', rule),
    'Could not save the rule',
  );
}

export async function removeCustomerNameRule(
  token: string,
  companyId: number,
  rule: { matchType: RuleMatchType; matchKey: string },
): Promise<CustomerRulesView> {
  return asView(
    await send(token, `${base(companyId)}/names`, 'DELETE', rule),
    'Could not remove the rule',
  );
}

export async function saveCustomerItemRule(
  token: string,
  companyId: number,
  rule: { itemKey: string; category: string },
): Promise<CustomerRulesView> {
  return asView(
    await send(token, `${base(companyId)}/items`, 'PUT', rule),
    'Could not save the rule',
  );
}

export async function removeCustomerItemRule(
  token: string,
  companyId: number,
  rule: { itemKey: string },
): Promise<CustomerRulesView> {
  return asView(
    await send(token, `${base(companyId)}/items`, 'DELETE', rule),
    'Could not remove the rule',
  );
}
