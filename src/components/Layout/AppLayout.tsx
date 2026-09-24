import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Archive,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  User,
  Users2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { canManage, isSuperAdmin } from '@/lib/roles';
import { NotificationProvider } from '@/context/NotificationContext';
import { NotificationBell } from '@/components/Layout/NotificationBell';
import { MissedCallsIndicator } from '@/components/Layout/MissedCallsIndicator';
import { SoftphoneStatus } from '@/components/Phone/SoftphoneStatus';
import { ComposerRouteWatcher } from '@/components/Layout/ComposerRouteWatcher';
import { SoftphoneProvider } from '@/context/SoftphoneContext';

/**
 * The navigation, declared ONCE.
 *
 * Three surfaces render it — the phone drawer, the tablet rail and the desktop sidebar —
 * and they must not drift: a link added to one and forgotten in the others is invisible
 * on exactly the devices nobody tests on. `short` is the rail's label, which sits under a
 * 18px icon and has ~56px to work with.
 */
interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  short: string;
  /** 'admin' = ADMIN or MANAGER; 'super' = ADMIN only. Mirrors router.tsx's guards. */
  tier?: 'admin' | 'super';
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/dashboard',
    icon: <LayoutDashboard size={16} />,
    label: 'Dashboard',
    short: 'Dash',
  },
  {
    to: '/admin/tasks',
    icon: <ClipboardList size={16} />,
    label: 'Tasks',
    short: 'Tasks',
    tier: 'super',
  },
  {
    to: '/admin/users',
    icon: <Users2 size={16} />,
    label: 'Users',
    short: 'Users',
    tier: 'admin',
  },
  {
    to: '/admin/company-settings',
    icon: <Settings size={16} />,
    label: 'Company Settings',
    short: 'Settings',
    tier: 'super',
  },
  {
    to: '/admin/archived',
    icon: <Archive size={16} />,
    label: 'Archived',
    short: 'Archive',
    tier: 'admin',
  },
  // No `tier`, deliberately: this is the one entry every role sees. It is also the only
  // route here whose page is scoped by the JWT rather than by a guard, so there is
  // nothing for a tier to protect.
  {
    to: '/profile',
    icon: <User size={16} />,
    label: 'My Profile',
    short: 'Me',
  },
];

/**
 * One nav row.
 *
 * ⚠️ `h-11` (44px) on the drawer variant, not the desktop `py-2` (~36px). Below `md` every
 * target is thumb-sized; the desktop rows keep their density because a mouse does not need
 * the slack and the sidebar would otherwise gain 40px of height for nothing.
 */
function SideNavLink({
  item,
  variant,
  onNavigate,
}: {
  item: NavItem;
  variant: 'drawer' | 'rail' | 'sidebar';
  onNavigate?: () => void;
}) {
  const base =
    variant === 'rail'
      ? 'flex h-14 flex-col items-center justify-center gap-0.5 rounded-md text-[9px] font-medium transition-colors'
      : variant === 'drawer'
        ? 'flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors'
        : 'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors';

  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={variant === 'rail' ? item.label : undefined}
      className={({ isActive }) =>
        `${base} ${
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`
      }
    >
      {item.icon}
      {variant === 'rail' ? item.short : item.label}
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
  const location = useLocation();
  /**
   * The path the drawer was opened on — NOT an open/closed boolean.
   *
   * Closing on navigation is then derived rather than an effect that calls setState on
   * every route change (which cascades a render, and which the lint rule rightly
   * refuses). Tapping a link to the page you are already on does not change the path, so
   * those links clear this explicitly via `onNavigate`.
   */
  const [openedOn, setOpenedOn] = useState<string | null>(null);

  // Two tiers: managers get Users and Archived, admins additionally get the
  // firm-wide Tasks and Company Settings pages. Mirrors router.tsx's
  // AdminRoute / SuperAdminRoute split, which is the real gate.
  const showAdminNav = canManage(user);
  const showSuperAdminNav = isSuperAdmin(user);
  const items = NAV_ITEMS.filter((item) =>
    item.tier === 'super'
      ? showSuperAdminNav
      : item.tier === 'admin'
        ? showAdminNav
        : true,
  );

  // Derived, so a notification or a call card navigating underneath the drawer closes it
  // too — neither of those passes through a link's click handler.
  const drawerOpen = openedOn === location.pathname;
  const openDrawer = () => setOpenedOn(location.pathname);
  const closeDrawer = () => setOpenedOn(null);

  // A drawer over a scrolling page scrolls the page behind it on iOS.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const initials = (user?.name ?? '?')
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    // `dvh`, not `vh`: a mobile URL bar makes them differ, and the difference is exactly
    // the footer — which `h-screen` would push under the browser chrome.
    <div className="flex h-dvh flex-col">
      {/* Top navbar */}
      <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b bg-background pl-1 pr-2 md:px-6">
        <div className="flex min-w-0 items-center gap-1">
          {/* Below `md` the sidebar is off-canvas, so the header carries its handle. */}
          <button
            type="button"
            onClick={openDrawer}
            aria-label="Open navigation"
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted md:hidden"
          >
            <Menu size={20} />
          </button>
          <span className="truncate text-base font-bold tracking-tight">
            CYG Finance
          </span>
        </div>

        {/* Centred on the header itself, not between the two groups — absolute so the
            existing flex children keep their sizes and nothing reflows when the pill
            appears or goes away.

            ⚠️ `pointer-events-none` on the wrapper is load-bearing: this strip spans the
            header's full height across the middle, and without it would swallow clicks
            aimed at the title or the identity block for the whole time the count is
            zero and nothing is drawn here.

            ⚠️ `lg`, not `md`. Absolute positioning cannot push anything out of the way,
            so the centre has to be genuinely clear — and at `md` the identity block
            (name, role, softphone, bell, Sign out) already reaches back past it, which
            would put the pill underneath somebody's name. Below `lg` the compact pill
            beside the bell is the answer instead. */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden -translate-x-1/2 items-center lg:flex">
          <span className="pointer-events-auto">
            <MissedCallsIndicator variant="full" />
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1 md:gap-3">
          {/* Identity moves into the drawer on a phone — the name, the role badge and a
              full "Sign out" button cannot share 390px with the bell and still leave the
              bell a 44px target. */}
          {/* The name is the second way to your own profile, beside the nav entry — the
              place people reach for first. A NavLink rather than a menu: there is no
              dropdown primitive in components/ui, and one item does not need one. */}
          <NavLink
            to="/profile"
            className="hidden rounded px-1 text-sm font-medium hover:underline md:inline"
          >
            {user?.name}
          </NavLink>
          <Badge variant="secondary" className="hidden text-xs md:inline-flex">
            {user?.role}
          </Badge>
          {/* ⚠️ No longer hidden below `md`. It was a status pill, which a phone could
              afford to drop; it is now also the colleague dialer, and hiding the only
              way to place a staff call on the device most likely to be placing one is
              the wrong trade. It sheds its own text below `sm` instead. */}
          <SoftphoneStatus />
          {/* Everything below `lg`: a phone has no room to centre anything, and a
              tablet's centre is already occupied (see above). */}
          <span className="lg:hidden">
            <MissedCallsIndicator variant="compact" />
          </span>
          <NotificationBell />
          <Button
            variant="ghost"
            size="sm"
            className="hidden gap-1.5 text-muted-foreground hover:text-foreground md:inline-flex"
            onClick={handleLogout}
          >
            <LogOut size={14} />
            Sign out
          </Button>
          {/* The phone's stand-in for the identity block: it opens the same drawer, so
              there is a second, larger way in beside the hamburger. */}
          <button
            type="button"
            onClick={openDrawer}
            aria-label="Open navigation"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-teal-300 bg-teal-50 text-[11px] font-semibold text-teal-800 md:hidden"
          >
            {initials}
          </button>
        </div>
      </header>

      {/* Sidebar + main — flex-1 with min-h-0 so footer is always visible */}
      <div className="flex min-h-0 flex-1">
        {/* Tablet rail (md) widening to the full sidebar (lg). Hidden on a phone, where
            the same links render in the drawer below. */}
        <aside className="hidden w-[72px] shrink-0 flex-col border-r bg-background md:flex lg:w-52">
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 lg:p-3">
            {items.map((item) => (
              <span key={item.to}>
                <span className="lg:hidden">
                  <SideNavLink item={item} variant="rail" />
                </span>
                <span className="hidden lg:block">
                  <SideNavLink item={item} variant="sidebar" />
                </span>
              </span>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto bg-muted/40">
          <Outlet />
        </main>
      </div>

      {/* Footer — always pinned to bottom. Hidden on a phone: it is decorative, and 30px
          of copyright is 30px not spent on the list the user came for. */}
      <footer className="hidden shrink-0 border-t bg-background px-6 py-2 md:block">
        <div className="flex items-center justify-between text-[10px] tracking-wide text-muted-foreground/50">
          <span>CYG Finance</span>
          <span>© {new Date().getFullYear()} · Bookkeeping Management Platform</span>
        </div>
      </footer>

      {/* ── Phone navigation drawer ─────────────────────────────────────────────
          Rendered only while open, so its overlay cannot swallow taps on a desktop
          where it is invisible. `md:hidden` as well, because a resize past the
          breakpoint while it is open would otherwise leave it stranded over the rail. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={closeDrawer}
            className="absolute inset-0 bg-foreground/45"
          />
          <div className="absolute inset-y-0 left-0 flex w-[276px] max-w-[85vw] flex-col border-r bg-background shadow-2xl">
            <div className="flex h-14 shrink-0 items-center justify-between border-b pl-4 pr-1">
              <span className="text-base font-bold tracking-tight">CYG Finance</span>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Close navigation"
                className="flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>

            {/* The identity block the header gave up */}
            <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-teal-300 bg-teal-50 text-[13px] font-semibold text-teal-800">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                {/* Only the NAME is the link, not the whole row: `SoftphoneStatus`
                    below is a popover trigger, and nesting a button inside an anchor
                    is invalid and swallows its clicks. */}
                <NavLink
                  to="/profile"
                  onClick={closeDrawer}
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {user?.name}
                </NavLink>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    {user?.role}
                  </Badge>
                  <SoftphoneStatus />
                </div>
              </div>
            </div>

            <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
              {items.map((item) => (
                <SideNavLink
                  key={item.to}
                  item={item}
                  variant="drawer"
                  onNavigate={closeDrawer}
                />
              ))}
            </nav>

            {/* Pinned away from the nav: the one action here that cannot be undone
                by tapping something else. */}
            <div className="shrink-0 border-t p-3">
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
