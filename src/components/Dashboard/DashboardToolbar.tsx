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
    // Below `sm` the search takes its own full-width row and the two selects split the
    // next one; from `sm` up this collapses back to the single row it has always been.
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="w-full sm:max-w-xs">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder="Search companies or assignees…"
          className="h-11 text-sm sm:h-8 sm:text-[12px]"
          iconSize={13}
          clearable={false}
        />
      </div>
      <div className="flex items-center gap-2">
      {isAdmin && (
        <Select
          items={STATUS_LABELS}
          value={statusFilter}
          onValueChange={v => onStatusFilterChange((v ?? 'all') as StatusFilter)}
        >
          <SelectTrigger className="h-11 flex-1 text-sm sm:h-8 sm:w-28 sm:flex-none sm:text-[12px]">
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
          <SelectTrigger className="h-11 flex-1 text-sm sm:h-8 sm:w-36 sm:flex-none sm:text-[12px]">
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
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {filteredCount} of {totalCount}
          </span>
        )}
      </div>
    </div>
  );
}
