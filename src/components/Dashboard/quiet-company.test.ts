import { describe, expect, it } from 'vitest';
import type { CompanySummary } from '@/api/companies';
import { isQuietCompany } from './quiet-company';

/** A company with nothing going on: no tasks, no tags, and someone owns it. */
function quiet(overrides: Partial<CompanySummary> = {}): CompanySummary {
  return {
    id: 1,
    businessName: 'Acme Ltd',
    supportNumber: null,
    country: 'Canada',
    status: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    isInternal: false,
    assignedUser: { id: 7, name: 'Dana', email: 'dana@cyg.com' },
    totalTodos: 0,
    urgentTodos: 0,
    overdueTodos: 0,
    importantTodos: 0,
    ...overrides,
  };
}

describe('isQuietCompany', () => {
  it('is quiet with a connected mailbox reporting zero', () => {
    expect(isQuietCompany(quiet(), 0, false)).toBe(true);
  });

  it('is quiet with no mailbox connected at all', () => {
    // undefined means the counts map omitted this company — no inbox, so
    // nothing in it. Deliberately treated the same as a real zero.
    expect(isQuietCompany(quiet(), undefined, false)).toBe(true);
  });

  it('is not quiet while anything is uncompleted', () => {
    expect(isQuietCompany(quiet(), 1, false)).toBe(false);
  });

  describe('any single tag keeps the row at full weight', () => {
    it('unassigned', () => {
      expect(isQuietCompany(quiet({ assignedUser: null }), 0, false)).toBe(
        false,
      );
    });

    it('has tasks due', () => {
      expect(isQuietCompany(quiet({ totalTodos: 1 }), 0, false)).toBe(false);
    });

    it('has a 25d-overdue tag', () => {
      expect(isQuietCompany(quiet({ urgentTodos: 1 }), 0, false)).toBe(false);
    });

    it('has an important tag', () => {
      expect(isQuietCompany(quiet({ importantTodos: 1 }), 0, false)).toBe(
        false,
      );
    });
  });

  it('never applies to the internal workspace, however empty', () => {
    // It keeps its teal treatment, and todo counts do not apply to it.
    expect(isQuietCompany(quiet({ isInternal: true }), 0, true)).toBe(false);
    expect(isQuietCompany(quiet(), undefined, true)).toBe(false);
  });

  it('ignores fields that are informational rather than tags', () => {
    // Country, support number and active/inactive status gate no badge, so they
    // must not affect the verdict either way.
    expect(
      isQuietCompany(
        quiet({ country: null, supportNumber: null, status: false }),
        0,
        false,
      ),
    ).toBe(true);
  });
});
