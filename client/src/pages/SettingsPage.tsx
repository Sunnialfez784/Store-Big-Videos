import { useNavigate } from 'react-router-dom';
import { LogOut, Moon, Sun } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useStorage } from '../context/StorageContext';
import { formatBytes } from '../lib/format';

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { snapshot } = useStorage();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="muted mt-1 text-sm">Account and appearance.</p>
      </div>

      <Card className="p-5">
        <h2 className="font-display text-base font-semibold">Account</h2>
        <dl className="mt-3 space-y-2.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="muted">Name</dt>
            <dd className="truncate">{user?.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="muted">Email</dt>
            <dd className="truncate">{user?.email}</dd>
          </div>
          {snapshot && (
            <div className="flex justify-between gap-4">
              <dt className="muted">Library</dt>
              <dd className="tnum">
                {snapshot.videoCount} videos · {formatBytes(snapshot.usedBytes)}
              </dd>
            </div>
          )}
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-base font-semibold">Appearance</h2>
        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="muted text-sm">Currently using the {theme} theme.</p>
          <Button variant="secondary" size="sm" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            Switch to {theme === 'dark' ? 'light' : 'dark'}
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-base font-semibold">Session</h2>
        <p className="muted mt-1.5 text-sm">
          Logging out clears your session cookie on this device. Your videos stay where they are.
        </p>
        <Button
          variant="danger"
          className="mt-4"
          onClick={async () => {
            await signOut();
            navigate('/login', { replace: true });
          }}
        >
          <LogOut size={16} /> Log out
        </Button>
      </Card>
    </div>
  );
}
