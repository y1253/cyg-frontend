import { useState } from 'react';
import { CalendarIcon, SlidersHorizontal, X } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  EMPTY_FILTERS,
  activeFilterCount,
  type SearchFilters,
} from './search-filters';

// base-ui's Select renders the raw value in the trigger unless it is given an
// `items` label map — see the note in ./types.ts.
const SIZE_OPS = { gt: 'greater than', lt: 'less than' };
const SIZE_UNITS = { MB: 'MB', KB: 'KB', B: 'bytes' };
const WITHINS = {
  '': 'any time',
  '1d': '1 day',
  '3d': '3 days',
  '1w': '1 week',
  '2w': '2 weeks',
  '1m': '1 month',
  '2m': '2 months',
  '6m': '6 months',
  '1y': '1 year',
};
const SCOPES = {
  all: 'All Mail',
  inbox: 'Inbox',
  sent: 'Sent Mail',
  spam: 'Spam',
  trash: 'Trash',
};

/** One labelled row: caption on the left, control on the right, as Gmail lays it out. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-3">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Dropdown<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: Record<string, string>;
  className?: string;
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(v) => onChange(((v as T) ?? value) as T)}
    >
      <SelectTrigger size="sm" className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(items).map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Gmail's advanced-search panel, opened from a tuner icon beside the search box.
 *
 * The fields are held as a draft while the popover is open and only committed on
 * Search, so a half-filled form never triggers a query. `variant="internal"` drops
 * the two fields that have no meaning for staff messaging: Size (we don't store
 * one) and the mail-folder scope.
 */
export function AdvancedSearchPanel({
  filters,
  onApply,
  variant = 'email',
  relevanceOrderWarning = false,
}: {
  filters: SearchFilters;
  onApply: (next: SearchFilters) => void;
  variant?: 'email' | 'internal';
  /** Outlook returns searched mail relevance-ordered — Graph forbids $orderby with $search. */
  relevanceOrderWarning?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SearchFilters>(filters);
  const count = activeFilterCount(filters);
  const isEmail = variant === 'email';

  const set = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const apply = (next: SearchFilters) => {
    onApply(next);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Re-seed from the committed filters each time it opens, so an abandoned
        // draft doesn't reappear later looking like it was applied.
        if (next) setDraft(filters);
        setOpen(next);
      }}
    >
      {/* Rendered as the trigger itself rather than wrapping a Button: base-ui's
          Trigger IS the button, and nesting one inside it is invalid HTML. */}
      <PopoverTrigger
        title="Advanced search"
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium shadow-xs transition-colors ${
          count > 0
            ? 'border-teal-600 bg-teal-600 text-white hover:bg-teal-700'
            : 'border-input bg-background hover:bg-accent hover:text-accent-foreground'
        }`}
      >
        <SlidersHorizontal size={14} />
        {count > 0 ? count : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[30rem] max-w-[calc(100vw-2rem)] p-4">
        <div className="flex flex-col gap-3">
          <Row label="From">
            <Input
              value={draft.from}
              onChange={(e) => set('from', e.target.value)}
              placeholder="name or address"
            />
          </Row>
          <Row label="To">
            <Input
              value={draft.to}
              onChange={(e) => set('to', e.target.value)}
              placeholder="name or address"
            />
          </Row>
          <Row label="Subject">
            <Input value={draft.subject} onChange={(e) => set('subject', e.target.value)} />
          </Row>
          <Row label="Has the words">
            <Input value={draft.words} onChange={(e) => set('words', e.target.value)} />
          </Row>
          <Row label="Doesn't have">
            <Input value={draft.notWords} onChange={(e) => set('notWords', e.target.value)} />
          </Row>

          {isEmail && (
            <Row label="Size">
              <div className="flex items-center gap-2">
                <Dropdown
                  value={draft.sizeOp}
                  onChange={(v) => set('sizeOp', v)}
                  items={SIZE_OPS}
                  className="w-[8.5rem]"
                />
                <Input
                  value={draft.sizeValue}
                  onChange={(e) => set('sizeValue', e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal"
                  className="flex-1"
                />
                <Dropdown
                  value={draft.sizeUnit}
                  onChange={(v) => set('sizeUnit', v)}
                  items={SIZE_UNITS}
                  className="w-[5.5rem]"
                />
              </div>
            </Row>
          )}

          <Row label="Date within">
            <div className="flex items-center gap-2">
              <Dropdown
                value={draft.within}
                onChange={(v) => set('within', v)}
                items={WITHINS}
                className="w-[8.5rem]"
              />
              {/* Same Popover+Calendar pattern as the schedule start-date picker. */}
              <Popover>
                <PopoverTrigger
                  disabled={!draft.within}
                  className="inline-flex h-8 flex-1 items-center justify-start gap-1.5 rounded-md border border-input bg-background px-2 text-sm font-normal shadow-xs hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  <CalendarIcon size={14} />
                  {draft.anchor
                    ? format(new Date(`${draft.anchor}T00:00:00`), 'MMM d, yyyy')
                    : 'today'}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={draft.anchor ? new Date(`${draft.anchor}T00:00:00`) : undefined}
                    onSelect={(date) => set('anchor', date ? format(date, 'yyyy-MM-dd') : '')}
                  />
                </PopoverContent>
              </Popover>
              {draft.anchor && (
                <button
                  type="button"
                  title="Clear date"
                  onClick={() => set('anchor', '')}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </Row>

          {isEmail && (
            <Row label="Search">
              <Dropdown value={draft.scope} onChange={(v) => set('scope', v)} items={SCOPES} />
            </Row>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Checkbox
                checked={draft.hasAttachment}
                onCheckedChange={(c) => set('hasAttachment', c === true)}
              />
              Has attachment
            </label>
            {isEmail && (
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <Checkbox
                  checked={draft.excludeChats}
                  onCheckedChange={(c) => set('excludeChats', c === true)}
                />
                Don't include chats
              </label>
            )}
          </div>

          {relevanceOrderWarning && (
            <p className="text-xs text-muted-foreground">
              Outlook returns search results by relevance rather than newest first.
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(EMPTY_FILTERS);
                apply(EMPTY_FILTERS);
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-teal-600 text-white hover:bg-teal-700"
              onClick={() => apply(draft)}
            >
              Search
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
