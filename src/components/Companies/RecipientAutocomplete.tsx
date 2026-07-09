import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GmailContact } from '@/api/gmail';

interface RecipientAutocompleteProps {
  // Committed recipients, as an array of email addresses.
  value: string[];
  onChange: (value: string[]) => void;
  contacts: GmailContact[];
  placeholder?: string;
}

const MAX_RESULTS = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A Gmail-style recipient input: committed addresses render as chips (pills) and a
// bare text input types the next one. Selecting a suggestion, typing "," / ";",
// pressing Enter, or blurring commits the pending address as a chip (validated +
// deduped) — so no stray trailing comma is ever left behind. Backspace on an empty
// input removes the last chip. Built on a bare positioned list (not base-ui
// Select/popover, which fight free-text typing).
export function RecipientAutocomplete({
  value,
  onChange,
  contacts,
  placeholder,
}: RecipientAutocompleteProps) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (q.length < 1) return [];
    const already = new Set(value.map((v) => v.toLowerCase()));
    return contacts
      .filter(
        (c) =>
          !already.has(c.email.toLowerCase()) &&
          (c.email.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q)),
      )
      .slice(0, MAX_RESULTS);
  }, [contacts, input, value]);

  // Keep the highlight in range as the suggestion list changes (deriving avoids a
  // setState-in-effect); selection/keyboard read this clamped value.
  const safeHighlight = highlight < suggestions.length ? highlight : 0;

  // Close when clicking outside.
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

  const addEmail = (raw: string) => {
    const email = raw.trim().replace(/[,;]+$/, '').trim();
    if (!EMAIL_RE.test(email)) return false;
    if (value.some((v) => v.toLowerCase() === email.toLowerCase())) {
      setInput('');
      return true;
    }
    onChange([...value, email]);
    setInput('');
    return true;
  };

  const removeEmail = (email: string) => {
    onChange(value.filter((v) => v !== email));
  };

  const selectContact = (contact: GmailContact) => {
    addEmail(contact.email);
    setOpen(false);
    inputRef.current?.focus();
  };

  const showDropdown = open && suggestions.length > 0;

  return (
    <div ref={wrapRef} className="relative">
      <div
        className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((email) => (
          <span
            key={email}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
          >
            <span className="truncate">{email}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeEmail(email);
              }}
              aria-label={`Remove ${email}`}
              className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          placeholder={value.length === 0 ? placeholder : ''}
          className="min-w-[8rem] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          onChange={(e) => {
            const v = e.target.value;
            // Typing a separator commits the pending address as a chip.
            if (v.endsWith(',') || v.endsWith(';')) {
              addEmail(v);
            } else {
              setInput(v);
            }
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so a click on a suggestion row registers first.
            blurTimer.current = setTimeout(() => {
              addEmail(input);
              setOpen(false);
            }, 120);
          }}
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
              e.preventDefault(); // don't submit/send
              if (showDropdown) selectContact(suggestions[safeHighlight]);
              else addEmail(input);
              return;
            }
            if (e.key === 'Escape') {
              setOpen(false);
              return;
            }
            // Backspace on an empty input removes the last chip.
            if (e.key === 'Backspace' && input.length === 0 && value.length > 0) {
              e.preventDefault();
              removeEmail(value[value.length - 1]);
            }
          }}
        />
      </div>
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-md border bg-background shadow-md">
          {suggestions.map((c, i) => (
            <button
              key={c.email}
              type="button"
              // onMouseDown (not onClick) so it fires before the input's onBlur.
              onMouseDown={(e) => {
                e.preventDefault();
                if (blurTimer.current) clearTimeout(blurTimer.current);
                selectContact(c);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                'flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-sm',
                i === safeHighlight ? 'bg-muted' : 'hover:bg-muted/60',
              )}
            >
              {c.name && <span className="font-medium leading-tight">{c.name}</span>}
              <span className="text-xs text-muted-foreground leading-tight">{c.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
