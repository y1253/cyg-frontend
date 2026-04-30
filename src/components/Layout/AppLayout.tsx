import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ClipboardList, LayoutDashboard, LogOut, Users2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';

function SideNavLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Top navbar */}
      <header className="h-14 shrink-0 bg-background border-b flex items-center justify-between px-6 z-10">
        <span className="font-bold text-base tracking-tight">CYG Finance</span>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">{user?.name}</span>
          <Badge variant="secondary" className="text-xs">{user?.role}</Badge>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
          >
            <LogOut size={14} />
            Sign out
          </Button>
        </div>
      </header>

      {/* Sidebar + main — flex-1 with min-h-0 so footer is always visible */}
      <div className="flex flex-1 min-h-0">
        <aside className="w-52 shrink-0 bg-background border-r flex flex-col">
          <nav className="flex-1 p-3 flex flex-col gap-1 overflow-y-auto">
            <SideNavLink
              to="/dashboard"
              icon={<LayoutDashboard size={16} />}
              label="Dashboard"
            />
            {isAdmin && (
              <>
                <SideNavLink
                  to="/admin/tasks"
                  icon={<ClipboardList size={16} />}
                  label="Tasks"
                />
                <SideNavLink
                  to="/admin/users"
                  icon={<Users2 size={16} />}
                  label="Users"
                />
              </>
            )}
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto bg-muted/40">
          <Outlet />
        </main>
      </div>

      {/* Footer — always pinned to bottom */}
      <footer className="shrink-0 border-t bg-background px-6 py-2">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground/50 tracking-wide">
          <span>CYG Finance</span>
          <span>© {new Date().getFullYear()} · Bookkeeping Management Platform</span>
        </div>
      </footer>
    </div>
  );
}
