import { useState } from 'react';
import { roleLabel } from '../../api/users';
import { selectItems } from '@/lib/select-items';
import { useRoles } from '../../hooks/useRoles';
import { FaceEnrollFlow } from './FaceEnrollFlow';
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
  role: string | null;
}

const EMPTY_FORM: FormState = { name: '', email: '', role: null };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserDialog({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [newUserId, setNewUserId] = useState<number | null>(null);
  const [newUserName, setNewUserName] = useState('');
  const { data: roles = [] } = useRoles();
  const createMutation = useCreateUser();

  function handleOpenChange(val: boolean) {
    onOpenChange(val);
    if (!val) {
      setStep(1);
      setForm(EMPTY_FORM);
      setNewUserId(null);
      setNewUserName('');
      createMutation.reset();
    }
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.role) return;
    createMutation.mutate(
      { name: form.name, email: form.email, role: form.role },
      {
        onSuccess: (user) => {
          setNewUserId(user.id);
          setNewUserName(user.name);
          setStep(2);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? 'Add New User' : `Enroll Face for ${newUserName}`}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <form onSubmit={handleCreateSubmit} className="flex flex-col gap-4 mt-2">
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
              {createMutation.isPending ? 'Creating...' : 'Create User →'}
            </Button>
          </form>
        )}

        {step === 2 && newUserId !== null && (
          <div className="flex flex-col gap-4 mt-2">
            <p className="text-sm text-muted-foreground">
              User created. Capture 3 photos to enable face recognition login. You can skip and enroll later from the user detail page.
            </p>

            <FaceEnrollFlow
              userId={newUserId}
              onSuccess={() => handleOpenChange(false)}
              onSkip={() => handleOpenChange(false)}
            />
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
