import { fetchWithAuth } from './client';
import type { BankCell, BankColumn } from './bankTransactions';

/**
 * 2026-11-27: the customer site's Names-tab view for one company's book, for the Rules tab's
 * name editor (`GET /api/companies/:id/customer-rules/names-full`). Shapes mirror the
 * customer API's `NamesView`, `SubNameView`, `TaxSettingsView` and custom-column views.
 */
export type NameFieldKind = 'PHONE' | 'EMAIL' | 'ADDRESS' | 'WEBSITE' | 'NOTE' | 'TEXT';

export interface NameField {
  kind: NameFieldKind;
  label: string;
  value: string;
}

export interface NameDescription {
  key: string;
  description: string;
  category: string;
  rows: number;
  rule: {
    id: number;
    matchType: 'DESCRIPTION' | 'CONTAINS';
    matchKey: string;
    text: string;
    subName?: string;
  } | null;
  exceptions: Array<{ name: string; rows: number }>;
}

export interface NameContains {
  key: string;
  text: string;
  category: string | null;
  rows: number;
}

export interface FullName {
  name: string;
  category: string;
  rows: number;
  total: number;
  agencyIds: number[];
  agencyAlone: boolean;
  descriptions: NameDescription[];
  followsContains: NameContains[];
  group: string;
  ruleKey: string;
  unclarified?: true;
  fields: NameField[];
}

export interface FullSubName {
  id: number;
  parent: string;
  name: string;
  category: string;
  rows: number;
  total: number;
  group: string | null;
  fields: NameField[];
  renamed: boolean;
  ownAgencies: boolean;
  agencyIds: number[];
  agencyAlone: boolean;
}

export interface NameGroup {
  key: string;
  label: string;
  id?: number;
}

export interface SplitRule {
  id: number;
  name: string;
  rates: Array<{ kind: string; mode: 'PERCENT' | 'FIXED'; rate: number; amount: number | null }>;
  category: string | null;
  active: boolean;
  groupId: number | null;
}

export interface SplitGroup {
  id: number;
  name: string;
  active: boolean;
  agencyIds: number[];
}

export interface NameAnswer extends BankCell {
  columnId: number;
  name: string | null;
  subNameId: number | null;
}

export interface NamesFull {
  names: {
    names: FullName[];
    groups: NameGroup[];
    subDescriptions: Record<number, NameDescription[]>;
    subContains: Record<number, NameContains[]>;
  };
  subNames: FullSubName[];
  tax: { agencies: SplitRule[]; groups: SplitGroup[] };
  columns: BankColumn[];
  nameAnswers: NameAnswer[];
}

/** An error the customer API gave, with its HTTP status (409 = linked to another name). */
export class NamesApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const base = (companyId: number) => `/api/companies/${companyId}/customer-rules`;

async function call(token: string, url: string, init: RequestInit, fallback: string) {
  const res = await fetchWithAuth(token, url, init);
  const body = (await res.json().catch(() => null)) as
    | (NamesFull & { message?: string | string[] })
    | null;
  if (!res.ok) {
    const msg = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new NamesApiError(msg || fallback, res.status);
  }
  return body as NamesFull | null;
}

export function fetchNamesFull(token: string, companyId: number) {
  return call(token, `${base(companyId)}/names-full`, {}, 'Failed to load the names');
}

/** One name-editor change; the answer is the fresh view. */
export function editNames(
  token: string,
  companyId: number,
  method: 'PUT' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body: object,
) {
  return call(
    token,
    `${base(companyId)}${path}`,
    {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    'Could not save the change',
  );
}
