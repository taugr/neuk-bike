'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { resolveUnits, unitsStorageKey, type UnitSystem } from '@/lib/units';
const UnitsContext = createContext<{
  units: UnitSystem;
  setUnits: (units: UnitSystem) => void;
} | null>(null);
export function UnitsProvider({ children }: { children: ReactNode }) {
  const [units, setUnitsState] = useState<UnitSystem>('metric');
  useEffect(() => {
    try {
      setUnitsState(resolveUnits(localStorage.getItem(unitsStorageKey)));
    } catch {
      /* Metric remains available when storage is blocked. */
    }
    const sync = (event: StorageEvent) => {
      if (event.key === unitsStorageKey || event.key === null)
        setUnitsState(resolveUnits(event.newValue));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  function setUnits(next: UnitSystem) {
    const value = resolveUnits(next);
    setUnitsState(value);
    try {
      localStorage.setItem(unitsStorageKey, value);
    } catch {
      /* Keep this visit's preference without persistent storage. */
    }
  }
  return (
    <UnitsContext.Provider value={{ units, setUnits }}>
      {children}
    </UnitsContext.Provider>
  );
}
export function useUnits() {
  const context = useContext(UnitsContext);
  if (!context) throw new Error('useUnits must be used inside UnitsProvider.');
  return context;
}
