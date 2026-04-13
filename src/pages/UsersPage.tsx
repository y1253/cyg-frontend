import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchRoles, fetchUsers, createUser } from '../api/users';
import type { AppUser } from '../api/users';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

export function UsersPage() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    void fetchUsers(token).then(setUsers);
    void fetchRoles(token).then(setRoles);
  }, [token]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !form.role) return;
    setSubmitting(true);
    setError('');
    try {
      const created = await createUser(token, {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
      });
      setUsers(prev => [created, ...prev]);
      setOpen(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val) {
      setForm(EMPTY_FORM);
      setError('');
    }
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="bg-background border-b h-16 flex items-center justify-between px-6">
        <span className="font-bold text-lg">CYG Finance</span>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            Dashboard
          </Button>
          <span className="text-sm text-muted-foreground">{user?.name}</span>
          <Badge variant="secondary">{user?.role}</Badge>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold">Users</h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              Manage team members and their roles.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>Add User</Button>
        </div>

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

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={submitting || !form.role}
                className="mt-1"
              >
                {submitting ? 'Creating...' : 'Create User'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <div className="rounded-md border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'}>
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
