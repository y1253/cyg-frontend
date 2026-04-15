import { useState } from 'react';
import { useUsers } from '../../hooks/useUsers';
import { useDeleteUser } from '../../hooks/useDeleteUser';
import type { AppUser } from '../../api/users';
import { Button } from '@/components/ui/button';
import { UserTable } from './UserTable';
import { CreateUserDialog } from './CreateUserDialog';
import { EditUserDialog } from './EditUserDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function UsersPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AppUser | null>(null);

  const { data: users = [], isLoading } = useUsers();
  const deleteMutation = useDeleteUser();

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

      <UserTable
        users={users}
        isLoading={isLoading}
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
