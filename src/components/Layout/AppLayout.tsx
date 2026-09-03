import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Archive, ClipboardList, LayoutDashboard, LogOut, Settings, Users2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { canManage, isSuperAdmin } from '@/lib/roles';
import { NotificationProvider } from '@/context/NotificationContext';
import { NotificationBell } from '@/components/Layout/NotificationBell';
import { SoftphoneStatus } from '@/components/Phone/SoftphoneStatus';
import { ComposerRouteWatcher } from '@/components/Layout/ComposerRouteWatcher';
import { SoftphoneProvider } from '@/context/SoftphoneContext';

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
  // The notification provider lives here rather than in App.tsx: it needs the router
  // for notification click-through, it should only run for authenticated routes, and
  // unmounting on logout is what closes its message stream. The shell is a child so
  // it (and the bell) can consume the context.
  return (
    <NotificationProvider>
      {/* Same reason as the provider above: it needs the router, so it can't live
          beside ComposerProvider in App.tsx. */}
      <ComposerRouteWatcher />
      {/* Registers the browser as a phone on mount — no button, nothing to type.
          Here rather than in App.tsx for the same three reasons as the notification
          provider: it needs the router (the call popup links to the company), it must
          only run for authenticated routes, and unmounting on logout is what
          deregisters it. Being a pathless layout route is also what keeps a live call
          alive while the user navigates between companies — only the <Outlet /> below
          is swapped. */}
      <SoftphoneProvider>
        <AppShell />
      </SoftphoneProvider>
    </NotificationProvider>
  );
}

function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // Two tiers: managers get Users and Archived, admins additionally get the
  // firm-wide Tasks and Company Settings pages. Mirrors router.tsx's
  // AdminRoute / SuperAdminRoute split, which is the real gate.
  const showAdminNav = canManage(user);
  const showSuperAdminNav = isSuperAdmin(user);

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
          <SoftphoneStatus />
          <NotificationBell />
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
            {showSuperAdminNav && (
              <SideNavLink
                to="/admin/tasks"
                icon={<ClipboardList size={16} />}
                label="Tasks"
              />
            )}
            {showAdminNav && (
              <SideNavLink
                to="/admin/users"
                icon={<Users2 size={16} />}
                label="Users"
              />
            )}
            {showSuperAdminNav && (
              <SideNavLink
                to="/admin/company-settings"
                icon={<Settings size={16} />}
                label="Company Settings"
              />
            )}
            {showAdminNav && (
              <SideNavLink
                to="/admin/archived"
                icon={<Archive size={16} />}
                label="Archived"
              />
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
