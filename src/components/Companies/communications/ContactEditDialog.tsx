import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toE164 } from '@/lib/phone';
import type { Contact, ContactInput } from '@/api/contacts';

/**
 * Add or edit one contact.
 *
 * The form is a SEPARATE inner component mounted under a key, rather than one component
 * resyncing its fields from props in an effect. Same reason `DialPad` is keyed on the
 * call sid: the fields' initial values are the identity of what is being edited, so
 * remounting is the whole reset — no effect, no stale draft resumed when the dialog is
 * reopened on a different row, and nothing for the `set-state-in-effect` lint rule to
 * object to.
 */
export function ContactEditDialog({
  open,
  onOpenChange,
  contact,
  onSave,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null when adding. */
  contact: Contact | null;
  onSave: (data: ContactInput) => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{contact ? 'Edit contact' : 'New contact'}</DialogTitle>
        </DialogHeader>
        {open && (
          <ContactForm
            key={contact?.id ?? 'new'}
            contact={contact}
            onSave={onSave}
            onCancel={() => onOpenChange(false)}
            pending={pending}
            error={error}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContactForm({
  contact,
  onSave,
  onCancel,
  pending,
  error,
}: {
  contact: Contact | null;
  onSave: (data: ContactInput) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(contact?.name ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [note, setNote] = useState(contact?.note ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) {
      setLocalError('Give this contact a name.');
      return;
    }
    if (!phone.trim()) {
      setLocalError('Give this contact a phone number.');
      return;
    }
    setLocalError(null);
    onSave({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      note: note.trim() || null,
    });
  };

  /**
   * Validated with the SAME function the server normalises with — but this is a WARNING,
   * not a block. The server stores an unmatched number happily, and refusing
   * "ext. 4021" would make the address book useless for exactly the numbers people most
   * need reminding of. What the warning buys is that somebody typing a number they
   * expect to see on an incoming call finds out now rather than three weeks later.
   */
  const unmatchable = phone.trim() !== '' && toE164(phone) === null;

  return (
    <div className="flex flex-col gap-4">
      {contact?.autoSource && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This contact comes from the company&apos;s Details tab. Saving the Contact or
          Accountant section there will overwrite these changes.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-name">Name</Label>
        <Input
          id="contact-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dana Fisher"
          autoComplete="off"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-phone">Phone</Label>
        <Input
          id="contact-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="(438) 256-1210"
          autoComplete="off"
          inputMode="tel"
        />
        {unmatchable && (
          <p className="text-xs text-amber-700">
            We can save this, but it will not put a name on incoming calls. Add the
            country code (for example +1) if you want it matched.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-email">Email (optional)</Label>
        <Input
          id="contact-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="dana@example.com"
          autoComplete="off"
          inputMode="email"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-note">Note (optional)</Label>
        <Textarea
          id="contact-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Prefers a call after 2pm"
          rows={2}
        />
      </div>
      {(localError || error) && (
        <p className="text-xs text-destructive">{localError ?? error}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={pending} onClick={submit}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
