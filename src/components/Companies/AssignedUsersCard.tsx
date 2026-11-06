import { useMemo, useState } from 'react';
import { Loader2, UserPlus, Users, X } from 'lucide-react';
import type { AssignedUser } from '@/api/companies';
import { roleBadgeVariant, roleLabel, type AppUser } from '@/api/users';
import { useAssignCompany } from '@/hooks/useAssignCompany';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchInput } from '@/components/ui/SearchInput';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/**
 * Management card on the Details tab: every user assigned to the company, as chips
 * with a remove button, plus a searchable checklist to add more. Each change saves at
 * once. Every role is assignable — assignment is what routes inbound calls and fires
 * the new-message popups, not a permission grant.
 */
export function AssignedUsersCard({
  companyId,
  assigned,
  users,
}: {
  companyId: number;
  assigned: AssignedUser[];
  users: AppUser[];
}) {
  const assign = useAssignCompany();
  const [query, setQuery] = useState('');

  const roleOf = useMemo(() => new Map(users.map((u) => [u.id, u.role])), [users]);
  const assignedIds = useMemo(() => new Set(assigned.map((u) => u.id)), [assigned]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, query]);

  function save(next: AssignedUser[]) {
    assign.mutate({ companyId, users: next });
  }

  function toggle(u: AppUser) {
    save(
      assignedIds.has(u.id)
        ? assigned.filter((a) => a.id !== u.id)
        : [...assigned, { id: u.id, name: u.name, email: u.email }],
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Users size={15} className="text-teal-600" />
            Assigned users
            {assigned.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                {assigned.length}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {assign.isPending && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 size={12} className="animate-spin" /> Saving…
              </span>
            )}
            <Popover onOpenChange={(open) => !open && setQuery('')}>
              <PopoverTrigger className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground">
                <UserPlus size={14} />
                Add user
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-2">
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Search users…"
                  className="h-8 text-sm"
                />
                <div className="max-h-72 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                      No users match.
                    </p>
                  ) : (
                    filtered.map((u) => {
                      const checked = assignedIds.has(u.id);
                      return (
                        <label
                          key={u.id}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent ${
                            checked ? 'bg-teal-50/70' : ''
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggle(u)}
                            disabled={assign.isPending}
                          />
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#3BBFB4]/15 text-[11px] font-semibold text-teal-800">
                            {initials(u.name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{u.name}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {u.email}
                            </span>
                          </span>
                          <Badge variant={roleBadgeVariant(u.role)} className="h-5 shrink-0 px-1.5 text-[10px]">
                            {roleLabel(u.role)}
                          </Badge>
                        </label>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {assigned.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-orange-200 bg-orange-50/50 px-3 py-2.5 text-sm">
            <span className="font-medium text-orange-600">Unassigned</span>
            <span className="text-xs text-muted-foreground">
              — calls ring the admins until someone is added.
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {assigned.map((u) => {
              const role = roleOf.get(u.id);
              return (
                <div
                  key={u.id}
                  className="group flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50/60 py-1 pl-1 pr-1.5"
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-[#3BBFB4]/20 text-[11px] font-semibold text-teal-800">
                    {initials(u.name)}
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className="text-sm font-medium">{u.name}</span>
                    <span className="text-[11px] text-muted-foreground">{u.email}</span>
                  </span>
                  {role && (
                    <Badge variant={roleBadgeVariant(role)} className="h-5 px-1.5 text-[10px]">
                      {roleLabel(role)}
                    </Badge>
                  )}
                  <button
                    type="button"
                    title={`Remove ${u.name}`}
                    aria-label={`Remove ${u.name}`}
                    disabled={assign.isPending}
                    onClick={() => save(assigned.filter((a) => a.id !== u.id))}
                    className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red-100 hover:text-red-600 disabled:opacity-50"
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {assign.isError && (
          <p className="text-xs text-destructive">
            {assign.error instanceof Error ? assign.error.message : 'Could not save'}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          Every assigned user is rung on the company's calls and gets its new-message popups.
        </p>
      </CardContent>
    </Card>
  );
}
