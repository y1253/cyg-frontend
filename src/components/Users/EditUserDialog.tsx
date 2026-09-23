import { useEffect, useState } from 'react';
import { roleLabel, type AppUser } from '../../api/users';
import { selectItems } from '@/lib/select-items';
import { useRoles } from '../../hooks/useRoles';
import { useUpdateUser } from '../../hooks/useUpdateUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatE164 } from '@/lib/phone';
import { maskPhoneInput, phoneErrorFor, phoneForSubmit } from './user-phone';

interface FormState {
  name: string;
  email: string;
  role: string | null;
  phone: string;
}

interface Props {
  user: AppUser | null;
  onOpenChange: (open: boolean) => void;
}

export function EditUserDialog({ user, onOpenChange }: Props) {
  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    role: null,
    phone: '',
  });
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const { data: roles = [] } = useRoles();
  const updateMutation = useUpdateUser();

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name,
        email: user.email,
        role: user.role,
        // Seeded READABLE, not raw E.164 -- `toE164` on submit puts it back. Showing
        // `+15145550123` in an editable box invites somebody to "tidy" the plus away.
        phone: formatE164(user.phoneE164),
      });
      setPhoneError(null);
      updateMutation.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function handleOpenChange(val: boolean) {
    onOpenChange(val);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.role) return;
    const err = phoneErrorFor(form.phone);
    setPhoneError(err);
    if (err) return;
    updateMutation.mutate(
      {
        id: user.id,
        data: {
          name: form.name,
          email: form.email,
          role: form.role,
          // ALWAYS sent, and `null` when the box is empty -- that is what clears the
          // number. Omitting the key would mean "leave it alone", so an admin could never
          // remove a mobile once it was saved.
          phoneE164: phoneForSubmit(form.phone),
        },
      },
      { onSuccess: () => handleOpenChange(false) },
    );
  }

  return (
    <Dialog open={!!user} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-phone">Phone (optional)</Label>
            <Input
              id="edit-phone"
              type="tel"
              value={form.phone}
              onChange={e => {
                setForm(f => ({ ...f, phone: maskPhoneInput(e.target.value) }));
                setPhoneError(null);
              }}
              placeholder="514-555-0123"
            />
            <p className="text-xs text-muted-foreground">
              For the staff directory. Calls are not routed to it.
            </p>
            {phoneError && <p className="text-sm text-destructive">{phoneError}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Role</Label>
            <Select
              items={selectItems(roles, r => r, roleLabel)}
              value={form.role}
              onValueChange={val => setForm(f => ({ ...f, role: val }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map(r => (
                  <SelectItem key={r} value={r}>
                    {roleLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {updateMutation.isError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {updateMutation.error instanceof Error
                ? updateMutation.error.message
                : 'Something went wrong'}
            </p>
          )}

          <Button
            type="submit"
            disabled={updateMutation.isPending || !form.role}
            className="mt-1"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
