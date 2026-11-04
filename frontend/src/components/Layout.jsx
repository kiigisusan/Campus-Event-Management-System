import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, CalendarCheck, CalendarPlus, CheckSquare, FileBarChart, HelpCircle, LayoutDashboard, LogOut,
  Menu, ScanLine, ScrollText, Shapes, Ticket, Users, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './ui';
import Tour from './Tour';

const Logo = () => (
  <Link to="/" className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-jacaranda-600 to-bloom-600 text-ink-50 shadow-glow-sm"><Ticket className="h-4 w-4" aria-hidden /></span>
    CEMS
  </Link>
);

const NAV = {
  student: [
    { to: '/', label: 'Events', icon: CalendarCheck, end: true },
    { to: '/bookings', label: 'My bookings', icon: Ticket },
  ],
  organizer: [
    { to: '/organizer', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/organizer/events/new', label: 'New event', icon: CalendarPlus },
    { to: '/organizer/scan', label: 'Scan tickets', icon: ScanLine },
    { to: '/organizer/analytics', label: 'Analytics', icon: BarChart3 },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/approvals', label: 'Approvals', icon: CheckSquare },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/catalog', label: 'Categories & venues', icon: Shapes },
    { to: '/admin/reports', label: 'Reports', icon: FileBarChart },
    { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
  ],
};

const linkCls = ({ isActive }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
    isActive ? 'bg-jacaranda-600 text-ink-50 shadow-glow-sm' : 'text-ink-700 hover:bg-ink-100'
  }`;

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-100">Log in</Link>
        <Link to="/register" className="rounded-lg bg-jacaranda-600 px-3 py-2 text-sm font-semibold text-ink-50 shadow-glow-sm hover:bg-jacaranda-700">Sign up</Link>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right leading-tight sm:block">
        <p className="text-sm font-semibold">{user.name}</p>
        <p className="text-xs capitalize text-ink-500">{user.is_super_admin ? 'Super admin' : user.role}</p>
      </div>
      <button onClick={async () => { await logout(); navigate('/'); }} aria-label="Log out"
        className="rounded-lg p-2 text-ink-500 hover:bg-ink-100"><LogOut className="h-5 w-5" /></button>
    </div>
  );
}

/** Top bar for every page; organizers and admins also get a sidebar. */
export function AppShell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const items = user ? NAV[user.role] : NAV.student.slice(0, 1);
  const sidebar = user && user.role !== 'student';

  return (
    <div className="min-h-screen">
      {/* Floating glow blobs behind the page */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
      </div>

      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          {sidebar && (
            <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-2 hover:bg-ink-100 lg:hidden"><Menu className="h-5 w-5" /></button>
          )}
          <Logo />
          {!sidebar && (
            <nav aria-label="Main" className="ml-4 hidden gap-1 sm:flex">
              {items.map((i) => <NavLink key={i.to} to={i.to} end={i.end} className={linkCls}>{i.label}</NavLink>)}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Link to="/help" className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-100">
              <HelpCircle className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Help</span>
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6">
        {sidebar && (
          <>
            <aside className="hidden w-56 shrink-0 lg:block">
              <nav aria-label="Sidebar" className="sticky top-24 flex flex-col gap-1">
                {items.map((i) => <NavLink key={i.to} to={i.to} end={i.end} className={linkCls}><i.icon className="h-4 w-4" aria-hidden />{i.label}</NavLink>)}
              </nav>
            </aside>
            {open && (
              <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setOpen(false)}>
                <div className="absolute inset-0 bg-black/70" />
                <nav aria-label="Sidebar" className="relative h-full w-72 max-w-[85%] bg-surface p-4" onClick={(e) => e.stopPropagation()}>
                  <div className="mb-4 flex items-center justify-between"><Logo />
                    <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 hover:bg-ink-100"><X className="h-5 w-5" /></button>
                  </div>
                  <div className="flex flex-col gap-1">
                    {items.map((i) => <NavLink key={i.to} to={i.to} end={i.end} className={linkCls} onClick={() => setOpen(false)}><i.icon className="h-4 w-4" aria-hidden />{i.label}</NavLink>)}
                  </div>
                </nav>
              </div>
            )}
          </>
        )}
        <main id="main" className="min-w-0 flex-1" key={location.pathname}><Outlet /></main>
      </div>

      {/* Phone bottom bar for students, who have no sidebar. */}
      {!sidebar && user && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-ink-100 bg-surface sm:hidden">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end}
              className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-semibold ${isActive ? 'text-jacaranda-600' : 'text-ink-500'}`}>
              <i.icon className="h-5 w-5" aria-hidden />{i.label}
            </NavLink>
          ))}
        </nav>
      )}
      {user && <Tour role={user.role} />}
    </div>
  );
}

/** Wraps routes that need a login and (optionally) a role. */
export function RequireRole({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return <Outlet />;
}