import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { StorageSnapshot, storageApi } from '../lib/api';
import { useAuth } from './AuthContext';

interface StorageValue {
  snapshot: StorageSnapshot | null;
  loading: boolean;
  refresh: () => Promise<void>;
  applySnapshot: (next: StorageSnapshot) => void;
}

const StorageContext = createContext<StorageValue | null>(null);

/**
 * Holds the quota figures for the whole app so the dashboard, sidebar and
 * upload page all update the moment an upload or delete finishes.
 */
export function StorageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<StorageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setSnapshot(await storageApi.snapshot());
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh();
  }, [user, refresh]);

  const applySnapshot = useCallback((next: StorageSnapshot) => setSnapshot(next), []);

  const value = useMemo(
    () => ({ snapshot, loading, refresh, applySnapshot }),
    [snapshot, loading, refresh, applySnapshot],
  );
  return <StorageContext.Provider value={value}>{children}</StorageContext.Provider>;
}

export function useStorage(): StorageValue {
  const ctx = useContext(StorageContext);
  if (!ctx) throw new Error('useStorage must be used inside StorageProvider');
  return ctx;
}
