import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchInput } from '@/components/ui/SearchInput';
import { selectItems } from '@/lib/select-items';
import { STATUS_LABELS } from './types';
import type { AssigneeFilter, StatusFilter } from './types';
import type { AssignedUser } from '@/api/companies';

export function DashboardToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  assignees,
  assigneeFilter,
  onAssigneeFilterChange,
  isAdmin,
  showCount,
  filteredCount,
  totalCount,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  /** Users holding at least one company — the only ones worth offering. */
  assignees: AssignedUser[];
  assigneeFilter: AssigneeFilter;
  onAssigneeFilterChange: (value: AssigneeFilter) => void;
  isAdmin: boolean;
  showCount: boolean;
  filteredCount: number;
  totalCount: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="max-w-xs w-full">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder="Search companies or assignees…"
          className="h-8 text-[12px]"
          iconSize={13}
          clearable={false}
        />
      </div>
      {isAdmin && (
        <Select
          items={STATUS_LABELS}
          value={statusFilter}
          onValueChange={v => onStatusFilterChange((v ?? 'all') as StatusFilter)}
        >
          <SelectTrigger className="w-28 h-8 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {isAdmin && assignees.length > 0 && (
        <Select
          items={{ all: 'All users', ...selectItems(assignees, u => u.id, u => u.name) }}
          value={assigneeFilter === 'all' ? 'all' : String(assigneeFilter)}
          onValueChange={v =>
            onAssigneeFilterChange(!v || v === 'all' ? 'all' : Number(v))
          }
        >
          <SelectTrigger className="w-36 h-8 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {assignees.map(u => (
              <SelectItem key={u.id} value={String(u.id)}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {showCount && (
        <span className="text-[11px] text-muted-foreground">
          {filteredCount} of {totalCount}
        </span>
      )}
    </div>
  );
}
