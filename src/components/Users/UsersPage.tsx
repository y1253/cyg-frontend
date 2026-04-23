import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useUsers } from '../../hooks/useUsers';
import { useDeleteUser } from '../../hooks/useDeleteUser';
import type { AppUser } from '../../api/users';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserTable } from './UserTable';
import { CreateUserDialog } from './CreateUserDialog';
import { EditUserDialog } from './EditUserDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type RoleFilter = 'ALL' | 'ADMIN' | 'USER';

export function UsersPage() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AppUser | null>(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');

  const { data: users = [], isLoading } = useUsers();
  const deleteMutation = useDeleteUser();

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      if (q) {
        const matchesName = u.name.toLowerCase().includes(q);
        const matchesEmail = u.email.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail) return false;
      }
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      return true;
    });
  }, [users, search, roleFilter]);

  const isFiltered = search.trim() !== '' || roleFilter !== 'ALL';

  function handleDeleteConfirm() {
    if (!deleteUser) return;
    deleteMutation.mutate(deleteUser.id, {
      onSuccess: () => setDeleteUser(null),
    });
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Users</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage team members and their roles.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Add User</Button>
      </div>

      {/* Search + role filter */}
      {!isLoading && users.length > 0 && (
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={roleFilter}
            onValueChange={v => setRoleFilter((v ?? 'ALL') as RoleFilter)}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All roles</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
              <SelectItem value="USER">User</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <UserTable
        users={filteredUsers}
        isLoading={isLoading}
        emptyMessage={isFiltered ? 'No users match your search.' : undefined}
        onView={u => navigate(`/admin/users/${u.id}`)}
        onEdit={setEditUser}
        onDelete={setDeleteUser}
      />

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />

      <EditUserDialog user={editUser} onOpenChange={open => { if (!open) setEditUser(null); }} />

      <Dialog open={!!deleteUser} onOpenChange={open => { if (!open) setDeleteUser(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{' '}
            <span className="font-medium text-foreground">{deleteUser?.name}</span>? This action cannot be undone.
          </p>
          {deleteMutation.isError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {deleteMutation.error instanceof Error
                ? deleteMutation.error.message
                : 'Something went wrong'}
            </p>
          )}
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteUser(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={handleDeleteConfirm}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
