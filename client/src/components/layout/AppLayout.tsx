import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Film, UploadCloud, HardDrive, Settings, LogOut, Menu, X, Sun, Moon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useStorage } from '../../context/StorageContext';
import { useToast } from '../../context/ToastContext';
import { formatBytes } from '../../lib/format';
import { CapacityMeter } from '../CapacityMeter';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/videos', label: 'My videos', icon: Film, end: false },
  { to: '/upload', label: 'Upload video', icon: UploadCloud, end: false },
  { to: '/storage', label: 'Storage', icon: HardDrive, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { snapshot } = useStorage();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    notify('Signed out.', 'info');
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-tungsten-500 text-ink-900">
          <Film size={17} />
        </span>
        <span className="font-display text-lg font-bold tracking-tight">VaultReel</span>
        <button
          className="muted ml-auto rounded p-1 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setNavOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-tungsten-500/12 font-medium text-tungsten-600 dark:text-tungsten-400'
                  : 'muted hover:bg-mist-200 dark:hover:bg-ink-700'
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      {snapshot && (
        <div className="mx-3 mb-3 rounded-lg border border-mist-200 p-3 dark:border-ink-700">
          <CapacityMeter snapshot={snapshot} compact />
          <p className="muted tnum mt-2 text-xs">
            {formatBytes(snapshot.availableBytes)} free of {formatBytes(snapshot.totalBytes)}
          </p>
        </div>
      )}

      <button
        onClick={handleSignOut}
        className="muted mx-3 mb-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-mist-200 dark:hover:bg-ink-700"
      >
        <LogOut size={17} />
        Log out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop rail */}
      <aside className="hidden w-60 shrink-0 border-r border-mist-200 bg-mist-50 lg:block dark:border-ink-700 dark:bg-ink-800">
        <div className="sticky top-0 h-screen">{sidebar}</div>
      </aside>

      {/* Mobile drawer */}
      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-ink-900/70" onClick={() => setNavOpen(false)} aria-label="Close menu" />
          <aside className="relative h-full w-64 border-r border-mist-200 bg-mist-50 dark:border-ink-700 dark:bg-ink-800">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-mist-200 bg-mist-100/90 px-4 py-3 backdrop-blur lg:px-8 dark:border-ink-700 dark:bg-ink-900/90">
          <button
            className="muted rounded p-1.5 hover:bg-mist-200 lg:hidden dark:hover:bg-ink-700"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          <p className="muted truncate text-sm">
            Signed in as <span className="text-ink-900 dark:text-mist-100">{user?.email}</span>
          </p>

          <button
            onClick={toggleTheme}
            className="muted ml-auto rounded-lg p-2 hover:bg-mist-200 dark:hover:bg-ink-700"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
