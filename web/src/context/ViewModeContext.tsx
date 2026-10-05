import { createContext, useContext, useState, type ReactNode } from 'react';
import { t } from '../i18n';
import { useIsMobile } from '../ui/useLayout';

export type ViewMode = 'artwork' | 'list';

// Getters, so each read follows the current language.
export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  get artwork() {
    return t('shell.viewMode.artwork');
  },
  get list() {
    return t('shell.viewMode.list');
  },
};

const STORAGE_KEY = 'sq-view-mode';
const MOBILE_STORAGE_KEY = 'sq-view-mode-mobile';
const DEFAULT_VIEW_MODE: ViewMode = 'list';

function isViewMode(value: string | null): value is ViewMode {
  return value === 'artwork' || value === 'list';
}

function read(key: string): ViewMode | null {
  try {
    const stored = localStorage.getItem(key);
    return isViewMode(stored) ? stored : null;
  } catch {
    return null;
  }
}


interface ViewModeContextValue {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

const ViewModeContext = createContext<ViewModeContextValue | undefined>(undefined);

/** Artwork grid vs. compact list, for the Personal Shelf and every room (issue #344) - a per-
 * browser display preference, same reasoning as CardDensityContext: this is "how do I want to
 * look at my own games," not something that needs to sync across devices. Kept separately for the
 * phone layout and the desktop layout (the same browser can be either, depending on window width),
 * so someone can run covers on a desktop and a compact list on their phone. */
export function ViewModeProvider({ children }: { children: ReactNode }) {
  const mobile = useIsMobile();
  const [desktopMode, setDesktopMode] = useState<ViewMode>(() => read(STORAGE_KEY) ?? DEFAULT_VIEW_MODE);
  // The phone layout has its own choice; until one is made it follows the desktop one, so
  // nobody's existing layout changes underneath them.
  const [mobileMode, setMobileMode] = useState<ViewMode | null>(() => read(MOBILE_STORAGE_KEY));
  const viewMode = mobile ? (mobileMode ?? desktopMode) : desktopMode;

  function setViewMode(mode: ViewMode) {
    try {
      localStorage.setItem(mobile ? MOBILE_STORAGE_KEY : STORAGE_KEY, mode);
    } catch {
      // Private mode / blocked storage: still applies for this session.
    }
    (mobile ? setMobileMode : setDesktopMode)(mode);
  }

  return <ViewModeContext.Provider value={{ viewMode, setViewMode }}>{children}</ViewModeContext.Provider>;
}

export function useViewMode() {
  const ctx = useContext(ViewModeContext);
  if (!ctx) throw new Error('useViewMode must be used within ViewModeProvider');
  return ctx;
}
