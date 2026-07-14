import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchInput } from '@/components/ui/SearchInput';
import type { StatusFilter } from './types';

export function DashboardToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  isAdmin,
  showCount,
  filteredCount,
  totalCount,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
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
          value={statusFilter}
          onValueChange={v => onStatusFilterChange((v ?? 'all') as StatusFilter)}
        >
          <SelectTrigger className="w-28 h-8 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="overdue25">Overdue 25d</SelectItem>
            <SelectItem value="important">Important</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
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
