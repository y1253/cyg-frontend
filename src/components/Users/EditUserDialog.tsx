import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { AppUser } from '../../api/users';
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

interface FormState {
  name: string;
  email: string;
  role: string | null;
  password: string;
}

interface Props {
  user: AppUser | null;
  onOpenChange: (open: boolean) => void;
}

export function EditUserDialog({ user, onOpenChange }: Props) {
  const [form, setForm] = useState<FormState>({ name: '', email: '', role: null, password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const { data: roles = [] } = useRoles();
  const updateMutation = useUpdateUser();

  useEffect(() => {
    if (user) {
      setForm({ name: user.name, email: user.email, role: user.role, password: '' });
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
    const data: Record<string, string> = {
      name: form.name,
      email: form.email,
      role: form.role,
    };
    if (form.password) data.password = form.password;
    updateMutation.mutate(
      { id: user.id, data },
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-password">New Password <span className="text-muted-foreground font-normal">(leave blank to keep current)</span></Label>
            <div className="relative">
              <Input
                id="edit-password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Min. 8 characters"
                minLength={form.password ? 8 : undefined}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
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
