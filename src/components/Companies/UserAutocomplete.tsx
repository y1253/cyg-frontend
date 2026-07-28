import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DirectoryUser } from '@/api/internalMessages';

interface UserAutocompleteProps {
  /** Committed recipients, as user ids. */
  value: number[];
  onChange: (value: number[]) => void;
  users: DirectoryUser[];
  placeholder?: string;
}

const MAX_RESULTS = 8;

/**
 * Recipient input for internal messaging: you type a colleague's NAME, not an
 * address. Structurally the same chip/pill control as RecipientAutocomplete, with
 * one deliberate difference — there is no free-text fallback. A recipient must be
 * a real directory pick, so `value` is user ids and a typo can never become a
 * silently-undeliverable address.
 */
export function UserAutocomplete({
  value,
  onChange,
  users,
  placeholder,
}: UserAutocompleteProps) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(
    () => new Map(users.map((u) => [u.id, u])),
    [users],
  );

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    const already = new Set(value);
    const pool = users.filter((u) => !already.has(u.id));
    // With no query, show the first few so clicking the field is enough to browse
    // the roster — the staff list is small, unlike an email contact book.
    if (!q) return pool.slice(0, MAX_RESULTS);
    return pool
      .filter(
        (u) =>
          u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      )
      .slice(0, MAX_RESULTS);
  }, [users, input, value]);

  // Keep the highlight in range as the list changes (deriving avoids setState-in-effect).
  const safeHighlight = highlight < suggestions.length ? highlight : 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const addUser = (user: DirectoryUser) => {
    if (!value.includes(user.id)) onChange([...value, user.id]);
    setInput('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const removeUser = (id: number) => onChange(value.filter((v) => v !== id));

  const showDropdown = open && suggestions.length > 0;

  return (
    <div ref={wrapRef} className="relative">
      <div
        className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((id) => {
          const user = byId.get(id);
          const label = user?.name ?? `User ${id}`;
          return (
            <span
              key={id}
              title={user?.email}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-900"
            >
              <span className="truncate">{label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeUser(id);
                }}
                aria-label={`Remove ${label}`}
                className="shrink-0 rounded-full p-0.5 text-teal-700 hover:text-teal-950"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          value={input}
          placeholder={value.length === 0 ? placeholder : ''}
          className="min-w-[8rem] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (showDropdown && e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((safeHighlight + 1) % suggestions.length);
              return;
            }
            if (showDropdown && e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight(
                (safeHighlight - 1 + suggestions.length) % suggestions.length,
              );
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault(); // never submit/send from this field
              if (showDropdown) addUser(suggestions[safeHighlight]);
              return;
            }
            if (e.key === 'Escape') {
              setOpen(false);
              return;
            }
            if (e.key === 'Backspace' && input.length === 0 && value.length > 0) {
              e.preventDefault();
              removeUser(value[value.length - 1]);
            }
          }}
        />
      </div>
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-md border bg-background shadow-md">
          {suggestions.map((u, i) => (
            <button
              key={u.id}
              type="button"
              // onMouseDown (not onClick) so it fires before the input blurs.
              onMouseDown={(e) => {
                e.preventDefault();
                addUser(u);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                'flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-sm',
                i === safeHighlight ? 'bg-muted' : 'hover:bg-muted/60',
              )}
            >
              <span className="font-medium leading-tight">{u.name}</span>
              <span className="text-xs text-muted-foreground leading-tight">
                {u.email}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
