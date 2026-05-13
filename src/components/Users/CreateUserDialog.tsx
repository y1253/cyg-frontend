import { useState } from 'react';
import { useRoles } from '../../hooks/useRoles';
import { useCreateUser } from '../../hooks/useCreateUser';
import { useEnrollFace } from '../../hooks/useEnrollFace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WebcamCapture } from '@/components/ui/WebcamCapture';
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
  const [enrollError, setEnrollError] = useState('');
  const { data: roles = [] } = useRoles();
  const createMutation = useCreateUser();
  const enrollMutation = useEnrollFace();

  function handleOpenChange(val: boolean) {
    onOpenChange(val);
    if (!val) {
      setStep(1);
      setForm(EMPTY_FORM);
      setNewUserId(null);
      setNewUserName('');
      setEnrollError('');
      createMutation.reset();
      enrollMutation.reset();
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

  function handleEnroll(blob: Blob) {
    if (!newUserId) return;
    setEnrollError('');
    enrollMutation.mutate(
      { userId: newUserId, blob },
      { onSuccess: () => handleOpenChange(false) },
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
              {createMutation.isPending ? 'Creating...' : 'Create User →'}
            </Button>
          </form>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4 mt-2">
            <p className="text-sm text-muted-foreground">
              User created. Now capture their face to enable face recognition login. You can skip and enroll later from the user detail page.
            </p>

            {enrollMutation.isPending ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                Enrolling face…
              </div>
            ) : (
              <WebcamCapture
                onCapture={handleEnroll}
                label="Capture & Enroll Face"
                onError={msg => setEnrollError(msg)}
              />
            )}

            {(enrollError || enrollMutation.isError) && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                {enrollError || (enrollMutation.error instanceof Error ? enrollMutation.error.message : 'Enrollment failed. Try again.')}
              </p>
            )}

            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 text-center transition-colors"
            >
              Skip for now
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
