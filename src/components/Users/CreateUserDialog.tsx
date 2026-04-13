import { useState } from 'react';
import { useRoles } from '../../hooks/useRoles';
import { useCreateUser } from '../../hooks/useCreateUser';
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

interface FormState {
  name: string;
  email: string;
  password: string;
  role: string | null;
}

const EMPTY_FORM: FormState = { name: '', email: '', password: '', role: null };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserDialog({ open, onOpenChange }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const { data: roles = [] } = useRoles();
  const createMutation = useCreateUser();

  function handleOpenChange(val: boolean) {
    onOpenChange(val);
    if (!val) {
      setForm(EMPTY_FORM);
      createMutation.reset();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.role) return;
    createMutation.mutate(
      { name: form.name, email: form.email, password: form.password, role: form.role },
      { onSuccess: () => handleOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Jane Smith"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="jane@cygfinance.com"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Min. 8 characters"
              required
              minLength={8}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Role</Label>
            <Select
              value={form.role}
              onValueChange={val => setForm(f => ({ ...f, role: val }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map(r => (
                  <SelectItem key={r} value={r}>
                    {r.charAt(0) + r.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {createMutation.isError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : 'Something went wrong'}
            </p>
          )}

          <Button
            type="submit"
            disabled={createMutation.isPending || !form.role}
            className="mt-1"
          >
            {createMutation.isPending ? 'Creating...' : 'Create User'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
