import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { GmailContact } from '@/api/gmail';

interface RecipientAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  contacts: GmailContact[];
  placeholder?: string;
}

const MAX_RESULTS = 8;

// A Gmail-style recipient input: a plain <Input> with an absolutely-positioned
// suggestion dropdown filtered from past contacts. Operates on the LAST
// comma-separated token so it works for multi-address To/CC fields. Built on a
// bare positioned list (not base-ui Select/popover, which fight free-text typing).
export function RecipientAutocomplete({
  value,
  onChange,
  contacts,
  placeholder,
}: RecipientAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The active token = text after the last comma (the recipient being typed).
  const active = useMemo(() => {
    const parts = value.split(',');
    return parts[parts.length - 1].trim();
  }, [value]);

  const suggestions = useMemo(() => {
    const q = active.toLowerCase();
    if (q.length < 1) return [];
    return contacts
      .filter(
        (c) =>
          c.email.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q),
      )
      .slice(0, MAX_RESULTS);
  }, [contacts, active]);

  // Keep the highlight in range as the suggestion list changes (deriving avoids
  // a setState-in-effect); selection/keyboard read this clamped value.
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

  const select = (contact: GmailContact) => {
    const parts = value.split(',');
    parts[parts.length - 1] = ` ${contact.email}`;
    // Append ", " so the user can immediately type the next recipient.
    onChange(parts.join(',').trimStart() + ', ');
    setOpen(false);
  };

  const showDropdown = open && suggestions.length > 0;

  return (
    <div ref={wrapRef} className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so a click on a suggestion row registers first.
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (!showDropdown) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((safeHighlight + 1) % suggestions.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((safeHighlight - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === 'Enter') {
            e.preventDefault(); // don't submit/send
            select(suggestions[safeHighlight]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
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
                select(c);
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
