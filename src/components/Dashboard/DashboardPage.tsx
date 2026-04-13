import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="bg-background border-b h-16 flex items-center justify-between px-6">
        <span className="font-bold text-lg">CYG Finance</span>
        <div className="flex items-center gap-3">
          {user?.role === 'ADMIN' && (
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/users')}>
              Manage Users
            </Button>
          )}
          <span className="text-sm text-muted-foreground">{user?.name}</span>
          <Badge variant="secondary">{user?.role}</Badge>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="p-8">
        <h2 className="text-2xl font-semibold mb-1">Welcome back, {user?.name}</h2>
        <p className="text-muted-foreground">Dashboard coming soon — clients, tasks, and more.</p>
      </main>
    </div>
  );
}
