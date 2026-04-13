import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useUsers } from '../../hooks/useUsers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserTable } from './UserTable';
import { CreateUserDialog } from './CreateUserDialog';

export function UsersPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: users = [], isLoading } = useUsers();

  function handleLogout() {
    logout();
    navigate('/login');
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
          <Button onClick={() => setDialogOpen(true)}>Add User</Button>
        </div>

        <UserTable users={users} isLoading={isLoading} />

        <CreateUserDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </main>
    </div>
  );
}
