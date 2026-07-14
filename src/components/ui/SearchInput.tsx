import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// Search box with a leading icon and an optional clear button. `className` passes through
// to the Input so each call site keeps its own height / text size.
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  iconSize = 14,
  clearable = true,
  title = 'Clear search',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  iconSize?: number;
  clearable?: boolean;
  title?: string;
}) {
  const showClear = clearable && value !== '';

  return (
    <div className="relative w-full">
      <Search
        size={iconSize}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
      />
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn('pl-8', clearable && 'pr-8', className)}
      />
      {showClear && (
        <button
          type="button"
          title={title}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => onChange('')}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
