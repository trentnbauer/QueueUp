import { createContext, useContext, useState, type ReactNode } from 'react';

export type ViewMode = 'artwork' | 'list';

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  artwork: 'Artwork',
  list: 'List',
};

const STORAGE_KEY = 'sq-view-mode';
const DEFAULT_VIEW_MODE: ViewMode = 'artwork';

function isViewMode(value: string | null): value is ViewMode {
  return value === 'artwork' || value === 'list';
}

function readStored(): ViewMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isViewMode(stored) ? stored : DEFAULT_VIEW_MODE;
}

interface ViewModeContextValue {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

const ViewModeContext = createContext<ViewModeContextValue | undefined>(undefined);

/** Artwork grid vs. compact list, for the Personal Shelf and every room (issue #344) - a per-
 * browser display preference, same reasoning as CardDensityContext: this is "how do I want to
 * look at my own games," not something that needs to sync across devices. Defaults to the
 * existing artwork grid, so nobody's layout changes underneath them until they opt in. */
export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>(readStored);

  function setViewMode(mode: ViewMode) {
    localStorage.setItem(STORAGE_KEY, mode);
    setViewModeState(mode);
  }

  return <ViewModeContext.Provider value={{ viewMode, setViewMode }}>{children}</ViewModeContext.Provider>;
}

export function useViewMode() {
  const ctx = useContext(ViewModeContext);
  if (!ctx) throw new Error('useViewMode must be used within ViewModeProvider');
  return ctx;
}
